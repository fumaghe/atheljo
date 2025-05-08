import { useState, useEffect, useMemo } from 'react'
import { Database, TrendingUp, TrendingDown, Users, Activity, BarChart2 } from 'lucide-react'
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  QueryDocumentSnapshot
} from 'firebase/firestore'
import firestore from '../../../firebaseClient'
import { format, subDays } from 'date-fns'
import {
  CapacityData,
  SystemData,
  TelemetryData,
  AggregatedStats,
  FilterSelections,
  FilterOptions,
  BusinessMetric
} from '../types'
import { calculateSystemHealthScore } from '../../../utils/calculateSystemHealthScore'

/**
 * Chunk array utility
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

/**
 * Filter systems by user role & filter selections, returning an array of `unit_id`.
 */
function getFilteredUnitIds(
  aggregatedSystems: SystemData[],
  user: any,
  filters: FilterSelections
): string[] {
  const { company, type, pool, telemetry } = filters

  return aggregatedSystems
    .filter((s) => {
      // role checks
      if (user?.role === 'admin_employee') {
        const visibleCompanies = user.visibleCompanies || []
        if (visibleCompanies.length > 0 && !visibleCompanies.includes(s.company)) {
          return false
        }
      } else if (user?.role === 'employee' && s.company !== user.company) {
        return false
      }
      // admin + explicit company filter
      if (user?.role === 'admin' && company !== 'all' && s.company !== company) {
        return false
      }

      // Type, pool, telemetry
      if (type !== 'all' && s.type !== type) return false
      if (pool !== 'all' && s.pool !== pool) return false
      if (telemetry !== 'all') {
        const shouldBeActive = telemetry === 'active'
        if (s.sending_telemetry !== shouldBeActive) return false
      }
      return true
    })
    .map((s) => s.unit_id)
}

/**
 * We will:
 *  1) group system_data by (unit_id -> pool), picking the newest doc if multiple
 *  2) from those aggregated docs, gather unique hostids
 *  3) fetch capacity_trends by those hostids, then match them by (hostid + pool)
 */
export function useDashboardData(user: any) {
  const [progress, setProgress] = useState<number>(0)

  // =============== FILTERS ===============
  const initialFilters: FilterSelections = {
    company: 'all',
    type: 'all',
    pool: 'all',
    telemetry: 'all',
    timeRange: '30'
  }
  const [filters, setFilters] = useState<FilterSelections>(initialFilters)

  // =============== RAW SYSTEM DOCS (for dynamic filter lists) ===============
  const [rawSystemsDocs, setRawSystemsDocs] = useState<SystemData[]>([])

  // Final aggregated systems we’ll show
  const [systemsData, setSystemsData] = useState<SystemData[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // capacityTrends data
  const [capacityData, setCapacityData] = useState<CapacityData[]>([])

  // =============== 1) onSnapshot for system_data (for filter dropdowns) ===============
  useEffect(() => {
    const systemsCollection = collection(firestore, 'system_data')
    const unsubscribe = onSnapshot(systemsCollection, (snapshot) => {
      const docs = snapshot.docs
        .map((doc) => {
          const data = doc.data()
          return {
            ...data,
            sending_telemetry:
              String(data.sending_telemetry).toLowerCase() === 'true'
          } as SystemData
        })
        // filtro fuori tutte le pool che contengono "/" (i dataset)
        .filter((s) => !s.pool.includes('/'))
      setRawSystemsDocs(docs)
    })
    return () => unsubscribe()
  }, [])

  // =============== 2) Build dynamic filter options ===============
  const filterOptions = useMemo<FilterOptions>(() => {
    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)

    // from rawSystemsDocs, apply role checks + date check
    const allowedDocs = rawSystemsDocs.filter((s) => {
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length > 0 && !visible.includes(s.company)) return false
      } else if (user?.role === 'employee' && s.company !== user.company) {
        return false
      }
      // time check
      if (new Date(s.last_date) < cutoffDate) return false
      return true
    })

    // build companies
    let companies: string[] = []
    if (user?.role === 'admin_employee') {
      const visible = user.visibleCompanies || []
      if (visible.length > 0) {
        companies = ['all', ...visible]
      } else {
        companies = ['all']
      }
    } else if (user?.role === 'employee') {
      companies = [user.company]
    } else {
      const discovered = Array.from(new Set(allowedDocs.map((s) => s.company)))
      companies = ['all', ...discovered]
    }

    // build types
    const discoveredTypes = Array.from(new Set(allowedDocs.map((s) => s.type)))
    const types = ['all', ...discoveredTypes]

    // build pools
    const discoveredPools = Array.from(new Set(allowedDocs.map((s) => s.pool)))
    const pools = ['all', ...discoveredPools]

    return { companies, types, pools }
  }, [rawSystemsDocs, filters.timeRange, user])

  // if user is not admin, force filters.company to the user’s single company
  useEffect(() => {
    if (!user) return

    if (user.role === 'admin_employee') {
      const visible = user.visibleCompanies || []
      if (visible.length === 1 && filters.company === 'all') {
        setFilters((prev) => ({ ...prev, company: visible[0] }))
      }
    } else if (user.role !== 'admin') {
      if (filters.company === 'all') {
        setFilters((prev) => ({ ...prev, company: user.company }))
      }
    }
  }, [user, filters.company])

  // =============== 3) Progressive load of system_data docs w/ role & filter constraints ===============
  useEffect(() => {
    async function fetchAllSystemsProgressively() {
      setIsLoading(true)
      const pageSize = 1000
      const queryConstraints: any[] = []
  
      // role-based constraints
      if (user?.role === 'admin_employee') {
        const visibleCompanies = user.visibleCompanies || []
        if (visibleCompanies.length === 1) {
          queryConstraints.push(where('company', '==', visibleCompanies[0]))
        } else if (
          visibleCompanies.length > 1 &&
          visibleCompanies.length <= 10
        ) {
          queryConstraints.push(where('company', 'in', visibleCompanies))
        }
      } else if (user?.role === 'employee') {
        queryConstraints.push(where('company', '==', user.company))
      } else if (user?.role === 'admin') {
        if (filters.company !== 'all') {
          queryConstraints.push(where('company', '==', filters.company))
        }
      }
  
      // additional filter constraints
      if (filters.type !== 'all') {
        queryConstraints.push(where('type', '==', filters.type))
      }
      if (filters.pool !== 'all') {
        queryConstraints.push(where('pool', '==', filters.pool))
      }
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        queryConstraints.push(
          where('sending_telemetry', '==', shouldBeActive)
        )
      }
  
      // always order by last_date desc
      const validConstraints = queryConstraints.filter(Boolean)
      let lastDoc: QueryDocumentSnapshot | null = null
      let allRaw: SystemData[] = []
      let fetchedAll = false
  
      while (!fetchedAll) {
        const constraints = [
          ...validConstraints,
          orderBy('last_date', 'desc'),
          limit(pageSize)
        ]
        if (lastDoc) {
          constraints.push(startAfter(lastDoc))
        }
  
        const qSys = query(
          collection(firestore, 'system_data'),
          ...constraints
        )
        const snap = await getDocs(qSys)
        const newDocs = snap.docs.map((doc) => {
          const d = doc.data()
          return {
            ...d,
            sending_telemetry:
              String(d.sending_telemetry).toLowerCase() === 'true'
          } as SystemData
        })
  
        // role-based client filtering for admin_employee
        if (user?.role === 'admin_employee') {
          const visibleCompanies = user.visibleCompanies || []
          if (visibleCompanies.length > 10) {
            newDocs.forEach((sys) => {
              if (visibleCompanies.includes(sys.company)) {
                allRaw.push(sys)
              }
            })
          } else {
            allRaw = [...allRaw, ...newDocs]
          }
        } else {
          allRaw = [...allRaw, ...newDocs]
        }
  
        if (snap.docs.length < pageSize) {
          fetchedAll = true
        } else {
          lastDoc = snap.docs[snap.docs.length - 1]
        }
      }
  
      // filtriamo fuori i dataset (pool con "/")
      allRaw = allRaw.filter((sys) => !sys.pool.includes('/'))
  
      // raggruppiamo per unit_id → pool, prendendo l'ultima versione
      const days = parseInt(filters.timeRange)
      const cutoff = subDays(new Date(), days)
      const unitGroups: Record<string, Record<string, SystemData>> = {}
  
      for (const sys of allRaw) {
        if (!unitGroups[sys.unit_id]) {
          unitGroups[sys.unit_id] = {}
        }
        const existing = unitGroups[sys.unit_id][sys.pool]
        if (!existing) {
          unitGroups[sys.unit_id][sys.pool] = sys
        } else {
          const currLast = new Date(sys.last_date)
          const existLast = new Date(existing.last_date)
          if (currLast > existLast) {
            unitGroups[sys.unit_id][sys.pool] = sys
          }
        }
      }
  
      // costruisco l'array finale
      const aggregated: SystemData[] = []
      for (const [, poolMap] of Object.entries(unitGroups)) {
        const poolRecords = Object.values(poolMap)
        let valid = poolRecords.filter(
          (p) => new Date(p.last_date) >= cutoff
        )
        if (valid.length === 0) {
          valid = poolRecords
        }
        if (valid.length === 1) {
          aggregated.push(valid[0])
        } else {
          const newest = valid.reduce((prev, curr) =>
            new Date(prev.last_date) > new Date(curr.last_date)
              ? prev
              : curr
          )
          aggregated.push(newest)
        }
      }
  
      setSystemsData(aggregated)
      setIsLoading(false)
    }
  
    fetchAllSystemsProgressively()
  }, [filters, user])

  // =============== 4) Once we have aggregated systems, fetch capacity data by hostid + pool ===============
  useEffect(() => {
    if (systemsData.length === 0) {
      setCapacityData([])
      return
    }
    // gather unique hostids from the aggregated systems
    const hostids = new Set<string>()
    systemsData.forEach((sys) => {
      if (sys.hostid) {
        hostids.add(sys.hostid)
      }
    })

    const hostidArr = Array.from(hostids)
    if (hostidArr.length === 0) {
      setCapacityData([])
      return
    }

    const days = parseInt(filters.timeRange)
    const cutoffDateObj = subDays(new Date(), days)
    const cutoffDateString = format(cutoffDateObj, 'yyyy-MM-dd HH:mm:ss')

    setCapacityData([]) // reset
    fetchCapacityTrendsProgressively(hostidArr, cutoffDateString)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemsData, filters, user])

  async function fetchCapacityTrendsProgressively(
    hostidArr: string[],
    cutoffDateString: string
  ) {
    const chunks = chunkArray(hostidArr, 10) // 'in' supports up to 10 elements
    const concurrencyLimit = 4
    const totalChunks = chunks.length
    let processedChunks = 0

    setProgress(0)
    setCapacityData([])

    for (let i = 0; i < totalChunks; i += concurrencyLimit) {
      const batchChunks = chunks.slice(i, i + concurrencyLimit)

      await Promise.all(
        batchChunks.map(async (chunk) => {
          // Query capacity_trends by hostid array
          const qCap = query(
            collection(firestore, 'capacity_trends'),
            where('hostid', 'in', chunk),
            where('date', '>=', cutoffDateString),
            orderBy('date', 'asc')
          )
          const snap = await getDocs(qCap)

          const batchResults = snap.docs.map((doc: QueryDocumentSnapshot) => {
            const data = doc.data()
            return {
              date: new Date(data.date).toISOString(),
              snap: data.snap ?? 0,
              used: data.used ?? 0,
              perc_used: data.perc_used ?? 0,
              perc_snap: data.perc_snap ?? 0,
              pool: data.pool ?? '',
              hostid: data.hostid ?? '',
              total_space: data.total_space ?? 0
            } as CapacityData
          })

          setCapacityData((prev) => {
            const newData = [...prev, ...batchResults]
            // De-duplicate by (hostid + date + pool) if needed
            const uniqueMap = new Map<string, CapacityData>()
            newData.forEach((item) => {
              // key = hostid + pool + date
              const key = `${item.hostid}_${item.pool}_${item.date}`
              uniqueMap.set(key, item)
            })
            return Array.from(uniqueMap.values())
          })

          processedChunks++
          setProgress(Math.min(100, Math.round((processedChunks / totalChunks) * 100)))
        })
      )
    }

    setProgress(100)
  }

  // =============== 5) Convert capacityData => telemetryData (unified structure) ===============
  const computedTelemetryData = useMemo<TelemetryData[]>(() => {
    return capacityData.map((item) => ({
      date: item.date,
      unit_id: '', // your capacity docs don't have correct unit_id, so we'll keep it blank or fill in if you like
      pool: item.pool,
      used: item.used,
      total_space: item.total_space,
      perc_used: item.perc_used,
      snap: item.snap,
      perc_snap: item.perc_snap,
      hostid: item.hostid
    }))
  }, [capacityData])

  // =============== 6) aggregatedStats ===============
  const aggregatedStats = useMemo<AggregatedStats | null>(() => {
    if (systemsData.length === 0) return null;
  
    const days = parseInt(filters.timeRange);
    const cutoffDate = subDays(new Date(), days);
  
    const filteredSystems = systemsData.filter((s) => {
      // 1) visibilità per admin_employee
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || [];
        if (visible.length > 0 && !visible.includes(s.company)) {
          return false;
        }
      }
  
      // 2) filtro EXPLICITO company per admin e admin_employee
      if (
        (user?.role === 'admin' || user?.role === 'admin_employee') &&
        filters.company !== 'all' &&
        s.company !== filters.company
      ) {
        return false;
      }
  
      // 3) altri filtri
      if (filters.type !== 'all' && s.type !== filters.type) return false;
      if (filters.pool !== 'all' && s.pool !== filters.pool) return false;
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active';
        if (s.sending_telemetry !== shouldBeActive) return false;
      }
  
      // 4) dati di capacity recenti
      if (!s.hostid) return false;
      const hasRecentCap = capacityData.some((c) =>
        c.hostid === s.hostid &&
        c.pool === s.pool &&
        new Date(c.date) >= cutoffDate
      );
      return hasRecentCap;
    });
  
    if (filteredSystems.length === 0) return null;

    const totalSystems = filteredSystems.length
    let totalUsed = 0
    let totalSnapshots = 0
    let sumPercUsed = 0
    let sumPercSnap = 0
    let sumSpeed = 0
    let sumTime = 0
    let telemetryActive = 0
    let sumHealth = 0

    const systemsByType: Record<string, number> = {}
    const systemsByCompany: Record<string, number> = {}
    const systemsByPool: Record<string, number> = {}

    let healthySystems = 0
    let warningSystems = 0
    let criticalSystems = 0
    let totalConfiguredCapacity = 0

    for (const s of filteredSystems) {
      // find capacity doc with the newest date for this hostid + pool
      const recs = capacityData.filter((r) => r.hostid === s.hostid && r.pool === s.pool)
      if (recs.length > 0) {
        recs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        totalConfiguredCapacity += recs[0].total_space
      }

      totalUsed += s.used || 0
      totalSnapshots += s.used_snap || 0
      sumPercUsed += s.perc_used || 0
      sumPercSnap += s.perc_snap || 0
      sumSpeed += s.avg_speed || 0
      sumTime += s.avg_time || 0

      if (s.sending_telemetry) telemetryActive++

      const healthScore = calculateSystemHealthScore(s)
      sumHealth += healthScore
      if (healthScore >= 80) healthySystems++
      else if (healthScore >= 50) warningSystems++
      else criticalSystems++

      systemsByType[s.type] = (systemsByType[s.type] || 0) + 1
      systemsByCompany[s.company] = (systemsByCompany[s.company] || 0) + 1
      systemsByPool[s.pool] = (systemsByPool[s.pool] || 0) + 1
    }

    return {
      totalSystems,
      totalCapacity: totalConfiguredCapacity,
      usedCapacity: totalUsed,
      usedSnapshots: totalSnapshots,
      avgUsage: sumPercUsed / totalSystems,
      avgSnapUsage: sumPercSnap / totalSystems,
      avgSpeed: sumSpeed / totalSystems,
      avgResponseTime: sumTime / totalSystems,
      telemetryActive,
      systemsByType,
      systemsByCompany,
      systemsByPool,
      healthySystems,
      warningSystems,
      criticalSystems,
      avgHealth: totalSystems > 0 ? sumHealth / totalSystems : 0
    } as AggregatedStats
  }, [systemsData, capacityData, filters, user])

  // =============== 7) filteredSystems (for table listing) ===============
  const filteredSystems = useMemo<SystemData[]>(() => {
    if (systemsData.length === 0) return [];
    const days = parseInt(filters.timeRange);
    const cutoffDate = subDays(new Date(), days);
  
    return systemsData.filter((system) => {
      // 1) visibilità per admin_employee
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || [];
        if (visible.length > 0 && !visible.includes(system.company)) {
          return false;
        }
      }
  
      // 2) filtro EXPEDITOR company per admin e admin_employee
      if (
        (user?.role === 'admin' || user?.role === 'admin_employee') &&
        filters.company !== 'all' &&
        system.company !== filters.company
      ) {
        return false;
      }
  
      // 3) altri filtri
      if (filters.type !== 'all' && system.type !== filters.type) return false;
      if (filters.pool !== 'all' && system.pool !== filters.pool) return false;
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active';
        if (system.sending_telemetry !== shouldBeActive) return false;
      }
  
      // 4) dati di capacity recenti
      if (!system.hostid) return false;
      const hasRecent = capacityData.some((c) =>
        c.hostid === system.hostid &&
        c.pool === system.pool &&
        new Date(c.date) >= cutoffDate
      );
      return hasRecent;
    });
  }, [systemsData, capacityData, filters, user]);
  

  // =============== 8) Group capacity data by date for charting ===============
  const groupedCapacityData = useMemo(() => {
    // For chart usage, we only show capacity docs for the current filtered systems
    const allowedPairs = new Set<string>()
    filteredSystems.forEach((s) => {
      allowedPairs.add(`${s.hostid}::${s.pool}`)
    })

    const dataForChart = capacityData.filter((cap) => {
      const key = `${cap.hostid}::${cap.pool}`
      return allowedPairs.has(key)
    })

    const groupedByDate = dataForChart.reduce(
      (
        acc: Record<
          string,
          {
            usedSum: number
            perc_usedSum: number
            snapSum: number
            perc_snapSum: number
            count: number
          }
        >,
        item: CapacityData
      ) => {
        const dateKey = format(new Date(item.date), 'yyyy-MM-dd')
        if (!acc[dateKey]) {
          acc[dateKey] = {
            usedSum: 0,
            perc_usedSum: 0,
            snapSum: 0,
            perc_snapSum: 0,
            count: 0
          }
        }
        acc[dateKey].usedSum += item.used
        acc[dateKey].perc_usedSum += item.perc_used
        acc[dateKey].snapSum += item.snap
        acc[dateKey].perc_snapSum += item.perc_snap
        acc[dateKey].count++
        return acc
      },
      {}
    )

    const sortedKeys = Object.keys(groupedByDate).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )
    return { sortedKeys, groupedByDate }
  }, [capacityData, filteredSystems])

  // =============== 9) Chart data creation ===============
  type Unit = 'GB' | 'GiB' | 'TB' | '%'

  function prepareUsedTrendsChart(usedUnit: Unit) {
    const { sortedKeys, groupedByDate } = groupedCapacityData
    const labels = sortedKeys.map((dateKey) => [
      format(new Date(dateKey), 'MMM dd'),
      format(new Date(dateKey), 'yyyy')
    ])

    const dataUsed = sortedKeys.map((key) => {
      const g = groupedByDate[key]
      const avgUsedGB = g.usedSum / g.count
      const avgPercUsed = g.perc_usedSum / g.count

      switch (usedUnit) {
        case 'TB':
          return Number((avgUsedGB / 1024).toFixed(2))
        case 'GB':
          return Number(avgUsedGB.toFixed(2))
        case 'GiB':
          return Number((avgUsedGB / 1.073741824).toFixed(2))
        case '%':
        default:
          return Number(avgPercUsed.toFixed(2))
      }
    })

    return {
      labels,
      datasets: [
        {
          label:
            usedUnit === 'TB'
              ? 'Used (TB)'
              : usedUnit === 'GB'
              ? 'Used (GB)'
              : usedUnit === 'GiB'
              ? 'Used (GiB)'
              : 'Used (%)',
          data: dataUsed,
          borderColor: '#22c1d4',
          borderWidth: 1,
          backgroundColor: 'rgba(34, 193, 212, 0.2)',
          tension: 0,
          fill: false,
          pointBackgroundColor: dataUsed.map(() => '#22c1d4'),
          pointRadius: dataUsed.map(() => 4),
          pointBorderWidth: 0
        }
      ]
    }
  }

  function prepareSnapshotTrendsChart(snapUnit: Unit) {
    const { sortedKeys, groupedByDate } = groupedCapacityData
    const labels = sortedKeys.map((dateKey) => [
      format(new Date(dateKey), 'MMM dd'),
      format(new Date(dateKey), 'yyyy')
    ])

    const dataSnap = sortedKeys.map((key) => {
      const g = groupedByDate[key]
      const avgSnapGB = g.snapSum / g.count
      const avgPercSnap = g.perc_snapSum / g.count

      switch (snapUnit) {
        case 'TB':
          return Number((avgSnapGB / 1024).toFixed(2))
        case 'GB':
          return Number(avgSnapGB.toFixed(2))
        case 'GiB':
          return Number((avgSnapGB / 1.073741824).toFixed(2))
        case '%':
        default:
          return Number(avgPercSnap.toFixed(2))
      }
    })

    return {
      labels,
      datasets: [
        {
          label:
            snapUnit === 'TB'
              ? 'Snapshots (TB)'
              : snapUnit === 'GB'
              ? 'Snapshots (GB)'
              : snapUnit === 'GiB'
              ? 'Snapshots (GiB)'
              : 'Snapshots (%)',
          data: dataSnap,
          borderColor: '#f8485e',
          borderWidth: 1,
          backgroundColor: 'rgba(248, 72, 94, 0.2)',
          tension: 0,
          fill: false,
          pointBackgroundColor: dataSnap.map(() => '#f8485e'),
          pointRadius: dataSnap.map(() => 4),
          pointBorderWidth: 0
        }
      ]
    }
  }

  // =============== 10) business metrics ===============
  const computedBusinessMetrics = useMemo<BusinessMetric[]>(() => {
    if (systemsData.length === 0) return []
    if (!aggregatedStats) return []

    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)
    const midpointDate = subDays(new Date(), Math.floor(days / 2))

    // we can do naive usage trend analysis
    const firstHalf = capacityData.filter(
      (c) => new Date(c.date) >= cutoffDate && new Date(c.date) < midpointDate
    )
    const secondHalf = capacityData.filter((c) => new Date(c.date) >= midpointDate)

    const firstHalfUsage =
      firstHalf.length > 0
        ? firstHalf.reduce((sum, it) => sum + it.perc_used, 0) / firstHalf.length
        : 0
    const secondHalfUsage =
      secondHalf.length > 0
        ? secondHalf.reduce((sum, it) => sum + it.perc_used, 0) / secondHalf.length
        : 0

    const usageTrend =
      firstHalfUsage > 0 ? ((secondHalfUsage - firstHalfUsage) / firstHalfUsage) * 100 : 0
    const telemetryTrend =
      aggregatedStats.totalSystems > 0
        ? (aggregatedStats.telemetryActive / aggregatedStats.totalSystems) * 100 - 80
        : 0

    // max usage in capacityData
    const allowedPairs = new Set<string>()
    filteredSystems.forEach((fs) => {
      allowedPairs.add(`${fs.hostid}::${fs.pool}`)
    })
    const filteredCap = capacityData.filter((c) => {
      const key = `${c.hostid}::${c.pool}`
      return allowedPairs.has(key) && new Date(c.date) >= cutoffDate
    })
    const maxUsedGB = filteredCap.length
      ? Math.max(...filteredCap.map((r) => r.used))
      : 0
    const maxUsedTB = maxUsedGB / 1024

    const totalCapTB = aggregatedStats.totalCapacity / 1024
    const usedCapTB = aggregatedStats.usedCapacity / 1024
    const freeCapPercentage =
      totalCapTB > 0
        ? (((totalCapTB - usedCapTB) / totalCapTB) * 100).toFixed(0) + '%'
        : '0%'

    // average system health
    let sumHealth = 0
    filteredSystems.forEach((s) => {
      sumHealth += calculateSystemHealthScore(s)
    })
    const avgHealth =
      filteredSystems.length > 0
        ? (sumHealth / filteredSystems.length).toFixed(0)
        : '0'

    // usage margin
    const usageMarginPercentage =
      totalCapTB > 0 ? ((maxUsedTB / totalCapTB) * 100).toFixed(0) + '%' : '0%'

    return [
      {
        title: 'Total Capacity',
        value: Math.round(totalCapTB).toString(),
        unit: 'TB',
        trend: 0,
        icon: Database,
        description: 'Total storage available',
        subValue: freeCapPercentage,
        subDescription: 'Free capacity'
      },
      {
        title: 'Total Systems',
        value: aggregatedStats.totalSystems.toString(),
        trend: 0,
        icon: Users,
        description: 'Active systems in the network',
        subValue: avgHealth,
        subDescription: 'Avg. health score'
      },
      {
        title: 'Max Usage',
        value: Math.round(maxUsedTB).toString(),
        unit: 'TB',
        trend: 0,
        icon: BarChart2,
        description: 'Maximum used capacity in the period',
        subValue: usageMarginPercentage,
        subDescription: 'Peak vs total capacity'
      },
      {
        title: 'Telemetry Active',
        value: `${aggregatedStats.telemetryActive}/${aggregatedStats.totalSystems}`,
        trend: 0,
        icon: Activity,
        description: 'Systems actively sending telemetry data',
        subValue: `${(
          (aggregatedStats.telemetryActive / aggregatedStats.totalSystems) *
          100
        ).toFixed(0)}%`,
        subDescription: 'Telemetry activation rate'
      }
    ]
  }, [systemsData, capacityData, aggregatedStats, filters, filteredSystems])

  const getBusinessMetrics = (): BusinessMetric[] => computedBusinessMetrics

  // =============== 11) Filtered telemetry data ===============
  const filteredTelemetryData = useMemo(() => {
    if (systemsData.length === 0) return []
    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)

    // We want TelemetryData that belongs to a system in filteredSystems
    const allowedPairs = new Set<string>()
    filteredSystems.forEach((fs) => {
      allowedPairs.add(`${fs.hostid}::${fs.pool}`)
    })

    return computedTelemetryData.filter((item) => {
      if (!item.hostid) return false
      const key = `${item.hostid}::${item.pool}`
      if (!allowedPairs.has(key)) return false
      return new Date(item.date) >= cutoffDate
    })
  }, [systemsData, computedTelemetryData, filters, filteredSystems])

  return {
    systemsData,
    capacityData,
    telemetryData: computedTelemetryData,
    aggregatedStats,
    filters,
    setFilters,
    filterOptions,
    isLoading,
    getFilteredSystems: () => filteredSystems,
    prepareUsedTrendsChart,
    prepareSnapshotTrendsChart,
    businessMetrics: getBusinessMetrics,
    getFilteredTelemetryData: () => filteredTelemetryData,
    progress
  }
}
