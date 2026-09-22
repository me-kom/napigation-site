// ─── Revenue ───────────────────────────────────────────────────────────────
async function loadConversionFunnel(sb, since30) {
  const EVENTS = [
    'screen.upgrade_viewed',
    'screen.upgrade.purchase_completed',
    'screen.upgrade.purchase_cancelled',
    'screen.upgrade.purchase_error',
    'screen.donate_viewed',
    'screen.donate.purchase_completed',
    'screen.donate.purchase_cancelled',
  ];

  const { data, error } = await sb
    .from('feature_events')
    .select('event_name, count')
    .in('event_name', EVENTS)
    .gte('event_date', since30);

  const container = document.getElementById('conversion-funnel-bars');
  if (!container) return;

  // When a scope filter is active, feature_events (global) can't be filtered — rebuild from
  // device_feature_events so the conversion funnel reflects the selected OS/version/country.
  const scopedRows = await fetchScopedFeatureRows(sb, since30);
  const rows = scopedRows ? scopedRows.filter(r => EVENTS.includes(r.event_name)) : data;

  if (error || !rows?.length) {
    container.innerHTML = '<div style="color:#475569;font-size:0.82rem;padding:12px 0">אין נתונים עדיין — אירועי עמוד השדרוג מתחילים להצטבר מה-build הנוכחי.</div>';
    return;
  }

  // aggregate
  const totals = {};
  rows.forEach(r => { totals[r.event_name] = (totals[r.event_name] || 0) + (r.count || 0); });

  const upgradeViewed    = totals['screen.upgrade_viewed']             || 0;
  const upgradePurchased = totals['screen.upgrade.purchase_completed'] || 0;
  const upgradeCancelled = totals['screen.upgrade.purchase_cancelled'] || 0;
  const upgradeError     = totals['screen.upgrade.purchase_error']     || 0;
  const donateViewed     = totals['screen.donate_viewed']              || 0;
  const donateDone       = totals['screen.donate.purchase_completed']  || 0;
  const donateCancelled  = totals['screen.donate.purchase_cancelled']  || 0;

  function funnelBar(label, value, baseValue, color) {
    const pctVal = baseValue > 0 ? Math.round((value / baseValue) * 100) : 0;
    const width  = baseValue > 0 ? Math.max(2, Math.round((value / baseValue) * 100)) : 0;
    return `
      <div class="funnel-row">
        <div class="funnel-label">${escHtml(label)}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar" style="width:${width}%;background:${color}"></div>
          <span class="funnel-val">${value.toLocaleString()}</span>
        </div>
        <div class="funnel-pct">${baseValue > 0 ? pctVal + '%' : '—'}</div>
      </div>`;
  }

  const maxVal = Math.max(upgradeViewed, donateViewed, 1);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;flex-wrap:wrap">

      <div>
        <div style="font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">🔷 עמוד שדרוג (מנוי)</div>
        ${funnelBar('נכנסו לעמוד',      upgradeViewed,    upgradeViewed, '#3b82f6')}
        ${funnelBar('✅ קנו / שדרגו',   upgradePurchased, upgradeViewed, '#10b981')}
        ${funnelBar('❌ בוטל',          upgradeCancelled, upgradeViewed, '#f59e0b')}
        ${funnelBar('⚠️ שגיאה',         upgradeError,     upgradeViewed, '#ef4444')}
        <div style="font-size:0.78rem;color:#64748b;margin-top:8px">
          המרה: <strong style="color:${upgradePurchased > 0 ? '#10b981' : '#ef4444'}">${upgradeViewed > 0 ? Math.round(upgradePurchased / upgradeViewed * 100) + '%' : '—'}</strong>
        </div>
      </div>

      <div>
        <div style="font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">🟣 עמוד תמיכה (תרומה)</div>
        ${funnelBar('נכנסו לעמוד',    donateViewed,    donateViewed, '#8b5cf6')}
        ${funnelBar('✅ תרמו',         donateDone,      donateViewed, '#10b981')}
        ${funnelBar('❌ בוטל',        donateCancelled,  donateViewed, '#f59e0b')}
        <div style="font-size:0.78rem;color:#64748b;margin-top:8px">
          המרה: <strong style="color:${donateDone > 0 ? '#10b981' : '#ef4444'}">${donateViewed > 0 ? Math.round(donateDone / donateViewed * 100) + '%' : '—'}</strong>
        </div>
      </div>

    </div>`;
}

async function loadRevenue(sb, mauCount = 0) {
  const { data, error } = await rpcRevenueEvents(sb, DATA_START_DATE + 'T00:00:00Z', 'PRODUCTION', 10000);

  if (error) {
    const errEl = document.getElementById('revenue-error');
    if (errEl) errEl.style.display = 'block';
    return;
  }
  if (!data?.length) return;

  const sorted = [...data].sort((a, b) => (a.occurred_at || '').localeCompare(b.occurred_at || ''));
  const PURCHASE_TYPES = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'];
  const purchases = sorted.filter(r => PURCHASE_TYPES.includes(r.event_type));

  const totalRevenue = purchases.reduce((s, r) => s + (r.price_in_currency || 0), 0);
  const since30 = DATA_START_DATE;
  const last30 = purchases.filter(r => r.occurred_at >= since30 + 'T00:00:00Z');
  const last30Rev = last30.reduce((s, r) => s + (r.price_in_currency || 0), 0);
  const uniqueBuyers = new Set(data.filter(r => r.event_type === 'INITIAL_PURCHASE').map(r => r.rc_user_id)).size;
  const mau = mauCount || 1;
  const convRate = mau > 1 ? pct(uniqueBuyers, mau) : '—';
  const arpu = mau > 1 ? '₪' + (last30Rev / mau).toFixed(2) : '—';

  // Overview tab KPIs
  setText('kpi-total-rev',  '₪' + totalRevenue.toFixed(0));
  setText('kpi-last30-rev', '₪' + last30Rev.toFixed(0));
  setText('kpi-conv-rate',  convRate);
  setText('kpi-arpu',       arpu);

  // Revenue tab KPIs
  setText('rev-total',  '₪' + totalRevenue.toFixed(0));
  setText('rev-last30', '₪' + last30Rev.toFixed(0));
  setText('rev-conv',   convRate);
  setText('rev-arpu',   arpu);
  setText('kpi-buyers', uniqueBuyers);

  // ── Cumulative revenue by week ──────────────────────────────────────────
  const byWeek = {};
  purchases.forEach(r => {
    const d = new Date(r.occurred_at);
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay());
    const wk = ws.toISOString().slice(0, 10);
    byWeek[wk] = (byWeek[wk] || 0) + (r.price_in_currency || 0);
  });
  const wkLabels = Object.keys(byWeek).sort();
  let cum = 0;
  const cumRevs = wkLabels.map(w => { cum += byWeek[w]; return +cum.toFixed(2); });

  renderChart('chart-rev-cumulative', {
    type: 'line',
    data: {
      labels: wkLabels.map(d => d.slice(5)),
      datasets: [{
        label: 'הכנסה מצטברת (₪)',
        data: cumRevs,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => '₪' + v }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });

  // ── Daily revenue ──────────────────────────────────────────────────────
  const byDay = {};
  last30.forEach(r => {
    const d = r.occurred_at.slice(0, 10);
    if (!byDay[d]) byDay[d] = { initial: 0, renewal: 0, lifetime: 0 };
    if (r.event_type === 'INITIAL_PURCHASE')        byDay[d].initial  += r.price_in_currency || 0;
    else if (r.event_type === 'RENEWAL')            byDay[d].renewal  += r.price_in_currency || 0;
    else if (r.event_type === 'NON_RENEWING_PURCHASE') byDay[d].lifetime += r.price_in_currency || 0;
  });
  const dayLabels = Object.keys(byDay).sort();
  const dayTotals = dayLabels.map(d => +((byDay[d].initial + byDay[d].renewal + byDay[d].lifetime).toFixed(2)));
  // ממוצע נע 7 ימים (חלון ±3 ימים)
  const ma7Rev = dayTotals.map((_, i) => {
    const slice = dayTotals.slice(Math.max(0, i - 3), i + 4);
    return +(slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2);
  });

  renderChart('chart-rev-daily', {
    type: 'bar',
    data: {
      labels: dayLabels.map(d => d.slice(5)),
      datasets: [
        { label: '✅ ראשונה',   data: dayLabels.map(d => +((byDay[d]?.initial  || 0).toFixed(2))), backgroundColor: '#10b981', borderRadius: 3, stack: 's' },
        { label: '🔁 חידוש',    data: dayLabels.map(d => +((byDay[d]?.renewal  || 0).toFixed(2))), backgroundColor: '#3b82f6', borderRadius: 3, stack: 's' },
        { label: '♾️ Lifetime', data: dayLabels.map(d => +((byDay[d]?.lifetime || 0).toFixed(2))), backgroundColor: '#8b5cf6', borderRadius: 3, stack: 's' },
        { label: 'ממוצע נע 7 ימים', data: ma7Rev, type: 'line', borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, order: 0, stack: undefined },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' }, stacked: true },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => '₪' + v }, grid: { color: '#1a1f30' }, beginAtZero: true, stacked: true },
      }
    }
  });

  // ── Product distribution ────────────────────────────────────────────────
  const prodRev = {};
  purchases.forEach(r => {
    const k = r.product_id || 'unknown';
    prodRev[k] = (prodRev[k] || 0) + (r.price_in_currency || 0);
  });
  const pLabels = Object.keys(prodRev).sort((a, b) => prodRev[b] - prodRev[a]);
  const palette = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  renderChart('chart-products', {
    type: 'doughnut',
    data: {
      labels: pLabels,
      datasets: [{ data: pLabels.map(k => +prodRev[k].toFixed(2)), backgroundColor: palette, borderWidth: 0 }]
    },
    options: {
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ₪${ctx.parsed.toFixed(0)} (${pct(ctx.parsed, totalRevenue)})` } },
      }
    }
  });

  // ── Renewal ratio by month ──────────────────────────────────────────────
  const initByMonth = {}, renByMonth = {};
  data.filter(r => r.event_type === 'INITIAL_PURCHASE' || r.event_type === 'RENEWAL').forEach(r => {
    const m = r.occurred_at.slice(0, 7);
    if (r.event_type === 'INITIAL_PURCHASE') initByMonth[m] = (initByMonth[m] || 0) + 1;
    else                                     renByMonth[m]  = (renByMonth[m]  || 0) + 1;
  });
  const months = [...new Set([...Object.keys(initByMonth), ...Object.keys(renByMonth)])].sort();

  renderChart('chart-renewal-ratio', {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: '✅ ראשונות', data: months.map(m => initByMonth[m] || 0), backgroundColor: '#10b981', borderRadius: 3, stack: 's' },
        { label: '🔁 חידושים', data: months.map(m => renByMonth[m]  || 0), backgroundColor: '#3b82f6', borderRadius: 3, stack: 's' },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, stacked: true },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true, stacked: true },
      }
    }
  });

  // ── Churn rate by month ─────────────────────────────────────────────────
  const cancelByMonth = {};
  data.filter(r => r.event_type === 'CANCELLATION' || r.event_type === 'EXPIRATION').forEach(r => {
    const m = r.occurred_at.slice(0, 7);
    cancelByMonth[m] = (cancelByMonth[m] || 0) + 1;
  });
  const churnMonths = [...new Set([...Object.keys(initByMonth), ...Object.keys(cancelByMonth)])].sort();
  if (churnMonths.length >= 1) {
    renderChart('chart-churn', {
      type: 'bar',
      data: {
        labels: churnMonths,
        datasets: [
          { label: '✅ מנויים חדשים',      data: churnMonths.map(m => initByMonth[m]   || 0), backgroundColor: '#10b981', borderRadius: 3 },
          { label: '❌ ביטולים / פג תוקף', data: churnMonths.map(m => -(cancelByMonth[m] || 0)), backgroundColor: '#ef4444', borderRadius: 3 },
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Math.abs(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b', callback: v => Math.abs(v) }, grid: { color: '#1a1f30' } }
        }
      }
    });
  } else {
    showEmptyState('chart-churn', 'ביטולים יצטברו עם הזמן — CANCELLATION / EXPIRATION events');
  }

  // ── ARPU monthly trend ──────────────────────────────────────────────────
  const revByMonth = {};
  purchases.forEach(r => {
    const m = r.occurred_at.slice(0, 7);
    revByMonth[m] = (revByMonth[m] || 0) + (r.price_in_currency || 0);
  });
  // MAU חודשי מ-device_daily_active
  const { data: mauMonthlyData } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', DATA_START_DATE));
  const mauByMonth = {};
  if (mauMonthlyData) {
    mauMonthlyData.forEach(r => {
      const m = r.event_date.slice(0, 7);
      if (!mauByMonth[m]) mauByMonth[m] = new Set();
      mauByMonth[m].add(r.device_id_anon);
    });
  }
  const arpuMonths = [...new Set([...Object.keys(revByMonth), ...Object.keys(mauByMonth)])].sort();
  const arpuValues = arpuMonths.map(m => {
    const rev   = revByMonth[m] || 0;
    const users = mauByMonth[m]?.size || 0;
    return users > 0 ? +(rev / users).toFixed(3) : null;
  });
  if (arpuMonths.length >= 1) {
    renderChart('chart-arpu-trend', {
      type: 'line',
      data: {
        labels: arpuMonths,
        datasets: [{
          label: 'ARPU (₪)',
          data: arpuValues,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          spanGaps: true,
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b', callback: v => '₪' + v }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  } else {
    showEmptyState('chart-arpu-trend', 'אין מספיק נתונים עדיין');
  }
}
async function loadEngagementDepth(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);

  if (error || !data?.length) return;

  const deviceStats = {};
  data.forEach(r => {
    // Count real trips only — a device that merely toggled the bell isn't "engaged".
    if (!isRealTripSession(r)) return;
    if (!deviceStats[r.device_id_anon])
      deviceStats[r.device_id_anon] = { total: 0, triggered: 0, hasRoute: false };
    deviceStats[r.device_id_anon].total++;
    if (isRealtimeTriggered(r)) deviceStats[r.device_id_anon].triggered++;
    if (r.is_route || r.props?.is_route || r.props?.location_type === 'route')
      deviceStats[r.device_id_anon].hasRoute = true;
  });

  const BUCKETS = [
    { label: '1',     min: 1,  max: 1 },
    { label: '2–4',   min: 2,  max: 4 },
    { label: '5–9',   min: 5,  max: 9 },
    { label: '10–19', min: 10, max: 19 },
    { label: '20+',   min: 20, max: Infinity },
  ];

  const bucketData = BUCKETS.map(b => {
    const devs = Object.values(deviceStats).filter(d => d.total >= b.min && d.total <= b.max);
    const n = devs.length;
    const hit = devs.filter(d => d.triggered > 0).length;
    return { n, successRate: n > 0 ? Math.round(hit / n * 100) : 0 };
  });

  renderChart('chart-engagement-depth', {
    type: 'bar',
    data: {
      labels: BUCKETS.map(b => b.label),
      datasets: [
        { label: '% שצלצלו לפחות פעם', data: bucketData.map(b => b.successRate), backgroundColor: bucketData.map(b => b.successRate >= 70 ? '#10b981' : b.successRate >= 50 ? '#f59e0b' : '#ef4444'), borderRadius: 4 },
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' },
             title: { display: true, text: 'sessions למכשיר (30 יום)', color: '#64748b', font: { size: 10 } } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
      }
    }
  });

  const routeDevs   = Object.values(deviceStats).filter(d => d.hasRoute);
  const noRouteDevs = Object.values(deviceStats).filter(d => !d.hasRoute);

  const routeSuccess   = routeDevs.length   ? Math.round(routeDevs.filter(d => d.triggered > 0).length   / routeDevs.length   * 100) : null;
  const noRouteSuccess = noRouteDevs.length ? Math.round(noRouteDevs.filter(d => d.triggered > 0).length / noRouteDevs.length * 100) : null;

  const kpiEl = document.getElementById('kpi-route-success-row');
  if (kpiEl) {
    kpiEl.innerHTML = (routeDevs.length > 0 || noRouteDevs.length > 0)
      ? [
          ['🗺️ משתמשי מסלולים', routeDevs.length,   routeSuccess],
          ['📍 מיקומים בלבד',   noRouteDevs.length, noRouteSuccess],
        ].map(([label, n, rate]) => `
          <div class="kpi">
            <div class="label">${label}</div>
            <div class="value" style="font-size:1.4rem">${rate !== null ? rate + '%' : '—'}</div>
            <div class="sub">${n} מכשירים</div>
          </div>
        `).join('')
      : '<div style="color:#475569;font-size:0.8rem">props.is_route לא מדווח עדיין</div>';
  }

  if (!routeDevs.length) return;

  const routeBuckets   = BUCKETS.map(b => {
    const devs = routeDevs.filter(d => d.total >= b.min && d.total <= b.max);
    return devs.length ? Math.round(devs.filter(d => d.triggered > 0).length / devs.length * 100) : null;
  });
  const noRouteBuckets = BUCKETS.map(b => {
    const devs = noRouteDevs.filter(d => d.total >= b.min && d.total <= b.max);
    return devs.length ? Math.round(devs.filter(d => d.triggered > 0).length / devs.length * 100) : null;
  });

  renderChart('chart-route-vs-loc-success', {
    type: 'bar',
    data: {
      labels: BUCKETS.map(b => b.label),
      datasets: [
        { label: '🗺️ מסלולים', data: routeBuckets,   backgroundColor: '#6366f1', borderRadius: 4 },
        { label: '📍 מיקומים', data: noRouteBuckets, backgroundColor: '#3b82f6', borderRadius: 4 },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' },
             beginAtZero: true, max: 100 },
      }
    }
  });
}

