// backend/utils/generateSystemSummary.js
import firestore from '../firebase.js';

/**
 * Generates a fully-styled HTML email report of system health.
 *
 * @param {Number} [windowDays=21]  Look-back window (days)
 * @returns {String} HTML body ready to send
 */
export async function generateSystemSummary(windowDays = 21) {
  // 1) Fetch & filter data
  const snapshot = await firestore.collection('system_data').get();
  const systems  = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const now      = new Date();
  const cutoff   = new Date(now.getTime() - windowDays * 86_400_000);
  const recent   = systems.filter(s =>
    s.last_date &&
    new Date(s.last_date.replace(' ', 'T')) >= cutoff
  );

  // 2) Helpers
  const timeAgo = iso => {
    const then  = new Date(iso.replace(' ', 'T'));
    const diff  = now - then;
    const hours = diff / 3_600_000;
    const nice  = then.toLocaleString('en-US', {
      month:'short', day:'numeric', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
    return hours < 24
      ? `${Math.floor(hours)} h ago (${nice})`
      : `${Math.floor(hours/24)} d ago (${nice})`;
  };

  // Buckets per gravità
  const buckets = {
    critical:    [],
    alert:       [],
    attention:   [],
    noTelemetry: [],
    ok:          []
  };
  recent.forEach(s => {
    const used    = +s.perc_used || 0;
    const last    = new Date(s.last_date.replace(' ', 'T'));
    const isStale = s.sending_telemetry === 'False' || (now - last) > 86_400_000;
    const key     = isStale
      ? 'noTelemetry'
      : used > 90   ? 'critical'
      : used > 80   ? 'alert'
      : used > 70   ? 'attention'
      : 'ok';
    buckets[key].push(s);
  });
  const total = recent.length;

  // Colori per bucket
  const colors = {
    critical:    '#d32f2f',
    alert:       '#f57c00',
    attention:   '#fbc02d',
    noTelemetry: '#616161',
    ok:          '#388e3c'
  };

  // 3) Costruisco l’HTML
  const html = [];

  // 3-a) Stili centralizzati (con separatori e font più grandi per company/unit)
  html.push(`
    <div class="email-body">
      <style>
        .email-body { font-family:Arial,Helvetica,sans-serif; color:#333; }
        .header { font-size:14px; line-height:20px; margin-bottom:10px; }
        .header .title { font-size:18px; font-weight:bold; }
        .toc { font-size:14px; margin-bottom:15px; }
        .toc a { text-decoration:none; }

        .summary-table,
        .details-table {
          width:100%;
          border-collapse:collapse;
          margin-bottom:20px;
        }
        .summary-table th,
        .summary-table td,
        .details-table td {
          padding:6px 8px;
        }

        .details-table .icon {
          width:1px;
          padding:6px 4px 6px 0;
          vertical-align:top;
        }
        .details-table .info {
          padding:6px 0;
        }

        /* separatore orizzontale tra record */
        .details-divider {
          border: none;
          border-top: 1px solid #eee;
          margin: 12px 0;
        }

        .company {
          font-size:18px;        /* ingrandito da 15px a 18px */
          font-weight:bold;
          margin-bottom:4px;
        }
        .company span {
          font-size:16px;        /* unit_id a 16px */
          font-weight:normal;
          color:#555;
        }

        .details {
          font-size:13px;
          line-height:18px;
          margin-bottom:4px;
        }
        .details a            { color:#0288d1; text-decoration:none; }
        .status-active        { color:${colors.ok}; }
        .status-inactive      { color:${colors.critical}; }
      </style>
  `);

  // 3-b) Header
  html.push(`
      <div class="header">
        Hello,<br><br>
        <div class="title">System Health Report</div>
        ${now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}<br>
        Monitored window: last ${windowDays} days<br>
        Total systems analysed: <strong>${total}</strong>
      </div>
  `);

  // 3-c) Table of Contents (senza OK perché non c’è dettaglio)
  html.push(`
      <div class="toc">
        <strong>Jump to:</strong><br>
        <a href="#critical" style="color:${colors.critical}">🔴 Critical</a> |
        <a href="#alert" style="color:${colors.alert}">🟠 Alert</a> |
        <a href="#attention" style="color:${colors.attention}">🟡 Attention</a> |
        <a href="#no-telemetry" style="color:${colors.noTelemetry}">⚫ No Telemetry</a>
      </div>
  `);

  // 3-d) Summary table (includo OK)
  const pct = n => total ? (n/total*100).toFixed(1) + '%' : '0%';
  html.push(`
      <table class="summary-table">
        <tr>
          <th align="left" style="border-bottom:2px solid #eee;">Status</th>
          <th align="right" style="border-bottom:2px solid #eee;">Systems</th>
          <th align="right" style="border-bottom:2px solid #eee;">% of Total</th>
        </tr>
        ${[
          ['Critical (>90%)',   'critical'],
          ['Alert (>80%)',      'alert'],
          ['Attention (>70%)',  'attention'],
          ['No Telemetry',      'noTelemetry'],
          ['OK',                'ok']
        ].map(([label, key]) => `
          <tr>
            <td style="color:${colors[key]};"><strong>${label}</strong></td>
            <td align="right">${buckets[key].length}</td>
            <td align="right">${pct(buckets[key].length)}</td>
          </tr>
        `).join('')}
      </table>
  `);

  // 3-e) Dettagli per bucket (escludendo 'ok')
  function renderSection(key, label, emoji) {
    const list = buckets[key];
    if (!list.length) return '';
    list.sort((a,b) =>
      key === 'noTelemetry'
        ? new Date(b.last_date) - new Date(a.last_date)
        : (+b.perc_used) - (+a.perc_used)
    );

    const rows = list.map((s, idx) => {
      const {
        id, unit_id, company = id, pool='–', name='–', type='–',
        perc_used=0, used=0, avail=0, last_date, sending_telemetry
      } = s;
      const last  = new Date(last_date.replace(' ', 'T'));
      const stale = sending_telemetry === 'False' || (now - last) > 86_400_000;
      const usage = `<strong>${(+perc_used).toFixed(2)}%</strong> (${(+used).toLocaleString()} GB used / ${(+avail).toLocaleString()} GB free)`;
      const status = stale
        ? `<span class="status-inactive">Inactive ❌</span>`
        : `<span class="status-active">Active ✅</span>`;
      const link = `https://avalon.staging.storvix.eu/systems/${unit_id}`;

      let row = `
        <tr>
          <td class="icon">${emoji}</td>
          <td class="info">
            <div class="company" style="color:${colors[key]};">
              ${company} <span>(${unit_id})</span>
            </div>
            <div class="details">
              ${stale ? '⚠️ ' : ''}${usage}<br>
              Last telemetry:
                <time datetime="${last.toISOString()}">${timeAgo(last_date)}</time><br>
              Pool: ${pool} | Company: ${name} | Type: ${type}<br>
              Telemetry: ${status}<br>
              <a href="${link}">Open in Avalon</a>
            </div>
          </td>
        </tr>
      `;

      // divider tranne dopo l'ultimo
      if (idx < list.length - 1) {
        row += `
          <tr>
            <td colspan="2">
              <hr class="details-divider">
            </td>
          </tr>
        `;
      }
      return row;
    }).join('\n');

    return `
      <h3 id="${key}" style="color:${colors[key]};">
        ${emoji} ${label}
      </h3>
      <table class="details-table">
        ${rows}
      </table>
    `;
  }

  html.push(
    renderSection('critical',    'Critical Systems',          '🔴'),
    renderSection('alert',       'Alert Systems',             '🟠'),
    renderSection('attention',   'Attention Systems',         '🟡'),
    renderSection('noTelemetry', 'Systems Without Telemetry', '⚫')
  );

  // 3-f) Signature
  html.push(`
      <p style="font-size:13px; margin-top:30px;">
        Regards,<br>
        📡 <strong>System Health Bot v2.1</strong><br>
        STORViX Monitoring Platform
      </p>
    </div>
  `);

  return html.join('\n');
}
