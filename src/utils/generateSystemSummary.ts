// src/utils/generateSystemSummary.ts
import firestore from '../firebaseClient'
import { collection, getDocs } from 'firebase/firestore'

/**
 * Generates a fully-styled HTML email report of system health.
 * Includes OK in the summary table, but only details for
 * critical/alert/attention/noTelemetry buckets.
 */
export async function generateSystemSummary(): Promise<string> {
  // 1) Fetch & filter data
  const snap = await getDocs(collection(firestore, 'system_data'))
  const systems = snap.docs.map(d => ({
    id: d.id,
    ...(d.data() as {
      name: string
      hostid: string
      pool: string
      company: string
      type: string
      last_date: string      // "YYYY-MM-DD HH:mm:ss"
      perc_used: number
      avail: number
      used: number
      perc_snap: number
      avg_speed: number
      avg_time: number
      sending_telemetry: 'True' | 'False'
    })
  }))

  const now = new Date()
  const cutoff = new Date(now.getTime() - 21 * 24 * 3600 * 1000)
  const recent = systems.filter(s =>
    new Date(s.last_date.replace(' ', 'T')) >= cutoff
  )

  // 2) timeAgo helper
  function timeAgo(iso: string): string {
    const then = new Date(iso.replace(' ', 'T'))
    const diffH = (now.getTime() - then.getTime()) / 1000 / 3600
    if (diffH < 24) {
      const h = Math.floor(diffH)
      return `${h} hour${h !== 1 ? 's' : ''} ago`
    }
    const d = Math.floor(diffH / 24)
    return `${d} day${d !== 1 ? 's' : ''} ago`
  }

  // 3) Bucket categorization
  type Category = 'critical' | 'alert' | 'attention' | 'noTelemetry' | 'ok'
  const buckets: Record<Category, typeof recent> = {
    critical: [], alert: [], attention: [], noTelemetry: [], ok: []
  }

  recent.forEach(s => {
    const lastTs = new Date(s.last_date.replace(' ', 'T')).getTime()
    const stale = s.sending_telemetry === 'False'
      || (now.getTime() - lastTs) > 24 * 3600 * 1000
    if (stale) {
      buckets.noTelemetry.push(s)
    } else if (s.perc_used > 90) {
      buckets.critical.push(s)
    } else if (s.perc_used > 80) {
      buckets.alert.push(s)
    } else if (s.perc_used > 70) {
      buckets.attention.push(s)
    } else {
      buckets.ok.push(s)
    }
  })

  const total = recent.length

  // 4) Colors per bucket
  const colors: Record<Category, string> = {
    critical:    '#d32f2f',
    alert:       '#f57c00',
    attention:   '#fbc02d',
    noTelemetry: '#616161',
    ok:          '#388e3c'
  }

  // 5) Build HTML
  const html: string[] = []

  // 5-a) Centralized CSS
  html.push(`
<div class="email-body">
  <style>
    .email-body { font-family:Arial,Helvetica,sans-serif; color:#333; }
    .header { font-size:14px; line-height:20px; margin-bottom:10px; }
    .header .title { font-size:18px; font-weight:bold; }
    .toc { font-size:14px; margin-bottom:15px; }
    .toc a { text-decoration:none; }

    .summary-table, .details-table {
      width:100%; border-collapse:collapse; margin-bottom:20px;
    }
    .summary-table th, .summary-table td,
    .details-table td {
      padding:6px 8px;
    }
    .details-table .icon {
      width:1px; padding:6px 4px 6px 0; vertical-align:top;
    }
    .details-table .info {
      padding:6px 0;
    }
    .details-divider {
      border:none; border-top:1px solid #eee; margin:12px 0;
    }
    .company {
      font-size:18px; font-weight:bold; margin-bottom:4px;
    }
    .company span {
      font-size:16px; font-weight:normal; color:#555;
    }
    .details {
      font-size:13px; line-height:18px; margin-bottom:4px;
    }
    .details a { color:#0288d1; text-decoration:none; }
    .status-active { color:${colors.ok}; }
    .status-inactive { color:${colors.critical}; }
  </style>
`)

  // 5-b) Header
  html.push(`
  <div class="header">
    Hello,<br><br>
    <div class="title">System Health Report</div>
    ${now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}<br>
    Monitored window: last 3 weeks<br>
    Total systems analysed: <strong>${total}</strong>
  </div>
`)

  // 5-c) Table of Contents (omit OK)
  html.push(`
  <div class="toc">
    <strong>Jump to:</strong><br>
    <a href="#critical" style="color:${colors.critical}">🔴 Critical</a> |
    <a href="#alert" style="color:${colors.alert}">🟠 Alert</a> |
    <a href="#attention" style="color:${colors.attention}">🟡 Attention</a> |
    <a href="#no-telemetry" style="color:${colors.noTelemetry}">⚫ No Telemetry</a>
  </div>
`)

  // 5-d) Summary table (include OK)
  const pct = (n: number) => total ? (n / total * 100).toFixed(1) + '%' : '0%'
  html.push(`
  <table class="summary-table">
    <tr>
      <th align="left" style="border-bottom:2px solid #eee;">Status</th>
      <th align="right" style="border-bottom:2px solid #eee;">Systems</th>
      <th align="right" style="border-bottom:2px solid #eee;">% of Total</th>
    </tr>
    ${([
      ['Critical (>90%)',   'critical'] as const,
      ['Alert (>80%)',      'alert']    as const,
      ['Attention (>70%)',  'attention']as const,
      ['No Telemetry',      'noTelemetry'] as const,
      ['OK',                'ok']       as const
    ]).map(([label, key]) => `
      <tr>
        <td style="color:${colors[key]};"><strong>${label}</strong></td>
        <td align="right">${buckets[key].length}</td>
        <td align="right">${pct(buckets[key].length)}</td>
      </tr>
    `).join('')}
  </table>
`)

  // 5-e) Detail sections (no OK)
  function renderSection(key: Category, label: string, emoji: string): string {
    const list = buckets[key]
    if (!list.length) return ''
    list.sort((a, b) =>
      key === 'noTelemetry'
        ? +new Date(b.last_date) - +new Date(a.last_date)
        : b.perc_used - a.perc_used
    )

    const rows = list.map((s, idx) => {
      const last = new Date(s.last_date.replace(' ', 'T'))
      const stale = s.sending_telemetry === 'False'
        || (now.getTime() - last.getTime()) > 24 * 3600 * 1000
      const usage = `<strong>${s.perc_used.toFixed(2)}%</strong> (${s.used.toLocaleString()} GB used / ${s.avail.toLocaleString()} GB free)`
      const status = stale
        ? `<span class="status-inactive">Inactive ❌</span>`
        : `<span class="status-active">Active ✅</span>`
      const link = `https://avalon.staging.storvix.eu/systems/${s.hostid}`

      let row = `
      <tr>
        <td class="icon">${emoji}</td>
        <td class="info">
          <div class="company" style="color:${colors[key]}">
            ${s.company} <span>(${s.hostid})</span>
          </div>
          <div class="details">
            ${stale ? '⚠️ ' : ''}${usage}<br>
            Last telemetry:
              <time datetime="${last.toISOString()}">${timeAgo(s.last_date)}</time><br>
            Pool: ${s.pool} | Type: ${s.type}<br>
            Telemetry: ${status}<br>
            <a href="${link}">Open in Avalon</a>
          </div>
        </td>
      </tr>`

      if (idx < list.length - 1) {
        row += `
      <tr>
        <td colspan="2">
          <hr class="details-divider">
        </td>
      </tr>`
      }

      return row
    }).join('\n')

    return `
  <h3 id="${key}" style="color:${colors[key]}">${emoji} ${label}</h3>
  <table class="details-table">
    ${rows}
  </table>
`
  }

  html.push(
    renderSection('critical',    'Critical Systems',          '🔴'),
    renderSection('alert',       'Alert Systems',             '🟠'),
    renderSection('attention',   'Attention Systems',         '🟡'),
    renderSection('noTelemetry', 'Systems Without Telemetry', '⚫')
  )

  // 5-f) Signature
  html.push(`
  <p style="font-size:13px; margin-top:30px;">
    Regards,<br>
    📡 <strong>System Health Bot v2.1</strong><br>
    STORViX Monitoring Platform
  </p>
</div>
`)

  return html.join('\n')
}
