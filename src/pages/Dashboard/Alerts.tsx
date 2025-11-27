// src/pages/Dashboard/Alerts.tsx
import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  XCircle,
  Activity,
  AlertCircle,
  Lock
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSubscriptionPermissions } from '../../hooks/useSubscriptionPermissions'

export interface Alert {
  unit_id: string
  hostid: string
  pool: string
  company: string
  message: string
  date: string
  type:
    | 'forecast'
    | 'suddenIncrease'
    | 'suddenDecrease'
    | 'inactivity'
    | 'telemetryInactive'
    | 'highGrowth'
  importance: 'white' | 'blue' | 'red'
}

interface AlertsProps {
  filters: {
    company: string
    type: string
    pool: string
    telemetry: string
    timeRange: string
  }
}

const dummyAlerts: Alert[] = [
  {
    unit_id: 'SYS-001',
    hostid: 'host-01',
    pool: 'pool-a',
    company: 'Acme',
    message: 'Capacità in crescita del 15% negli ultimi 7 giorni',
    date: '2024-05-20T10:00:00',
    type: 'highGrowth',
    importance: 'blue'
  },
  {
    unit_id: 'SYS-002',
    hostid: 'host-02',
    pool: 'pool-b',
    company: 'Globex',
    message: 'Telemetria inattiva da 48 ore',
    date: '2024-05-18T14:30:00',
    type: 'telemetryInactive',
    importance: 'red'
  },
  {
    unit_id: 'SYS-003',
    hostid: 'host-03',
    pool: 'pool-a',
    company: 'Acme',
    message: 'Utilizzo stabile, nessuna azione richiesta',
    date: '2024-05-15T09:15:00',
    type: 'forecast',
    importance: 'white'
  }
]

const Alerts: React.FC<AlertsProps> = ({ filters }) => {
  const { user } = useAuth()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const { canAccess: alertsListCanAccess, shouldBlur: alertsListShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AlertsList')
  const { canAccess: allAlertsLinkCanAccess, shouldBlur: allAlertsLinkShouldBlur } =
    useSubscriptionPermissions('Alerts', 'AllAlertsLink')

  useEffect(() => {
    const filtered = dummyAlerts.filter((alert) => {
      if (filters.company !== 'all' && alert.company !== filters.company) return false
      if (filters.pool !== 'all' && alert.pool !== filters.pool) return false
      if (user?.role === 'employee' || user?.role === 'customer') {
        return alert.company === user.company
      }
      if (user?.role === 'admin_employee') {
        const visible = user.visibleCompanies || []
        if (visible.length && !visible.includes(alert.company)) return false
      }
      return true
    })

    setAlerts(filtered)
    setLoading(false)
  }, [filters, user])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[#eeeeee]">Loading dummy alerts...</div>
      </div>
    )
  }

  const iconMap = {
    forecast: AlertCircle,
    suddenIncrease: TrendingUp,
    suddenDecrease: TrendingDown,
    inactivity: AlertTriangle,
    telemetryInactive: XCircle,
    highGrowth: Activity
  }

  return (
    <div className="bg-[#0b3c43] rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#22c1d4]" />
          <h2 className="text-lg font-semibold">Active Alerts</h2>
        </div>
        {allAlertsLinkCanAccess && (
          <Link
            to="/alerts"
            className={`text-[#22c1d4] text-sm hover:underline ${allAlertsLinkShouldBlur ? 'blur-sm pointer-events-none' : ''}`}
          >
            View all
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="text-sm text-[#eeeeee]/70">Nessun alert da mostrare.</div>
        )}

        {alerts.map((alert, index) => {
          const Icon = iconMap[alert.type]
          const severityColor =
            alert.importance === 'red'
              ? 'text-[#f8485e]'
              : alert.importance === 'blue'
              ? 'text-[#22c1d4]'
              : 'text-[#eeeeee]'

          return (
            <div
              key={`${alert.unit_id}-${index}`}
              className={`flex items-start gap-3 p-3 rounded-lg bg-[#06272b] ${alertsListShouldBlur ? 'blur-sm pointer-events-none' : ''}`}
            >
              <div className={`mt-1 ${severityColor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-[#eeeeee]/70">
                  <span>{alert.company}</span>
                  <span className="text-[#22c1d4]">•</span>
                  <span>{alert.pool}</span>
                </div>
                <p className="text-[#eeeeee] text-sm">{alert.message}</p>
                <div className="text-xs text-[#eeeeee]/50 mt-1 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(alert.date), 'MMM dd, yyyy HH:mm')}
                </div>
              </div>
              {alertsListShouldBlur && (
                <div className="flex items-center gap-2 text-white text-sm">
                  <Lock className="w-4 h-4" />
                  <span>Upgrade</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Alerts
