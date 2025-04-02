import { useState, useEffect, useMemo } from 'react';
import { Database, TrendingUp, TrendingDown, Users, Activity, BarChart2 } from 'lucide-react';
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

// Helper per suddividere un array in chunk
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

function getFilteredHostids(
  systems: SystemData[],
  user: any,
  filters: FilterSelections
): string[] {
  const { company, type, pool, telemetry } = filters

  return systems
    .filter((s: SystemData) => {
      if (user?.role === 'admin_employee') {
        const visibleCompanies = user.visibleCompanies || []
        if (visibleCompanies.length > 0 && !visibleCompanies.includes(s.company)) {
          return false
        }
      } else if (user?.role === 'employee' && s.company !== user.company) {
        return false
      }

      if (user?.role === 'admin' && company !== 'all' && s.company !== company) {
        return false
      }

      if (type !== 'all' && s.type !== type) return false
      if (pool !== 'all' && s.pool !== pool) return false
      if (telemetry !== 'all') {
        const shouldBeActive = telemetry === 'active'
        if (s.sending_telemetry !== shouldBeActive) return false
      }

      return true
    })
    .map((s: SystemData) => s.hostid)
}

/**
 * Hook per il recupero e la gestione dei dati della dashboard.
 */
export function useDashboardData(user: any) {
  const [progress, setProgress] = useState<number>(0)

  // Filtri di default
  const initialFilters: FilterSelections = {
    company: 'all',
    type: 'all',
    pool: 'all',
    telemetry: 'all',
    timeRange: '90'
  }
  const [filters, setFilters] = useState<FilterSelections>(initialFilters)

  // Stato per salvare tutti i sistemi (via onSnapshot) per aggiornare in tempo reale le opzioni dei filtri
  const [allSystems, setAllSystems] = useState<SystemData[]>([])
  useEffect(() => {
    const systemsCollection = collection(firestore, 'system_data')
    const unsubscribe = onSnapshot(systemsCollection, snapshot => {
      const systems = snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          ...data,
          sending_telemetry: data.sending_telemetry === 'True'
        } as SystemData
      })
      setAllSystems(systems)
    })
    return () => unsubscribe()
  }, [])

  // Calcola le opzioni dei filtri in maniera dinamica
  const filterOptions = useMemo<FilterOptions>(() => {
    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)

    const availableCompanies = allSystems.filter(s => {
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length > 0 && !visible.includes(s.company)) return false
      } else if (user?.role === 'employee' && s.company !== user.company) {
        return false
      }

      if (filters.type !== 'all' && s.type !== filters.type) return false
      if (filters.pool !== 'all' && s.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (s.sending_telemetry !== shouldBeActive) return false
      }
      if (new Date(s.last_date) < cutoffDate) return false
      return true
    })

    const companies =
      user?.role === 'admin_employee'
        ? ['all', ...(user.visibleCompanies || [])]
        : ['all', ...Array.from(new Set(availableCompanies.map(s => s.company)))]

    const availableTypes = allSystems.filter(s => {
      if (
        user?.role === 'admin_employee' &&
        !(user.visibleCompanies || []).includes(s.company)
      )
        return false
      if (filters.company !== 'all' && s.company !== filters.company) return false
      if (filters.pool !== 'all' && s.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (s.sending_telemetry !== shouldBeActive) return false
      }
      if (new Date(s.last_date) < cutoffDate) return false
      return true
    })
    const types = ['all', ...Array.from(new Set(availableTypes.map(s => s.type)))]

    const availablePools = allSystems.filter(s => {
      if (filters.company !== 'all' && s.company !== filters.company) return false
      if (filters.type !== 'all' && s.type !== filters.type) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (s.sending_telemetry !== shouldBeActive) return false
      }
      if (new Date(s.last_date) < cutoffDate) return false
      return true
    })
    const pools = ['all', ...Array.from(new Set(availablePools.map(s => s.pool)))]

    return { companies, types, pools }
  }, [allSystems, filters, user])

  // Se l’utente non è admin, forziamo il filtro sulla company
  useEffect(() => {
    if (user && filters.company === 'all') {
      if (user.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length === 1) {
          setFilters(prev => ({ ...prev, company: visible[0] }))
        }
      } else if (user.role !== 'admin') {
        setFilters(prev => ({ ...prev, company: user.company }))
      }
    }
  }, [user, filters.company])

  const [systemsData, setSystemsData] = useState<SystemData[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Caricamento progressivo dei dati systemsData
  useEffect(() => {
    async function fetchAllSystemsProgressively() {
      setIsLoading(true)
      const pageSize = 1000
      const queryConstraints: any[] = []

      if (user?.role === 'admin_employee') {
        const visibleCompanies = user.visibleCompanies || []
        if (visibleCompanies.length > 0) {
          if (visibleCompanies.length === 1) {
            queryConstraints.push(where('company', '==', visibleCompanies[0]))
          } else if (visibleCompanies.length <= 10) {
            queryConstraints.push(where('company', 'in', visibleCompanies))
          }
        }
      } else if (user?.role === 'employee') {
        queryConstraints.push(where('company', '==', user.company))
      } else if (filters.company !== 'all') {
        queryConstraints.push(where('company', '==', filters.company))
      }
      if (filters.type !== 'all') {
        queryConstraints.push(where('type', '==', filters.type))
      }
      if (filters.pool !== 'all') {
        queryConstraints.push(where('pool', '==', filters.pool))
      }

      const validConstraints = queryConstraints.filter(Boolean)
      let lastDoc: QueryDocumentSnapshot | null = null
      let allSystems: SystemData[] = []
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
        const qSys = query(collection(firestore, 'system_data'), ...constraints)
        const snap = await getDocs(qSys)
        const newData = snap.docs.map(doc => {
          const data = doc.data()
          return {
            ...data,
            sending_telemetry: data.sending_telemetry === 'True'
          } as SystemData
        })

        if (user?.role === 'admin_employee') {
          const visibleCompanies = user.visibleCompanies || []
          if (visibleCompanies.length > 10) {
            // Filtra lato client se le company sono > 10
            allSystems = [
              ...allSystems,
              ...newData.filter(s => visibleCompanies.includes(s.company))
            ]
          } else {
            allSystems = [...allSystems, ...newData]
          }
        } else {
          allSystems = [...allSystems, ...newData]
        }

        setSystemsData([...allSystems]) // Aggiornamento progressivo

        if (snap.docs.length < pageSize) {
          fetchedAll = true
        } else {
          lastDoc = snap.docs[snap.docs.length - 1]
        }
      }
      setIsLoading(false)
    }

    fetchAllSystemsProgressively()
  }, [filters, user])

  // Stato per i dati di capacity caricati progressivamente
  const [capacityData, setCapacityData] = useState<CapacityData[]>([])

  // Una volta ottenuti i systemsData, avviamo il caricamento progressivo dei dati di capacity
  useEffect(() => {
    if (systemsData.length > 0) {
      const hostids = getFilteredHostids(systemsData, user, filters)
      if (hostids.length > 0) {
        const days = parseInt(filters.timeRange)
        const cutoffDateObj = subDays(new Date(), days)
        const cutoffDateString = format(cutoffDateObj, 'yyyy-MM-dd HH:mm:ss')
        setCapacityData([])
        fetchCapacityTrendsProgressively(hostids, cutoffDateString)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemsData, filters, user])

  async function fetchCapacityTrendsProgressively(
    hostids: string[],
    cutoffDateString: string
  ) {
    const chunks = chunkArray(hostids, 30)
    const concurrencyLimit = 4
    const totalChunks = chunks.length
    let processedChunks = 0

    setProgress(0)
    setCapacityData([])

    for (let i = 0; i < totalChunks; i += concurrencyLimit) {
      const batchChunks = chunks.slice(i, i + concurrencyLimit)

      await Promise.all(
        batchChunks.map(async chunk => {
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

          setCapacityData(prev => {
            const newData = [...prev, ...batchResults]
            const uniqueMap = new Map<string, CapacityData>()
            newData.forEach(item =>
              uniqueMap.set(`${item.hostid}_${item.date}`, item)
            )
            return Array.from(uniqueMap.values())
          })

          processedChunks += 1
          setProgress(Math.min(100, Math.round((processedChunks / totalChunks) * 100)))
        })
      )
    }

    setProgress(100)
  }

  // Deriviamo la telemetryData dai capacityData
  const computedTelemetryData = useMemo<TelemetryData[]>(() => {
    return capacityData.map((item: CapacityData) => ({
      date: item.date,
      hostid: item.hostid,
      used_space: item.used,       // in GB
      total_space: item.total_space, // in GB
      used_percentage: item.perc_used
    }))
  }, [capacityData])

  // Calcola le statistiche aggregate (aggregatedStats)
  const aggregatedStats = useMemo<AggregatedStats | null>(() => {
    if (systemsData.length === 0) return null

    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)

    // Filtra i sistemi in base a filtri e data
    const filteredSystems = systemsData.filter((system: SystemData) => {
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length > 0 && !visible.includes(system.company)) return false
      } else if (user?.role === 'employee' && system.company !== user.company) {
        return false
      } else if (user?.role === 'admin' && filters.company !== 'all' && system.company !== filters.company) {
        return false
      }
      if (filters.type !== 'all' && system.type !== filters.type) return false
      if (filters.pool !== 'all' && system.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (system.sending_telemetry !== shouldBeActive) return false
      }

      const hasRecentTelemetry =
        computedTelemetryData.length > 0
          ? computedTelemetryData.some(
              (item: TelemetryData) =>
                item.hostid === system.hostid && new Date(item.date) >= cutoffDate
            )
          : true
      return hasRecentTelemetry
    })
    if (filteredSystems.length === 0) return null

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

    // Calcolo della Total Capacity
    let totalConfiguredCapacity = 0

    filteredSystems.forEach(s => {
      // Trova record di capacity più recente
      const records = capacityData.filter(record => record.hostid === s.hostid)
      if (records.length > 0) {
        records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        totalConfiguredCapacity += records[0].total_space // in GB
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
    })

    return {
      totalSystems,
      totalCapacity: totalConfiguredCapacity, // in GB
      usedCapacity: totalUsed,                // in GB
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
  }, [systemsData, computedTelemetryData, filters, capacityData, user])

  // Filtra i sistemi in base a timeRange e agli altri filtri
  const filteredSystems = useMemo<SystemData[]>(() => {
    if (systemsData.length === 0) return []
    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)
    return systemsData.filter((system: SystemData) => {
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length > 0 && !visible.includes(system.company)) return false
      } else if (user?.role === 'employee' && system.company !== user.company) {
        return false
      } else if (user?.role === 'admin' && filters.company !== 'all' && system.company !== filters.company) {
        return false
      }

      if (filters.type !== 'all' && system.type !== filters.type) return false
      if (filters.pool !== 'all' && system.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (system.sending_telemetry !== shouldBeActive) return false
      }
      const hasRecentTelemetry =
        computedTelemetryData.length > 0
          ? computedTelemetryData.some(
              (item: TelemetryData) =>
                item.hostid === system.hostid && new Date(item.date) >= cutoffDate
            )
          : true
      return hasRecentTelemetry
    })
  }, [systemsData, computedTelemetryData, filters, user])

  // Raggruppa i dati di capacity per data (per i grafici)
  const groupedCapacityData = useMemo(() => {
    let dataForChart = capacityData
    const allowedHostids = filteredSystems.map((s: SystemData) => s.hostid)
    dataForChart = dataForChart.filter((item: CapacityData) =>
      allowedHostids.includes(item.hostid)
    )

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

  /**
   * Qui aggiungiamo la logica per gestire le 4 unità:
   * - GB (dati originali)
   * - GiB
   * - TB
   * - %
   */
  type Unit = 'GB' | 'GiB' | 'TB' | '%'

  // Prepara i dati per il grafico dell'andamento dello spazio usato
  function prepareUsedTrendsChart(usedUnit: Unit) {
    const { sortedKeys, groupedByDate } = groupedCapacityData
    const labels = sortedKeys.map((dateKey: string) => [
      format(new Date(dateKey), 'MMM dd'),
      format(new Date(dateKey), 'yyyy')
    ])

    const dataUsed = sortedKeys.map(key => {
      const group = groupedByDate[key]
      // Qui ipotizziamo che usedSum sia in GB
      const avgUsedGB = group.usedSum / group.count
      const avgPercUsed = group.perc_usedSum / group.count

      switch (usedUnit) {
        case 'TB':
          return Number((avgUsedGB / 1024).toFixed(2))
        case 'GB':
          return Number(avgUsedGB.toFixed(2))
        case 'GiB':
          // 1 GiB ~ 1.073741824 GB
          return Number((avgUsedGB / 1.073741824).toFixed(2))
        case '%':
        default:
          // Usa la media di perc_used
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

  // Prepara i dati per il grafico degli snapshot
  function prepareSnapshotTrendsChart(snapUnit: Unit) {
    const { sortedKeys, groupedByDate } = groupedCapacityData
    const labels = sortedKeys.map((dateKey: string) => [
      format(new Date(dateKey), 'MMM dd'),
      format(new Date(dateKey), 'yyyy')
    ])

    const dataSnap = sortedKeys.map(key => {
      const group = groupedByDate[key]
      const avgSnapGB = group.snapSum / group.count
      const avgPercSnap = group.perc_snapSum / group.count

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

  // Calcola le business metrics e le espone come funzione
  const computedBusinessMetrics = useMemo<BusinessMetric[]>(() => {
    if (systemsData.length === 0) return []
    if (!aggregatedStats) return []

    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)
    const midpointDate = subDays(new Date(), Math.floor(days / 2))

    const firstHalfTelemetry = computedTelemetryData.filter(item => {
      const itemDate = new Date(item.date)
      return itemDate >= cutoffDate && itemDate < midpointDate
    })
    const secondHalfTelemetry = computedTelemetryData.filter(item => {
      const itemDate = new Date(item.date)
      return itemDate >= midpointDate
    })

    const firstHalfUsage =
      firstHalfTelemetry.length > 0
        ? firstHalfTelemetry.reduce((sum, it) => sum + it.used_percentage, 0) /
          firstHalfTelemetry.length
        : 0
    const secondHalfUsage =
      secondHalfTelemetry.length > 0
        ? secondHalfTelemetry.reduce((sum, it) => sum + it.used_percentage, 0) /
          secondHalfTelemetry.length
        : 0
    const usageTrend = firstHalfUsage > 0 ? ((secondHalfUsage - firstHalfUsage) / firstHalfUsage) * 100 : 0
    const telemetryTrend =
      computedTelemetryData.length > 0
        ? (aggregatedStats.telemetryActive / aggregatedStats.totalSystems) * 100 - 80
        : 0

    // Calcolo del Max Usage (GB -> TB)
    const allowedHostids = filteredSystems.map(s => s.hostid)
    const filteredCapacityRecords = capacityData.filter(
      record => allowedHostids.includes(record.hostid) && new Date(record.date) >= cutoffDate
    )
    const maxUsedGB = filteredCapacityRecords.length > 0 ? Math.max(...filteredCapacityRecords.map(r => r.used)) : 0
    const maxUsedTB = maxUsedGB / 1024

    // Calcolo percentuale di spazio libero
    const totalCapTB = aggregatedStats.totalCapacity / 1024
    const usedCapTB = aggregatedStats.usedCapacity / 1024
    const freeCapPercentage =
      totalCapTB > 0 ? (((totalCapTB - usedCapTB) / totalCapTB) * 100).toFixed(0) + '%' : '0%'

    // Calcolo punteggio medio di salute
    let sumHealth = 0
    filteredSystems.forEach(s => {
      sumHealth += calculateSystemHealthScore(s)
    })
    const avgHealth = filteredSystems.length > 0 ? (sumHealth / filteredSystems.length).toFixed(0) : '0'

    // Rapporto (in %) tra il max usage e la capacità totale
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
        subValue: `${((aggregatedStats.telemetryActive / aggregatedStats.totalSystems) * 100).toFixed(0)}%`,
        subDescription: 'Telemetry activation rate'
      }
    ]
  }, [systemsData, computedTelemetryData, aggregatedStats, filters, capacityData, filteredSystems])

  const getBusinessMetrics = (): BusinessMetric[] => computedBusinessMetrics

  // Filtra i dati di telemetry in base al timeRange
  const filteredTelemetryData = useMemo(() => {
    if (systemsData.length === 0) return []
    const days = parseInt(filters.timeRange)
    const cutoffDate = subDays(new Date(), days)
    return computedTelemetryData.filter(item => {
      const system = systemsData.find(s => s.hostid === item.hostid)
      if (!system) return false
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length > 0 && !visible.includes(system.company)) return false
      } else if (user?.role === 'employee' && system.company !== user.company) {
        return false
      } else if (user?.role === 'admin' && filters.company !== 'all' && system.company !== filters.company) {
        return false
      }

      if (filters.type !== 'all' && system.type !== filters.type) return false
      if (filters.pool !== 'all' && system.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (system.sending_telemetry !== shouldBeActive) return false
      }
      return new Date(item.date) >= cutoffDate
    })
  }, [systemsData, computedTelemetryData, filters, user])

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
