// ─── Routes vs Locations Trend ────────────────────────────────────────────
async function loadRouteVsLocation(sb, since30) {
  const RVL_EVENTS = ['route.alarm_toggled.on', 'location.alarm_toggled.on'];
  const scopedRows = await fetchScopedFeatureRows(sb, since30);
  let data, error;
  if (scopedRows) {
    // Scope filter active — use device_feature_events (filterable) instead of the global aggregate.
    data = scopedRows.filter(r => RVL_EVENTS.includes(r.event_name));
    error = null;
  } else {
    ({ data, error } = await sb
      .from('feature_events')
      .select('event_name, event_date, count')
      .in('event_name', RVL_EVENTS)
      .gte('event_date', since30));
  }

  if (error || !data?.length) {
    const msg = error ? `שגיאה: ${error.message}` : 'אין נתוני הפעלת מסלולים/מיקומים עדיין';
    showEmptyState('chart-routes-trend', msg);
    ['kpi-route-recent', 'kpi-route-early', 'kpi-route-trend'].forEach(id => setText(id, '—'));
    return;
  }

  const byDate = {};
  data.forEach(r => {
    if (!byDate[r.event_date]) byDate[r.event_date] = { route: 0, location: 0 };
    if (r.event_name === 'route.alarm_toggled.on') byDate[r.event_date].route    += r.count;
    else                                           byDate[r.event_date].location += r.count;
  });

  const labels       = Object.keys(byDate).sort();
  const routeData    = labels.map(d => byDate[d].route);
  const locationData = labels.map(d => byDate[d].location);
  const totalPerDay  = labels.map(d => byDate[d].route + byDate[d].location);
  const routePct     = labels.map((d, i) => totalPerDay[i] > 0 ? Math.round(byDate[d].route / totalPerDay[i] * 100) : 0);

  const recent = labels.slice(-7);
  const rRoute = recent.reduce((s, d) => s + byDate[d].route, 0);
  const rTotal = recent.reduce((s, d) => s + byDate[d].route + byDate[d].location, 0);
  const recentPct = rTotal > 0 ? Math.round(rRoute / rTotal * 100) : 0;

  const early = labels.slice(0, 7);
  const eRoute = early.reduce((s, d) => s + byDate[d].route, 0);
  const eTotal = early.reduce((s, d) => s + byDate[d].route + byDate[d].location, 0);
  const earlyPct = eTotal > 0 ? Math.round(eRoute / eTotal * 100) : 0;

  setText('kpi-route-recent', recentPct + '%');
  setText('kpi-route-early',  earlyPct  + '%');
  const diff = recentPct - earlyPct;
  const trendEl = document.getElementById('kpi-route-trend');
  if (trendEl) {
    trendEl.textContent = (diff >= 0 ? '↑ +' : '↓ ') + diff + '%';
    trendEl.style.color = diff >= 0 ? '#10b981' : '#f87171';
  }

  renderChart('chart-routes-trend', {
    type: 'line',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        { label: '% מסלולים מסך הפעלות', data: routePct, borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.3, pointRadius: 3 },
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// EXPLORER — חקירה חופשית
// ══════════════════════════════════════════════════════════════════════════

const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const DIM_INFO = {
  hour:         { label: 'שעה ביום',          timeOnly: true },
  dow:          { label: 'יום בשבוע',         timeOnly: false },
  dom:          { label: 'יום בחודש',         timeOnly: false },
  month:        { label: 'חודש',               timeOnly: false },
  version:      { label: 'גרסת אפליקציה',    timeOnly: false },
  manufacturer: { label: 'יצרן מכשיר',        timeOnly: false },
  outcome:      { label: 'תוצאת התראה',       timeOnly: false, alarmOnly: true },
};

const METRIC_INFO = {
  alarm_count:     { label: 'הפעלות התראה',    table: 'alarm_sessions', noTimestamp: false },
  alarm_success:   { label: '% הצלחה',          table: 'alarm_sessions', isPercent: true, noTimestamp: false },
  dau:             { label: 'משתמשים פעילים',   table: 'device_daily_active', dateOnly: true },
  new_users:       { label: 'משתמשים חדשים',    table: 'device_daily_active', dateOnly: true },
  revenue:         { label: 'הכנסות (₪)',        table: 'revenue_events', noTimestamp: false },
  location_created:{ label: 'יצירת מיקומים',   table: 'feature_events', dateOnly: true },
  route_on:        { label: 'הפעלת מסלולים',    table: 'feature_events', dateOnly: true },
};

function updateExplorerUI() {
  const metric = document.getElementById('exp-metric').value;
  const dimSel = document.getElementById('exp-dim');
  const mInfo  = METRIC_INFO[metric];

  Array.from(dimSel.options).forEach(opt => {
    const dInfo = DIM_INFO[opt.value];
    let disabled = false;
    // "שעה ביום" — only for full-timestamp sources
    if (opt.value === 'hour' && mInfo.dateOnly) disabled = true;
    // "תוצאת התראה" — only for alarm metrics
    if (dInfo.alarmOnly && !['alarm_count', 'alarm_success'].includes(metric)) disabled = true;
    // version / manufacturer — not available for feature_events
    if (['version', 'manufacturer'].includes(opt.value) && (mInfo.table === 'feature_events' || metric === 'new_users')) disabled = true;
    opt.disabled = disabled;
    if (disabled && dimSel.value === opt.value) dimSel.value = 'dow';
  });
}

// Extract dimension key from a row
function getDimKey(row, dim, timeField) {
  const raw = row[timeField];
  if (raw === undefined || raw === null) return null;

  if (dim === 'version')      return row.app_version   || 'unknown';
  if (dim === 'manufacturer') return row.manufacturer  || 'unknown';
  if (dim === 'outcome')      return row.outcome        || '(open)';

  // Time-based dims
  const d = new Date(raw);
  if (isNaN(d)) return null;
  switch (dim) {
    case 'hour':  return raw.length <= 10 ? null : d.getHours();
    case 'dow':   return d.getDay();
    case 'dom':   return d.getDate();
    case 'month': return raw.slice(0, 7);
    default:      return null;
  }
}

function dimKeyToLabel(key, dim) {
  if (dim === 'dow')  return DOW_NAMES[key] ?? key;
  if (dim === 'hour') return `${String(key).padStart(2,'0')}:00`;
  return String(key);
}

function sortKeys(keys, dim) {
  if (['hour','dow','dom'].includes(dim)) return keys.sort((a, b) => Number(a) - Number(b));
  return keys.sort();
}

async function runExplorer() {
  const metric = document.getElementById('exp-metric').value;
  const dim    = document.getElementById('exp-dim').value;
  const period = parseInt(document.getElementById('exp-period').value);
  const sb     = getClient();
  const since  = period >= 9999 ? '2024-01-01' : dateNDaysAgo(period);

  const btn = document.getElementById('exp-run-btn');
  btn.disabled = true;
  btn.textContent = 'טוען...';
  document.getElementById('exp-empty').style.display = 'none';
  const canvas = document.getElementById('chart-explorer');
  canvas.style.display = 'none';
  document.getElementById('exp-result').style.justifyContent = 'flex-start';
  document.getElementById('exp-result').style.alignItems = 'flex-start';

  try {
    let result;
    if (metric === 'alarm_count' || metric === 'alarm_success') {
      result = await explorerAlarms(sb, since, metric, dim);
    } else if (metric === 'dau') {
      result = await explorerDAU(sb, since, dim);
    } else if (metric === 'new_users') {
      result = await explorerNewUsers(sb, since, dim);
    } else if (metric === 'revenue') {
      result = await explorerRevenue(sb, since, dim);
    } else {
      result = await explorerFeatureEvent(sb, since, metric, dim);
    }

    document.getElementById('exp-desc').textContent = result.description;

    canvas.style.display = 'block';
    const isPercent = METRIC_INFO[metric].isPercent;

    renderChart('chart-explorer', {
      type: result.type || 'bar',
      data: {
        labels: result.labels,
        datasets: [{
          label: result.metricLabel,
          data: result.values,
          backgroundColor: result.color || '#3b82f6',
          borderColor: result.borderColor || result.color || '#3b82f6',
          borderWidth: result.type === 'line' ? 2 : 0,
          borderRadius: result.type !== 'line' ? 4 : undefined,
          fill: result.type === 'line',
          tension: 0.3,
          pointRadius: result.type === 'line' ? 4 : 0,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                return ` ${result.metricLabel}: ${isPercent ? v + '%' : (result.prefix || '') + (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : v)}`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxRotation: 45, maxTicksLimit: 30 }, grid: { color: '#1a1f30' } },
          y: {
            position: 'right',
            ticks: {
              color: '#64748b',
              callback: v => isPercent ? v + '%' : (result.prefix || '') + v,
            },
            grid: { color: '#1a1f30' },
            beginAtZero: true,
            max: isPercent ? 100 : undefined,
          },
        }
      }
    });
  } catch (e) {
    console.error('Explorer error:', e);
    document.getElementById('exp-desc').textContent = '⚠️ שגיאה: ' + (e.message || 'שגיאה לא ידועה');
    document.getElementById('exp-empty').textContent = '⚠️ לא ניתן לטעון נתונים';
    document.getElementById('exp-empty').style.display = 'block';
    document.getElementById('exp-result').style.justifyContent = 'center';
    document.getElementById('exp-result').style.alignItems = 'center';
  }

  btn.disabled = false;
  btn.textContent = 'הצג גרף ▶';
}

async function explorerAlarms(sb, since, metric, dim) {
  const { data, error } = await rpcAlarmSessions(sb, since + 'T00:00:00Z', 100000);

  if (error || !data?.length) throw new Error('אין נתוני התראות בתקופה זו');

  const groups = {};
  data.forEach(row => {
    const key = getDimKey(row, dim, 'started_at');
    if (key === null) return;
    if (!groups[key]) groups[key] = { total: 0, realTotal: 0, triggered: 0 };
    groups[key].total++; // all activations — used by alarm_count
    // % הצלחה denominator = real trips only (excludes toggle noise), so it matches the headline.
    if (isRealTripSession(row)) {
      groups[key].realTotal++;
      if (isRealtimeTriggered(row)) groups[key].triggered++;
    }
  });

  const keys = sortKeys(Object.keys(groups), dim);

  if (metric === 'alarm_count') {
    return {
      labels: keys.map(k => dimKeyToLabel(k, dim)),
      values: keys.map(k => groups[k].total),
      metricLabel: 'הפעלות התראה',
      color: '#3b82f6',
      description: `הפעלות התראה לפי ${DIM_INFO[dim].label} — ${data.length.toLocaleString()} sessions סה"כ (מ-${since})`,
    };
  } else {
    return {
      labels: keys.map(k => dimKeyToLabel(k, dim)),
      values: keys.map(k => groups[k].realTotal > 0 ? Math.round(groups[k].triggered / groups[k].realTotal * 100) : 0),
      metricLabel: '% הצלחה',
      color: '#10b981',
      description: `אחוז הצלחה לפי ${DIM_INFO[dim].label} — מתוך נסיעות אמיתיות (ללא הדלקה/כיבוי מהיר וכבר-בפנים), מ-${since})`,
    };
  }
}

async function explorerDAU(sb, since, dim) {
  const fields = ['device_id_anon', 'event_date'];
  if (dim === 'version')      fields.push('app_version');
  if (dim === 'manufacturer') fields.push('manufacturer');

  // Guard against clock-skewed devices that wrote a future event_date (belt-and-suspenders
  // alongside the server-side clamp in mark_device_active).
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data, error } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select(fields.join(', '))
    .gte('event_date', since)
    .lte('event_date', todayStr));

  if (error || !data?.length) throw new Error('אין נתוני DAU בתקופה זו');

  const groups = {};
  data.forEach(row => {
    const key = getDimKey(row, dim, 'event_date');
    if (key === null) return;
    if (!groups[key]) groups[key] = new Set();
    groups[key].add(row.device_id_anon);
  });

  const keys = sortKeys(Object.keys(groups), dim);
  const isDistrib = ['version', 'manufacturer'].includes(dim);

  return {
    labels: keys.map(k => dimKeyToLabel(k, dim)),
    values: keys.map(k => groups[k].size),
    metricLabel: isDistrib ? 'מכשירים ייחודיים (חודש)' : 'פעילים יומיים (ממוצע)',
    color: '#6366f1',
    description: `משתמשים פעילים לפי ${DIM_INFO[dim].label} — מ-${since} (${new Set(data.map(r => r.device_id_anon)).size.toLocaleString()} מכשירים ייחודיים)`,
  };
}

async function explorerNewUsers(sb, since, dim) {
  const since90 = DATA_START_DATE;
  // Ignore future-dated rows from clock-skewed devices so "first seen" is never in the future.
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data, error } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', since90)
    .lte('event_date', todayStr)
    .order('event_date', { ascending: true }));

  if (error || !data?.length) throw new Error('אין נתוני משתמשים');

  const firstSeen = {};
  data.forEach(r => {
    if (!firstSeen[r.device_id_anon] || r.event_date < firstSeen[r.device_id_anon])
      firstSeen[r.device_id_anon] = r.event_date;
  });

  const newUsers = Object.entries(firstSeen).filter(([, date]) => date >= since);

  const groups = {};
  newUsers.forEach(([, date]) => {
    const key = getDimKey({ event_date: date }, dim, 'event_date');
    if (key === null) return;
    groups[key] = (groups[key] || 0) + 1;
  });

  const keys = sortKeys(Object.keys(groups), dim);
  return {
    labels: keys.map(k => dimKeyToLabel(k, dim)),
    values: keys.map(k => groups[k]),
    metricLabel: 'משתמשים חדשים',
    color: '#10b981',
    description: `משתמשים חדשים לפי ${DIM_INFO[dim].label} — ${newUsers.length.toLocaleString()} חדשים מ-${since}`,
  };
}

async function explorerRevenue(sb, since, dim) {
  const { data: rawData, error } = await rpcRevenueEvents(sb, since + 'T00:00:00Z', 'PRODUCTION', 10000);
  const data = (rawData || []).filter(r => ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'].includes(r.event_type));

  if (error) throw new Error('שגיאת הרשאה — ודא שה-migration הורץ');
  if (!data?.length) throw new Error('אין נתוני הכנסות בתקופה זו');

  const groups = {};
  data.forEach(row => {
    const key = dim === 'product' ? (row.product_id || 'unknown') : getDimKey(row, dim, 'occurred_at');
    if (key === null) return;
    groups[key] = (groups[key] || 0) + (row.price_in_currency || 0);
  });

  const keys = sortKeys(Object.keys(groups), dim);
  const total = data.reduce((s, r) => s + (r.price_in_currency || 0), 0);

  return {
    labels: keys.map(k => dimKeyToLabel(k, dim)),
    values: keys.map(k => +groups[k].toFixed(2)),
    metricLabel: 'הכנסות (₪)',
    prefix: '₪',
    color: '#f59e0b',
    description: `הכנסות לפי ${DIM_INFO[dim].label} — סה"כ ₪${total.toFixed(0)} מ-${data.length} עסקאות (מ-${since})`,
  };
}

async function explorerFeatureEvent(sb, since, metric, dim) {
  const eventName   = metric === 'location_created' ? 'location.created' : 'route.alarm_toggled.on';
  const metricLabel = metric === 'location_created' ? 'יצירת מיקומים' : 'הפעלת מסלולים';
  const color       = metric === 'location_created' ? '#8b5cf6' : '#6366f1';

  const { data, error } = await sb
    .from('feature_events')
    .select('event_date, count')
    .eq('event_name', eventName)
    .gte('event_date', since)
    .lte('event_date', new Date().toISOString().slice(0, 10));

  if (error || !data?.length) throw new Error(`אין נתוני ${metricLabel} בתקופה זו`);

  const groups = {};
  data.forEach(row => {
    const key = getDimKey({ event_date: row.event_date }, dim, 'event_date');
    if (key === null) return;
    groups[key] = (groups[key] || 0) + row.count;
  });

  const keys  = sortKeys(Object.keys(groups), dim);
  const total = data.reduce((s, r) => s + r.count, 0);

  return {
    labels: keys.map(k => dimKeyToLabel(k, dim)),
    values: keys.map(k => groups[k]),
    metricLabel,
    color,
    description: `${metricLabel} לפי ${DIM_INFO[dim].label} — סה"כ ${total.toLocaleString()} אירועים (מ-${since})`,
  };
}

// ─── Success Rate Trend ────────────────────────────────────────────────────
async function loadSuccessRateTrend(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);

  if (error || !data?.length) {
    const msg = error ? `שגיאה: ${error.message}` : 'אין נתונים על sessions עדיין';
    showEmptyState('chart-success-trend', msg);
    showEmptyState('chart-success-trend-alarms', msg);
    return;
  }

  const byDate = {};
  data.forEach(r => {
    const d = (r.started_at || '').slice(0, 10);
    if (!d) return;
    // Denominator = real trips only — neutral noise (<2m cancels / already-inside) is excluded,
    // but soft-success sessions are still counted as a successful trip rather than a failure.
    if (!isRealTripSession(r)) return;
    if (!byDate[d]) byDate[d] = { total: 0, triggered: 0 };
    byDate[d].total += 1;
    if (isTrueSuccessSession(r)) byDate[d].triggered += 1;
  });

  const labels = Object.keys(byDate).sort();
  if (labels.length < 1) {
    showEmptyState('chart-success-trend', 'אין מספיק נתונים עדיין');
    showEmptyState('chart-success-trend-alarms', 'אין מספיק נתונים עדיין');
    return;
  }

  // מינימום 1 session כדי לחשב אחוז
  const rates = labels.map(d =>
    byDate[d].total >= 1 ? Math.round(byDate[d].triggered / byDate[d].total * 100) : null
  );

  // 7-day trailing moving average — ממוצע משוקלל: סך ההצלחות חלקי סך הנסיעות בחלון
  // (ולא ממוצע אחוזי הימים) כדי שיום עם נסיעה בודדת לא יעוות את הקו. מינימום 2 ימים עם נתונים.
  const ma7 = labels.map((_, i) => {
    const window = labels.slice(Math.max(0, i - 6), i + 1);
    const daysWithData = window.filter(d => byDate[d].total >= 1).length;
    if (daysWithData < 2) return null;
    const totSum = window.reduce((s, d) => s + byDate[d].total, 0);
    const trigSum = window.reduce((s, d) => s + byDate[d].triggered, 0);
    return totSum >= 1 ? Math.round(trigSum / totSum * 100) : null;
  });

  const cfg = () => ({
    type: 'bar',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        {
          type: 'bar',
          label: '% יומי',
          data: rates,
          backgroundColor: rates.map(v => v === null ? 'transparent' : 'rgba(100,116,139,0.35)'),
          borderRadius: 2,
          order: 2,
        },
        {
          type: 'line',
          label: 'ממוצע 7 ימים',
          data: ma7,
          borderColor: '#7dd3fc',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: ma7.map(v => v === null ? 'transparent' : v >= 70 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444'),
          borderWidth: 2,
          spanGaps: true,
          order: 1,
        },
      ]
    },
    options: {
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: ctx => labels[ctx[0].dataIndex],
            label: ctx => {
              const d = labels[ctx.dataIndex];
              const v = ctx.parsed.y;
              if (ctx.dataset.label === '% יומי') {
                return v !== null
                  ? ` יומי: ${v}% (${byDate[d]?.triggered ?? ''}/${byDate[d]?.total ?? ''})`
                  : ' אין מספיק נתונים';
              }
              return v !== null ? ` ממוצע 7 ימים: ${v}%` : ' אין מספיק נתונים';
            }
          }
        }
      },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
        y: {
          position: 'right',
          ticks: { color: '#64748b', callback: v => v + '%' },
          grid: { color: '#1a1f30' },
          min: 0, max: 100,
        },
      }
    }
  });

  renderChart('chart-success-trend',        cfg());
  renderChart('chart-success-trend-alarms', cfg());
}

// ─── Manufacturer Success Rate ─────────────────────────────────────────────
async function loadManufacturerSuccess(sb, since30) {
  const [sessRes, dauRes] = await Promise.all([
    rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000),
    fetchAllRows(() => sb.from('device_daily_active')
      .select('device_id_anon, manufacturer')
      .gte('event_date', since30)
      .not('manufacturer', 'is', null)),
  ]);

  if (sessRes.error || dauRes.error || !sessRes.data?.length || !dauRes.data?.length) return;

  // Build device → manufacturer map
  const mfrMap = {};
  dauRes.data.forEach(r => { if (r.manufacturer) mfrMap[r.device_id_anon] = r.manufacturer; });

  // Aggregate per manufacturer
  const stats = {};
  sessRes.data.forEach(r => {
    const mfr = mfrMap[r.device_id_anon];
    if (!mfr) return;
    // Denominator = real trips only (excludes toggle noise) — keeps OEM rates honest & comparable.
    if (!isRealTripSession(r)) return;
    if (!stats[mfr]) stats[mfr] = { total: 0, triggered: 0 };
    stats[mfr].total++;
    // Real-time success only — a late catch means the OEM killed the live ring, so it must NOT
    // count as success here (otherwise OEM battery-kill problems get masked).
    if (isRealtimeTriggered(r)) stats[mfr].triggered++;
  });

  // Filter: at least 5 sessions
  const filtered = Object.entries(stats)
    .filter(([, v]) => v.total >= 5)
    .map(([mfr, v]) => ({ mfr, rate: Math.round(v.triggered / v.total * 100), n: v.total }))
    .sort((a, b) => b.rate - a.rate);

  if (!filtered.length) return;

  const colors = filtered.map(d => d.rate >= 70 ? '#10b981' : d.rate >= 50 ? '#f59e0b' : '#ef4444');

  const canvas = document.getElementById('chart-mfr-success');
  if (!canvas) return;

  renderChart('chart-mfr-success', {
    type: 'bar',
    data: {
      labels: filtered.map(d => `${d.mfr} (n=${d.n})`),
      datasets: [{
        label: '% הצלחה',
        data: filtered.map(d => d.rate),
        backgroundColor: colors,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}% (${filtered[ctx.dataIndex].n} sessions)` } },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', callback: v => v + '%' },
          grid: { color: '#1a1f30' },
          min: 0, max: 100,
          // Reference annotation via border color changing
        },
        y: { position: 'right', ticks: { color: '#94a3b8' }, grid: { display: false } },
      }
    }
  });
}

// ─── Platform Success (Android vs Apple) ───────────────────────────────────
async function loadPlatformSuccess(sb, since30) {
  const kpiEl = document.getElementById('platform-success-kpis');
  const [sessRes, dauRes] = await Promise.all([
    rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000),
    fetchAllRows(() => sb.from('device_daily_active')
      .select('device_id_anon, manufacturer, android_version')
      .gte('event_date', since30)),
  ]);

  if (sessRes.error || !sessRes.data?.length) {
    if (kpiEl) kpiEl.innerHTML = '<div style="color:#475569;font-size:0.82rem">אין נתונים עדיין</div>';
    showEmptyState('chart-platform-success', 'אין נתונים עדיין');
    return;
  }

  // device → platform map: Apple via manufacturer, Android via android_version / OEM name.
  const platMap = {};
  (dauRes.data || []).forEach(r => {
    const p = devicePlatform(r.manufacturer, r.android_version);
    if (p !== 'unknown') platMap[r.device_id_anon] = p;
  });

  const stats = {
    android: { total: 0, triggered: 0, devices: new Set() },
    apple:   { total: 0, triggered: 0, devices: new Set() },
  };
  sessRes.data.forEach(r => {
    const p = platMap[r.device_id_anon];
    if (p !== 'android' && p !== 'apple') return;
    stats[p].devices.add(r.device_id_anon);
    // Denominator = real trips only — matches the headline definition.
    if (!isRealTripSession(r)) return;
    stats[p].total++;
    if (isRealtimeTriggered(r)) stats[p].triggered++;
  });

  const META = {
    android: { label: '🤖 Android' },
    apple:   { label: '🍎 Apple' },
  };
  const rate = (s) => (s.total > 0 ? Math.round(s.triggered / s.total * 100) : null);
  const rateColor = (r) => (r === null ? '#94a3b8' : r >= 70 ? '#10b981' : r >= 50 ? '#f59e0b' : '#ef4444');

  if (kpiEl) {
    const hasAny = stats.android.total > 0 || stats.apple.total > 0;
    kpiEl.innerHTML = hasAny
      ? ['android', 'apple'].map(p => {
          const s = stats[p];
          const r = rate(s);
          return `
            <div class="kpi">
              <div class="label">${META[p].label}</div>
              <div class="value" style="font-size:1.5rem;color:${rateColor(r)}">${r === null ? '—' : r + '%'}</div>
              <div class="sub">${s.total} נסיעות · ${s.devices.size} מכשירים</div>
            </div>`;
        }).join('')
      : '<div style="color:#475569;font-size:0.82rem">אין נתונים עדיין</div>';
  }

  const order = ['android', 'apple'].filter(p => stats[p].total > 0);
  if (!order.length) {
    showEmptyState('chart-platform-success', 'אין מספיק נתונים עדיין');
    return;
  }

  renderChart('chart-platform-success', {
    type: 'bar',
    data: {
      labels: order.map(p => `${META[p].label} (n=${stats[p].total})`),
      datasets: [{
        label: '% הצלחה (real-time)',
        data: order.map(p => rate(stats[p])),
        backgroundColor: order.map(p => rateColor(rate(stats[p]))),
        borderRadius: 6,
        barPercentage: 0.5,
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const s = stats[order[ctx.dataIndex]];
              return ` ${ctx.parsed.y}% (${s.triggered}/${s.total} נסיעות)`;
            }
          }
        },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, min: 0, max: 100 },
      }
    }
  });
}

// ─── Reliability Breakdown — outcome split per version ──────────────────────
// Graph 1 (actionable): not just "% success" but WHY a trip failed, stacked per version.
//   • real-time  = rang automatically (background GPS / native geofence / native_sampling, plus
//                  foreground_check where the background rang and the fullScreenIntent opened the app) — the happy path.
//   • late catch = DID alert, but only when the user tapped a notification or via the timed ETA
//                  fallback (trigger_source notification_open / eta_fallback).
//                  A rise here means the background task is FREEZING/being killed (e.g. Android 12+).
//   • silent     = never rang in real-time (app_killed / stale_tracking / open_stale) — a true miss,
//                  EXCEPT abandoned sessions (enabled then never travelled) which the 24h stale-cron
//                  closed as app_killed; those go to their own 'killed' band (outcome UNKNOWN, not a
//                  confirmed miss and not a confirmed success — the cron-close carries no GPS data).
//   • killed     = app killed/suspended mid-life then auto-closed by the 24h cron — unknown outcome.
//   • other      = timeout (10h) or a genuine mid-trip user cancel.
// Denominator = real trips only (isRealTripSession) so toggle noise can't distort the split.
// RELIABILITY_SILENT_OUTCOMES + isAbandonedStaleSession live in helpers.js (single source of truth).
function classifyReliability(r) {
  if (isRealtimeTriggered(r)) return 'realtime';
  if (r.outcome === 'triggered') return 'late';        // triggered but not real-time → caught late
  if (isAbandonedStaleSession(r)) return 'killed';     // 24h-cron abandoned/killed — outcome unknown
  if (RELIABILITY_SILENT_OUTCOMES.has(r.outcome)) return 'silent';
  return 'other';
}

async function loadReliabilityBreakdown(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    showEmptyState('chart-reliability-breakdown', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין');
    return;
  }

  // version → { realtime, late, silent, killed, other, total }
  const byVer = {};
  data.forEach(r => {
    if (!isRealTripSession(r)) return;  // exclude toggle noise from the reliability denominator
    const v = r.app_version || 'unknown';
    if (!byVer[v]) byVer[v] = { realtime: 0, late: 0, silent: 0, killed: 0, other: 0, total: 0 };
    byVer[v][classifyReliability(r)]++;
    byVer[v].total++;
  });

  // Keep versions with a meaningful sample so a single trip can't paint a version red/green.
  const MIN_SAMPLE = 5;
  const versions = Object.keys(byVer)
    .filter(v => v !== 'unknown' && byVer[v].total >= MIN_SAMPLE)
    .sort(compareVersions);

  if (!versions.length) {
    showEmptyState('chart-reliability-breakdown', 'אין מספיק נתונים עדיין (נדרשות 5+ נסיעות לגרסה)');
    return;
  }

  const CATS = [
    { key: 'realtime', label: 'צלצל בזמן אמת', color: '#10b981' },
    { key: 'late',     label: 'נתפס מאוחר (רקע קפא)', color: '#f59e0b' },
    { key: 'silent',   label: 'כשל שקט (מיס)', color: '#ef4444' },
    { key: 'killed',   label: '🧟 זומבי / נטוש (לא כשל נסיעה)', color: '#a855f7' },
    { key: 'other',    label: 'אחר (timeout/ביטול)', color: '#64748b' },
  ];
  const pctOf = (v, key) => byVer[v].total ? Math.round(byVer[v][key] / byVer[v].total * 100) : 0;

  renderChart('chart-reliability-breakdown', {
    type: 'bar',
    data: {
      labels: versions.map(v => `v${v} (n=${byVer[v].total})`),
      datasets: CATS.map(c => ({
        label: c.label,
        data: versions.map(v => pctOf(v, c.key)),
        backgroundColor: c.color,
        borderRadius: 3,
        stack: 'reliability',
      })),
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = versions[ctx.dataIndex];
              const cat = CATS[ctx.datasetIndex];
              return ` ${cat.label}: ${ctx.parsed.x}% (${byVer[v][cat.key]}/${byVer[v].total})`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, min: 0, max: 100, ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' } },
        y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { display: false } },
      },
    },
  });
}

// ─── Trigger Latency Histogram (Graph 2) ───────────────────────────────────
// Calibration metric: once the user crossed the chosen radius, how long until the alarm
// actually rang? We derive it from two props attached at trigger time:
//   overshoot_m   = metres already INSIDE the radius when the ring fired.
//   p75_speed_ms  = the trip's representative speed.
//   latency_sec   ≈ overshoot_m / p75_speed_ms  (only when speed is meaningful).
// Honour "averages lie" — we report P50/P90/P95, never a mean. Real-time triggers only
// (a late/foreground-rescued ring has no meaningful real-time latency).
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p / 100 * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

async function loadTriggerLatency(sb, since30) {
  const kpiEl = document.getElementById('trigger-latency-kpis');
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-trigger-latency', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  const latencies = [];
  data.forEach(r => {
    if (!isRealtimeTriggered(r)) return;
    const overshoot = Number(r.props?.overshoot_m);
    const speed = Number(r.props?.p75_speed_ms);
    if (!Number.isFinite(overshoot) || overshoot < 0) return;
    if (!Number.isFinite(speed) || speed < 0.5) return;  // skip near-stationary: latency undefined
    const sec = overshoot / speed;
    if (sec >= 0 && sec < 600) latencies.push(sec);  // guard against absurd outliers
  });

  if (latencies.length < 3) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-trigger-latency', 'אין מספיק נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);
  const p95 = percentile(sorted, 95);
  if (kpiEl) {
    const fmt = (v) => v == null ? '—' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ' שנ\'';
    kpiEl.innerHTML = [
      ['חציון (P50)', p50, '#10b981'],
      ['P90', p90, '#f59e0b'],
      ['P95', p95, '#ef4444'],
    ].map(([label, val, color]) =>
      `<div class="kpi"><div class="label">${label}</div><div class="value" style="color:${color}">${fmt(val)}</div><div class="sub">n=${latencies.length}</div></div>`
    ).join('');
  }

  const buckets = [
    { label: '0–2 שנ\'', min: 0,  max: 2 },
    { label: '2–5',      min: 2,  max: 5 },
    { label: '5–10',     min: 5,  max: 10 },
    { label: '10–20',    min: 10, max: 20 },
    { label: '20–40',    min: 20, max: 40 },
    { label: '40+ שנ\'', min: 40, max: Infinity },
  ];
  const counts = buckets.map(b => latencies.filter(s => s >= b.min && s < b.max).length);

  renderChart('chart-trigger-latency', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        label: 'מספר נסיעות',
        data: counts,
        backgroundColor: '#6366f1',
        borderRadius: 4,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { position: 'right', ticks: { color: '#64748b', precision: 0 }, grid: { color: '#1a1f30' }, beginAtZero: true },
      },
    },
  });
}

// ─── GPS Accuracy Histogram (Graph 9) ───────────────────────────────────────
// Reliability driver: how good is the GPS fix while tracking? We read `accuracy_m`
// (median horizontal accuracy in metres, captured per session — a number only, never a
// coordinate). A large radius = weak signal (indoors / urban canyon) and a likely early/late
// ring. Report P50/P90/P95 (never a mean) + a histogram. Real sessions only.
async function loadGpsAccuracy(sb, since30) {
  const kpiEl = document.getElementById('gps-accuracy-kpis');
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-gps-accuracy', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  const accuracies = [];
  data.forEach(r => {
    const acc = Number(r.props?.accuracy_m);
    if (Number.isFinite(acc) && acc > 0 && acc < 10000) accuracies.push(acc);
  });

  if (accuracies.length < 3) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-gps-accuracy', 'אין מספיק נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  const sorted = [...accuracies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);
  const p95 = percentile(sorted, 95);
  if (kpiEl) {
    const fmt = (v) => v == null ? '—' : Math.round(v) + ' מ\'';
    kpiEl.innerHTML = [
      ['חציון (P50)', p50, '#10b981'],
      ['P90', p90, '#f59e0b'],
      ['P95', p95, '#ef4444'],
    ].map(([label, val, color]) =>
      `<div class="kpi"><div class="label">${label}</div><div class="value" style="color:${color}">${fmt(val)}</div><div class="sub">n=${accuracies.length}</div></div>`
    ).join('');
  }

  const buckets = [
    { label: '0–15 מ\' (מצוין)', min: 0,   max: 15,       color: '#10b981' },
    { label: '15–30 (טוב)',      min: 15,  max: 30,       color: '#22c55e' },
    { label: '30–50 (סביר)',     min: 30,  max: 50,       color: '#f59e0b' },
    { label: '50–100 (חלש)',     min: 50,  max: 100,      color: '#f97316' },
    { label: '100+ מ\' (גרוע)',  min: 100, max: Infinity, color: '#ef4444' },
  ];
  const counts = buckets.map(b => accuracies.filter(a => a >= b.min && a < b.max).length);

  renderChart('chart-gps-accuracy', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        label: 'מספר הפעלות',
        data: counts,
        backgroundColor: buckets.map(b => b.color),
        borderRadius: 4,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { position: 'right', ticks: { color: '#64748b', precision: 0 }, grid: { color: '#1a1f30' }, beginAtZero: true },
      },
    },
  });
}

// ─── Background Survival Histogram (Graph 8) ─────────────────────────────────
// Does the OS kill the background tracking mid-trip? We read `max_gps_gap_sec` — the longest
// silence (seconds) between background GPS callbacks during a session (a duration only, no
// location). A small max-gap = the task survived; a long gap (Doze/OEM battery killer) is the
// signature of a "rang late" trip. KPI: % of sessions that stayed healthy (gap < 90s).
async function loadBackgroundSurvival(sb, since30) {
  const kpiEl = document.getElementById('bg-survival-kpis');
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-bg-survival', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  // A trip with no detected gap never wrote max_gps_gap_sec → treat as 0 (healthy), but only
  // count sessions that actually ran tracking (real trips) so toggle noise can't dilute the rate.
  const gaps = [];
  data.forEach(r => {
    if (typeof isRealTripSession === 'function' && !isRealTripSession(r)) return;
    const raw = r.props?.max_gps_gap_sec;
    if (raw === undefined || raw === null) {
      gaps.push(0); // ran, but no gap was ever flagged → fully healthy
      return;
    }
    const g = Number(raw);
    if (Number.isFinite(g) && g >= 0 && g < 86400) gaps.push(g);
  });

  if (gaps.length < 3) {
    if (kpiEl) kpiEl.innerHTML = '';
    showEmptyState('chart-bg-survival', 'אין מספיק נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  const HEALTHY_MAX_SEC = 90;
  const healthy = gaps.filter(g => g < HEALTHY_MAX_SEC).length;
  const healthyPct = Math.round(healthy / gaps.length * 100);
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = percentile(sorted, 50);
  if (kpiEl) {
    kpiEl.innerHTML = [
      ['🟢 נסיעות בריאות', healthyPct + '%', `${healthy}/${gaps.length} ללא הפער מהותי`, '#10b981'],
      ['חציון הפער המרבי', (medianGap == null ? '—' : Math.round(medianGap) + ' שנ\''), 'לכל נסיעה', '#3b82f6'],
    ].map(([label, val, sub, color]) =>
      `<div class="kpi"><div class="label">${label}</div><div class="value" style="color:${color}">${val}</div><div class="sub">${sub}</div></div>`
    ).join('');
  }

  const buckets = [
    { label: 'ללא הפער', min: 0,    max: 90,       color: '#10b981' },
    { label: '90 שנ\'–2 דק\'', min: 90,   max: 120,      color: '#22c55e' },
    { label: '2–8 דק\'',  min: 120,  max: 480,      color: '#f59e0b' },
    { label: '8–20 דק\'', min: 480,  max: 1200,     color: '#f97316' },
    { label: '20 דק\'+',  min: 1200, max: Infinity, color: '#ef4444' },
  ];
  const counts = buckets.map(b => gaps.filter(g => g >= b.min && g < b.max).length);

  renderChart('chart-bg-survival', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        label: 'מספר נסיעות',
        data: counts,
        backgroundColor: buckets.map(b => b.color),
        borderRadius: 4,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { position: 'right', ticks: { color: '#64748b', precision: 0 }, grid: { color: '#1a1f30' }, beginAtZero: true },
      },
    },
  });
}

// ─── Early Cancellations Trend (Graph 3) ────────────────────────────────────
// % of REAL trips that the user manually cancelled while already close to the destination
// (distance_at_cancel ≤ 2× the chosen radius). A spike can mean the app drains too much battery
// so users kill it the moment they wake near the stop — a UX warning, not a technical failure.
// Toggle noise (short on/off, already-inside) is excluded so the signal stays clean.
async function loadEarlyCancellations(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    showEmptyState('chart-early-cancel', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין');
    return;
  }

  const byDate = {};  // date → { realTrips, earlyCancels }
  data.forEach(r => {
    if (!isRealTripSession(r)) return;  // denominator = real navigation attempts only
    const d = (r.started_at || '').slice(0, 10);
    if (!d) return;
    if (!byDate[d]) byDate[d] = { realTrips: 0, earlyCancels: 0 };
    byDate[d].realTrips++;
    if (r.outcome !== 'user_cancelled') return;
    const dist = Number(r.props?.distance_km);
    const radius = Number(r.props?.radius_km);
    // "Close to arrival" — needs both distance-at-cancel and radius; ring not yet fired.
    if (Number.isFinite(dist) && Number.isFinite(radius) && radius > 0 && dist <= radius * 2) {
      byDate[d].earlyCancels++;
    }
  });

  const labels = Object.keys(byDate).sort();
  if (labels.length < 1) {
    showEmptyState('chart-early-cancel', 'אין מספיק נתונים עדיין');
    return;
  }
  const rates = labels.map(d => byDate[d].realTrips ? Math.round(byDate[d].earlyCancels / byDate[d].realTrips * 100) : 0);

  renderChart('chart-early-cancel', {
    type: 'line',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [{
        label: '% ביטולים סמוך להגעה',
        data: rates,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.12)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = labels[ctx.dataIndex];
              return ` ${ctx.parsed.y}% (${byDate[d].earlyCancels}/${byDate[d].realTrips} נסיעות)`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', min: 0, ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' } },
      },
    },
  });
}

// ─── Distance vs. Radius Scatter (Graph 5) ──────────────────────────────────
// Learns how users calibrate the app: longer trips → bigger radius? We plot, per triggered trip,
// the estimated trip distance (p75_speed_ms × trip_elapsed_sec) against the chosen radius_km.
// If a pattern emerges (e.g. 100 km trips → 3 km radius, 10 km → 0.5 km) we can suggest a smart
// dynamic default radius the moment the user picks a destination.
async function loadDistanceVsRadius(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  if (error || !data?.length) {
    showEmptyState('chart-distance-radius', error ? `שגיאה: ${error.message}` : 'אין נתונים עדיין');
    return;
  }

  const points = [];
  data.forEach(r => {
    if (r.outcome !== 'triggered') return;
    const radius = Number(r.props?.radius_km);
    const speed = Number(r.props?.p75_speed_ms);
    const elapsed = Number(r.props?.trip_elapsed_sec);
    if (!Number.isFinite(radius) || radius <= 0) return;
    if (!Number.isFinite(speed) || speed <= 0) return;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    const tripKm = speed * elapsed / 1000;
    // Guard against implausible values (GPS noise / idling task inflating elapsed).
    if (tripKm <= 0 || tripKm > 500) return;
    points.push({ x: Math.round(tripKm * 10) / 10, y: radius });
  });

  if (points.length < 3) {
    showEmptyState('chart-distance-radius', 'אין מספיק נתונים עדיין — יצטבר מהגרסה הקרובה');
    return;
  }

  renderChart('chart-distance-radius', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'נסיעה (n=' + points.length + ')',
        data: points,
        backgroundColor: 'rgba(59,130,246,0.55)',
        pointRadius: 4,
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` מרחק ~${ctx.parsed.x} ק"מ · רדיוס ${ctx.parsed.y} ק"מ`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'מרחק נסיעה משוער (ק"מ)', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y: { position: 'right', title: { display: true, text: 'רדיוס שנבחר (ק"מ)', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      },
    },
  });
}

// ─── Activation Funnel — Aha! moment (install → permission → destination → ring) ─
async function loadActivationFunnel(sb, since30) {
  const [dauRes, sessRes, permRes, createdRes] = await Promise.all([
    fetchOsScopedRows(() => sb.from('device_daily_active').select('device_id_anon').gte('event_date', since30)),
    rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000),
    // Permission / first-destination milestones are queried from DATA_START_DATE (not just the
    // window): a device active now may have granted the permission / created its first destination
    // earlier. Intersecting with the MAU set keeps every step measured against the same population.
    rpcDeviceFeatureEvents(sb, DATA_START_DATE, 'permission.location.background.granted', 200000),
    rpcDeviceFeatureEvents(sb, DATA_START_DATE, 'location.created', 200000),
  ]);

  if (dauRes.error || sessRes.error) return;

  const mauSet     = new Set((dauRes.data || []).map(r => r.device_id_anon));
  const grantedSet = new Set((permRes?.data || []).map(r => r.device_id_anon));
  const createdSet = new Set((createdRes?.data || []).map(r => r.device_id_anon));
  const usedAlarm  = new Set((sessRes.data || []).map(r => r.device_id_anon));
  const succeeded  = new Set((sessRes.data || []).filter(isRealtimeTriggered).map(r => r.device_id_anon));

  const mau     = mauSet.size;
  const granted = [...grantedSet].filter(d => mauSet.has(d)).length;
  const created = [...createdSet].filter(d => mauSet.has(d)).length;
  const tried   = [...usedAlarm].filter(d => mauSet.has(d)).length;
  const won     = [...succeeded].filter(d => mauSet.has(d)).length;

  if (!mau) return;

  // Each step = % of MAU that reached this milestone (independent reach, not strict subset) —
  // mirrors the existing funnel semantics. The permission step only counts devices on a version
  // that emits permission.location.background.granted (≈ from v1.2.0), so it can read low on older
  // cohorts; the description flags this so a low bar isn't mistaken for a real drop-off.
  const steps = [
    { label: 'משתמשים פעילים (MAU)',          val: mau,     color: '#3b82f6', pct: 100 },
    { label: 'אישרו הרשאת מיקום ברקע',        val: granted, color: '#8b5cf6', pct: Math.round(granted / mau * 100) },
    { label: 'יצרו יעד ראשון',                 val: created, color: '#6366f1', pct: Math.round(created / mau * 100) },
    { label: 'ניסו להפעיל התראה',             val: tried,   color: '#0ea5e9', pct: Math.round(tried   / mau * 100) },
    { label: 'קיבלו צלצול (הצלחה real-time)', val: won,     color: '#10b981', pct: Math.round(won     / mau * 100) },
  ];

  function renderFunnel(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = steps.map(s => `
      <div class="funnel-row">
        <div class="funnel-label">${s.label}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar" style="width:${s.pct}%;background:${s.color}"></div>
          <span class="funnel-val">${s.val.toLocaleString()}</span>
        </div>
        <div class="funnel-pct">${s.pct}%</div>
      </div>
    `).join('');
  }

  renderFunnel('funnel-overview');
}

// ─── Time to First Alarm ────────────────────────────────────────────────────
async function loadTimeToFirstAlarm(sb) {
  const since90 = DATA_START_DATE;
  const [firstSeenRes, firstAlarmRes] = await Promise.all([
    fetchAllRows(() => sb.from('device_daily_active')
      .select('device_id_anon, event_date')
      .gte('event_date', since90)
      .order('event_date', { ascending: true })),
    rpcAlarmSessions(sb, since90 + 'T00:00:00Z', 50000),
  ]);

  if (firstSeenRes.error || firstAlarmRes.error) return;
  const firstAlarmData = (firstAlarmRes.data || []).filter(r => r.is_first_alarm);
  if (!firstSeenRes.data?.length || !firstAlarmData.length) return;

  // First seen per device
  const firstSeen = {};
  firstSeenRes.data.forEach(r => {
    if (!firstSeen[r.device_id_anon] || r.event_date < firstSeen[r.device_id_anon])
      firstSeen[r.device_id_anon] = r.event_date;
  });

  // Compute days to first alarm for each device
  const days = [];
  firstAlarmData.forEach(r => {
    const f = firstSeen[r.device_id_anon];
    if (!f) return;
    const diff = Math.round((new Date(r.started_at) - new Date(f)) / 86400000);
    if (diff >= 0 && diff <= 60) days.push(diff);
  });

  if (!days.length) return;

  const BUCKETS = [
    { label: 'יום ההתקנה',  min: 0, max: 0 },
    { label: 'יום אחד',      min: 1, max: 1 },
    { label: '2–3 ימים',     min: 2, max: 3 },
    { label: '4–7 ימים',     min: 4, max: 7 },
    { label: '1–2 שבועות',   min: 8, max: 14 },
    { label: '2–4 שבועות',   min: 15, max: 30 },
    { label: '>30 יום',      min: 31, max: 60 },
  ];

  const counts = BUCKETS.map(b => days.filter(d => d >= b.min && d <= b.max).length);

  renderChart('chart-time-to-alarm', {
    type: 'bar',
    data: {
      labels: BUCKETS.map(b => b.label),
      datasets: [
        {
          label: 'מכשירים',
          data: counts,
          backgroundColor: '#6366f1',
          borderRadius: 4,
        },
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} מכשירים` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

// ─── MAU Monthly + Cumulative Users ────────────────────────────────────────
async function loadGrowthCharts(sb) {
  const { data, error } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', DATA_START_DATE)
    .order('event_date', { ascending: true }));

  if (error || !data?.length) return;

  // MAU by month
  const monthDevices = {};
  data.forEach(r => {
    const m = r.event_date.slice(0, 7);
    if (!monthDevices[m]) monthDevices[m] = new Set();
    monthDevices[m].add(r.device_id_anon);
  });
  const months = Object.keys(monthDevices).sort();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const mauValues = months.map(m => monthDevices[m].size);

  renderChart('chart-mau-monthly', {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'MAU',
        data: mauValues,
        backgroundColor: months.map(m => m === currentMonth ? 'rgba(59,130,246,0.45)' : '#3b82f6'),
        borderRadius: 4,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });

  // Cumulative unique users (first seen per device)
  const firstSeen = {};
  data.forEach(r => {
    if (!firstSeen[r.device_id_anon] || r.event_date < firstSeen[r.device_id_anon])
      firstSeen[r.device_id_anon] = r.event_date;
  });
  const newByMonth = {};
  Object.values(firstSeen).forEach(date => {
    const m = date.slice(0, 7);
    newByMonth[m] = (newByMonth[m] || 0) + 1;
  });
  const cumMonths = [...new Set([...months, ...Object.keys(newByMonth)])].sort();
  let cum = 0;
  const cumValues = cumMonths.map(m => { cum += (newByMonth[m] || 0); return cum; });

  renderChart('chart-cumulative-users', {
    type: 'line',
    data: {
      labels: cumMonths,
      datasets: [{
        label: 'משתמשים מצטברים',
        data: cumValues,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` סה"כ: ${ctx.parsed.y.toLocaleString()} מכשירים` } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

// ─── First Alarm vs Repeat Success ─────────────────────────────────────────
async function loadFirstVsRepeatSuccess(sb, since30) {
  const { data: rawData, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);
  const data = (rawData || []).filter(r => r.outcome != null);

  if (error || !data?.length) return;

  // Overall KPIs
  const firstAll  = data.filter(r => r.is_first_alarm);
  const repAll    = data.filter(r => !r.is_first_alarm);
  const firstRate = firstAll.length ? Math.round(firstAll.filter(isRealtimeTriggered).length / firstAll.length * 100) : null;
  const repRate   = repAll.length   ? Math.round(repAll.filter(isRealtimeTriggered).length   / repAll.length   * 100) : null;

  const kpiEl = document.getElementById('first-vs-repeat-kpis');
  if (kpiEl && (firstAll.length || repAll.length)) {
    kpiEl.innerHTML = [
      ['🆕 ראשונה', firstRate, firstAll.length],
      ['🔁 חוזרת',  repRate,   repAll.length],
    ].map(([label, rate, n]) => `
      <div class="kpi">
        <div class="label">${label}</div>
        <div class="value" style="font-size:1.4rem">${rate !== null ? rate + '%' : '—'}</div>
        <div class="sub">${n} sessions</div>
      </div>
    `).join('');
  }

  // Group by week
  const byWeek = {};
  data.forEach(r => {
    const d = new Date(r.started_at);
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay());
    const wk = ws.toISOString().slice(0, 10);
    if (!byWeek[wk]) byWeek[wk] = { fTotal: 0, fTrig: 0, rTotal: 0, rTrig: 0 };
    if (r.is_first_alarm) {
      byWeek[wk].fTotal++;
      if (isRealtimeTriggered(r)) byWeek[wk].fTrig++;
    } else {
      byWeek[wk].rTotal++;
      if (isRealtimeTriggered(r)) byWeek[wk].rTrig++;
    }
  });

  const labels = Object.keys(byWeek).sort();
  if (labels.length < 2) return;

  const firstRates = labels.map(w => byWeek[w].fTotal >= 3 ? Math.round(byWeek[w].fTrig / byWeek[w].fTotal * 100) : null);
  const repRates   = labels.map(w => byWeek[w].rTotal >= 3 ? Math.round(byWeek[w].rTrig / byWeek[w].rTotal * 100) : null);

  renderChart('chart-first-vs-repeat-success', {
    type: 'line',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        {
          label: '🆕 התראה ראשונה',
          data: firstRates,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.08)',
          fill: true, tension: 0.3, pointRadius: 5, spanGaps: true,
        },
        {
          label: '🔁 התראות חוזרות',
          data: repRates,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.05)',
          fill: true, tension: 0.3, pointRadius: 5, spanGaps: true,
        },
      ]
    },
    options: {
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return ` ${ctx.dataset.label}: ${v !== null ? v + '%' : '—'}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, min: 0, max: 100 },
      }
    }
  });
}

