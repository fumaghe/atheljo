import { useEffect, useMemo, useState } from 'react'
import { Database, Users, Activity, BarChart2 } from 'lucide-react'
import {
  AggregatedStats,
  BusinessMetric,
  CapacityData,
  FilterOptions,
  FilterSelections,
  SystemData
} from '../types'

const dummySystems: SystemData[] = [
  {
    unit_id: 'SYS-001',
    name: 'Aire Core',
    hostid: 'host-01',
    pool: 'pool-a',
    type: 'AiRE 3',
    used: 520,
    avail: 480,
    used_snap: 120,
    perc_used: 52,
    perc_snap: 12,
    sending_telemetry: true,
    first_date: '2024-01-01',
    last_date: '2024-05-01',
    MUP: 0,
    avg_speed: 220,
    avg_time: 35,
    company: 'Acme'
  },
  {
    unit_id: 'SYS-002',
    name: 'Edge Vault',
    hostid: 'host-02',
    pool: 'pool-b',
    type: 'AiRE 4',
    used: 780,
    avail: 220,
    used_snap: 210,
    perc_used: 78,
    perc_snap: 21,
    sending_telemetry: false,
    first_date: '2024-02-10',
    last_date: '2024-05-12',
    MUP: 0,
    avg_speed: 180,
    avg_time: 50,
    company: 'Globex'
  },
  {
    unit_id: 'SYS-003',
    name: 'SmartCARE Node',
    hostid: 'host-03',
    pool: 'pool-a',
    type: 'SmartCARE',
    used: 430,
    avail: 570,
    used_snap: 95,
    perc_used: 43,
    perc_snap: 9,
    sending_telemetry: true,
    first_date: '2024-03-05',
    last_date: '2024-05-20',
    MUP: 0,
    avg_speed: 240,
    avg_time: 25,
    company: 'Acme'
  }
]

const dummyCapacity: CapacityData[] = [
  {
    date: '2024-05-01',
    snap: 120,
    used: 520,
    perc_used: 52,
    perc_snap: 12,
    pool: 'pool-a',
    hostid: 'host-01',
    unit_id: 'SYS-001',
    total_space: 1000
  },
  {
    date: '2024-05-12',
    snap: 210,
    used: 780,
    perc_used: 78,
    perc_snap: 21,
    pool: 'pool-b',
    hostid: 'host-02',
    unit_id: 'SYS-002',
    total_space: 1000
  },
  {
    date: '2024-05-20',
    snap: 95,
    used: 430,
    perc_used: 43,
    perc_snap: 9,
    pool: 'pool-a',
    hostid: 'host-03',
    unit_id: 'SYS-003',
    total_space: 1000
  }
]

export function useDashboardData(user: any) {
  const [filters, setFilters] = useState<FilterSelections>({
    company: 'all',
    type: 'all',
    pool: 'all',
    telemetry: 'all',
    timeRange: '30'
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300)
    return () => clearTimeout(timer)
  }, [])

  const filterOptions = useMemo<FilterOptions>(() => {
    const companies = Array.from(new Set(dummySystems.map((s) => s.company)))
    const types = Array.from(new Set(dummySystems.map((s) => s.type)))
    const pools = Array.from(new Set(dummySystems.map((s) => s.pool)))

    return {
      companies: ['all', ...companies],
      types: ['all', ...types],
      pools: ['all', ...pools]
    }
  }, [])

  const filteredSystems = useMemo(() => {
    return dummySystems.filter((system) => {
      if (filters.company !== 'all' && system.company !== filters.company) return false
      if (filters.type !== 'all' && system.type !== filters.type) return false
      if (filters.pool !== 'all' && system.pool !== filters.pool) return false
      if (filters.telemetry !== 'all') {
        const shouldBeActive = filters.telemetry === 'active'
        if (system.sending_telemetry !== shouldBeActive) return false
      }
      if (user?.role === 'employee' || user?.role === 'customer') {
        return system.company === user.company
      }
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length && !visible.includes(system.company)) return false
      }
      return true
    })
  }, [filters, user])

  const capacityData = useMemo<CapacityData[]>(() => {
    const allowedHosts = new Set(filteredSystems.map((s) => `${s.hostid}::${s.pool}`))
    return dummyCapacity.filter((cap) => allowedHosts.has(`${cap.hostid}::${cap.pool}`))
  }, [filteredSystems])

  const aggregatedStats = useMemo<AggregatedStats | null>(() => {
    if (filteredSystems.length === 0) return null

    const totalSystems = filteredSystems.length
    const totalCapacity = filteredSystems.reduce((sum, sys) => sum + (sys.used + sys.avail), 0)
    const usedCapacity = filteredSystems.reduce((sum, sys) => sum + sys.used, 0)
    const usedSnapshots = filteredSystems.reduce((sum, sys) => sum + sys.used_snap, 0)
    const telemetryActive = filteredSystems.filter((sys) => sys.sending_telemetry).length

    const systemsByType = filteredSystems.reduce<Record<string, number>>((acc, sys) => {
      acc[sys.type] = (acc[sys.type] || 0) + 1
      return acc
    }, {})

    const systemsByCompany = filteredSystems.reduce<Record<string, number>>((acc, sys) => {
      acc[sys.company] = (acc[sys.company] || 0) + 1
      return acc
    }, {})

    const systemsByPool = filteredSystems.reduce<Record<string, number>>((acc, sys) => {
      acc[sys.pool] = (acc[sys.pool] || 0) + 1
      return acc
    }, {})

    const healthySystems = filteredSystems.filter((sys) => sys.perc_used < 70).length
    const warningSystems = filteredSystems.filter((sys) => sys.perc_used >= 70 && sys.perc_used < 90).length
    const criticalSystems = filteredSystems.filter((sys) => sys.perc_used >= 90).length

    return {
      totalSystems,
      totalCapacity,
      usedCapacity,
      usedSnapshots,
      avgUsage: Number((usedCapacity / totalSystems).toFixed(2)),
      avgSnapUsage: Number((usedSnapshots / totalSystems).toFixed(2)),
      avgSpeed: Number((filteredSystems.reduce((sum, sys) => sum + sys.avg_speed, 0) / totalSystems).toFixed(2)),
      avgResponseTime: Number((filteredSystems.reduce((sum, sys) => sum + sys.avg_time, 0) / totalSystems).toFixed(2)),
      telemetryActive,
      systemsByType,
      systemsByCompany,
      systemsByPool,
      healthySystems,
      warningSystems,
      criticalSystems
    }
  }, [filteredSystems])

  type Unit = 'GB' | 'GiB' | 'TB' | '%'

  function prepareUsedTrendsChart(usedUnit: Unit) {
    const labels = capacityData.map((item) => item.date)
    const dataUsed = capacityData.map((item) => {
      switch (usedUnit) {
        case 'TB':
          return Number((item.used / 1024).toFixed(2))
        case 'GiB':
          return Number((item.used / 1.073741824).toFixed(2))
        case 'GB':
          return item.used
        case '%':
        default:
          return item.perc_used
      }
    })

    return {
      labels,
      datasets: [
        {
          label: 'Used Capacity',
          data: dataUsed,
          borderColor: '#22c1d4',
          backgroundColor: 'rgba(34, 193, 212, 0.2)',
          tension: 0.2
        }
      ]
    }
  }

  function prepareSnapshotTrendsChart(snapUnit: Unit) {
    const labels = capacityData.map((item) => item.date)
    const dataSnap = capacityData.map((item) => {
      switch (snapUnit) {
        case 'TB':
          return Number((item.snap / 1024).toFixed(2))
        case 'GiB':
          return Number((item.snap / 1.073741824).toFixed(2))
        case 'GB':
          return item.snap
        case '%':
        default:
          return item.perc_snap
      }
    })

    return {
      labels,
      datasets: [
        {
          label: 'Snapshot Usage',
          data: dataSnap,
          borderColor: '#f8485e',
          backgroundColor: 'rgba(248, 72, 94, 0.2)',
          tension: 0.2
        }
      ]
    }
  }

  const computedBusinessMetrics = useMemo<BusinessMetric[]>(() => {
    if (!aggregatedStats) return []

    return [
      {
        title: 'Totale Capacità',
        value: aggregatedStats.totalCapacity.toString(),
        unit: 'GB',
        trend: 5,
        icon: Database,
        description: 'Capacità configurata sulle installazioni',
        subValue: `${aggregatedStats.usedCapacity} GB`,
        subDescription: 'utilizzati'
      },
      {
        title: 'Sistemi Monitorati',
        value: aggregatedStats.totalSystems.toString(),
        trend: 8,
        icon: Users,
        description: 'Installazioni attive',
        subValue: `${aggregatedStats.telemetryActive} attivi`,
        subDescription: 'telemetria'
      },
      {
        title: 'Prestazioni Medie',
        value: aggregatedStats.avgSpeed.toString(),
        unit: 'MB/s',
        trend: 3,
        icon: Activity,
        description: 'Throughput medio',
        subValue: `${aggregatedStats.avgResponseTime} ms`,
        subDescription: 'tempo risposta'
      },
      {
        title: 'Snapshot',
        value: aggregatedStats.usedSnapshots.toString(),
        unit: 'GB',
        trend: -2,
        icon: BarChart2,
        description: 'Snapshot utilizzati',
        subValue: `${aggregatedStats.avgSnapUsage} GB`,
        subDescription: 'media'
      }
    ]
  }, [aggregatedStats])

  return {
    aggregatedStats,
    filters,
    setFilters,
    filterOptions,
    isLoading,
    prepareUsedTrendsChart,
    prepareSnapshotTrendsChart,
    businessMetrics: () => computedBusinessMetrics,
    progress: 100
  }
}
