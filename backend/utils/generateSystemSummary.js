// backend/utils/generateSystemSummary.js
import firestore from '../firebase.js';

/**
 * Returns a string with the full summary of systems,
 * sorted by severity, ready to place in an email body.
 * Includes only systems whose last_date is within the last 3 weeks.
 */
export async function generateSystemSummary() {
  // 1) Fetch data using admin SDK
  const snapshot = await firestore.collection('system_data').get();
  const systems = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Filter: only systems with last_date in the past 3 weeks
  const now = new Date();
  const cutoff = new Date(now.getTime() - 21 * 24 * 3600 * 1000);
  const recentSystems = systems.filter(s => new Date(s.last_date.replace(' ', 'T')) >= cutoff);

  // Helper for "X hours/days ago"
  function timeAgo(iso) {
    const then = new Date(iso.replace(' ', 'T'));
    const diffMs = Date.now() - then.getTime();
    const diffH = diffMs / 1000 / 3600;
    if (diffH < 24) {
      const h = Math.floor(diffH);
      return `${h} hour${h !== 1 ? 's' : ''} ago`;
    } else {
      const d = Math.floor(diffH / 24);
      return `${d} day${d !== 1 ? 's' : ''} ago`;
    }
  }

  // Categorization
  const buckets = {
    critical: [],
    alert: [],
    attention: [],
    noTelemetry: [],
    ok: []
  };

  recentSystems.forEach(s => {
    const perc = s.perc_used;
    const lastTs = new Date(s.last_date.replace(' ', 'T')).getTime();
    const stale = s.sending_telemetry === 'False' || (now.getTime() - lastTs) > 24 * 3600 * 1000;

    if (stale) {
      buckets.noTelemetry.push(s);
    } else if (perc > 90) {
      buckets.critical.push(s);
    } else if (perc > 80) {
      buckets.alert.push(s);
    } else if (perc > 70) {
      buckets.attention.push(s);
    } else {
      buckets.ok.push(s);
    }
  });

  // Build email body
  let out = `Hello,\n\nhere is the updated summary of monitored systems (last 3 weeks):\n\n`;

  // Summary table
  const counts = {
    OK: buckets.ok.length,
    'Attention (>70%)': buckets.attention.length,
    'Alert (>80%)': buckets.alert.length,
    'Critical (>90%)': buckets.critical.length,
    'No Telemetry': buckets.noTelemetry.length
  };
  out += '📊 **Summary Table:**\n';
  out += '| Status              | Number of Systems |\n';
  out += '|--------------------|-------------------|\n';
  for (const [st, num] of Object.entries(counts)) {
    out += `| ${st.padEnd(18)} | ${num.toString().padEnd(17)} |\n`;
  }
  out += '\n---\n\n';

  // Section helper
  function section(emoji, title, list) {
    if (!list.length) return '';
    let s = `${emoji} ${title}:\n`;
    list.forEach(sys => {
      s += `- ${sys.name}:\n`;
      s += `  • HostID: ${sys.hostid}\n`;
      s += `  • Pool: ${sys.pool}\n`;
      s += `  • Company: ${sys.company}\n`;
      s += `  • Type: ${sys.type}\n`;
      s += `  • Last Telemetry: ${timeAgo(sys.last_date)} (${sys.last_date})\n`;
      s += `  • Capacity Used: ${sys.perc_used}%\n`;
      s += `  • Used Space: ${sys.used} GB\n`;
      s += `  • Free Space: ${sys.avail} GB\n`;
      if (sys.perc_snap > 0) {
        s += `  • Snapshots Used: ${sys.perc_snap}%\n`;
      }
      if (sys.avg_speed === 0 || sys.avg_time === 0) {
        s += `  • Avg Speed: ${sys.avg_speed}, Avg Time: ${sys.avg_time}\n`;
      }
      s += `  • Telemetry Status: ${sys.sending_telemetry}\n\n`;
    });
    s += '---\n\n';
    return s;
  }

  out += section('🔴', 'Critical Systems', buckets.critical);
  out += section('🟠', 'Alert Systems', buckets.alert);
  out += section('🟡', 'Attention Systems', buckets.attention);
  out += section('⚫', 'Systems Without Telemetry', buckets.noTelemetry);

  out += 'Best regards,\nYour automated system\n';
  return out;
}
