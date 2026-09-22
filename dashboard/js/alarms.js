// ─── Alarm Sessions ────────────────────────────────────────────────────────
async function loadAlarmSessions(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);

  if (error) { console.error('alarm_sessions error:', error); return; }

  const counts = {};
  let total = 0;
  let realTripTotal = 0;
  let trueSuccessTotal = 0;
  let technicalKills = 0;
  let abandonedKills = 0;
  let firstTotal = 0, firstTriggered = 0;
  const now = Date.now();
  const staleByVersion = {};
  const trigSrcCounts = {};
  const triggerSourceDaily = {};
  let trigMissing = 0;
  let trigUnknownValue = 0;
  let trigKnown = 0;
  const failedSessions = [];

  (data || []).forEach(r => {
    let key = r.outcome || null;
    if (!key) {
      const ageH = (now - new Date(r.started_at).getTime()) / 3600000;
      key = ageH < 12 ? 'open_active' : 'open_stale';
    }
    if (key === 'user_cancelled' && r.props?.reason === 'already_inside_radius') {
      key = 'already_inside_radius';
    }
    // ⚠️ "צלצל מאוחר": triggered שמקורו notification_open / eta_fallback
    // = מסלול ה-real-time נכשל והצלצול נתפס רק כשהמשתמש פתח נוטיפיקציה / ע"י רשת הביטחון.
    // ⚠️ foreground_check אינו late: קיום pending = הוכחה ש-scheduleLocationAlarm (נתיב הרקע) רץ וצלצל
    // בזמן-אמת; ה-FSI רק פתח את האפליקציה להצגת ה-overlay. unknown/missing נשאר 'triggered'.
    if (key === 'triggered') {
      const ts = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
      if (ts === 'notification_open' || ts === 'eta_fallback') {
        key = 'triggered_late';
      }
    }
    const appKilledKind = classifyAppKilledSession(r);
    if (appKilledKind === 'technical_kill') {
      technicalKills++;
      counts['app_killed_technical'] = (counts['app_killed_technical'] || 0) + 1;
    } else if (appKilledKind === 'abandoned_session') {
      abandonedKills++;
      counts['app_killed_abandoned'] = (counts['app_killed_abandoned'] || 0) + 1;
    }

    counts[key] = (counts[key] || 0) + 1;
    total++;
    // Success-rate denominator = genuine trips only, excluding neutral noise such as <2m cancels.
    if (isRealTripSession(r)) realTripTotal++;
    if (isTrueSuccessSession(r)) trueSuccessTotal++;
    if (r.outcome === 'triggered') {
      const day = (r.started_at || '').slice(0, 10) || 'unknown-day';
      if (!triggerSourceDaily[day]) triggerSourceDaily[day] = { total: 0, missing: 0, unknown: 0 };
      triggerSourceDaily[day].total += 1;

      const rawSrc = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
      const src = rawSrc || 'unknown';
      trigSrcCounts[src] = (trigSrcCounts[src] || 0) + 1;

      if (!rawSrc) {
        trigMissing += 1;
        triggerSourceDaily[day].missing += 1;
      } else if (rawSrc === 'unknown') {
        trigUnknownValue += 1;
        triggerSourceDaily[day].unknown += 1;
      } else {
        trigKnown += 1;
      }
    }
    if (key === 'open_stale') {
      const v = r.app_version || 'unknown';
      staleByVersion[v] = (staleByVersion[v] || 0) + 1;
    }
    if (key === 'app_killed' || key === 'open_stale') {
      failedSessions.push({
        outcome: key,
        appVersion: r.app_version || 'unknown',
        deviceId: r.device_id_anon,
        durationMins: r.ended_at
          ? Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000)
          : null,
        rawProps: r.props || null,
      });
    }
    if (r.is_first_alarm && isRealTripSession(r)) {
      firstTotal++;
      // Use the reclassified key (real-time 'triggered' only — excludes 'triggered_late')
      // so first-alarm success matches the headline definition.
      if (key === 'triggered') firstTriggered++;
    }
  });

  // Session-based KPIs — מדויקים יותר מ-feature event counts.
  // Use the true-success definition: neutral noise is excluded, soft-success is counted as
  // success, and hard failures remain failures.
  setText('kpi-timeout', counts['timeout'] || 0);
  setText('kpi-session-success', pct(trueSuccessTotal || 0, realTripTotal));

  // First Alarm KPIs — set in both Overview and Alarms tab
  const kpiHtml = firstTotal > 0 ? [
    ['סה"כ ראשונות', firstTotal],
    ['צלצלו (ראשונות)', firstTriggered],
    ['% הצלחה (ראשונות)', pct(firstTriggered, firstTotal)],
  ].map(([label, val]) => `
    <div class="kpi">
      <div class="label">${label}</div>
      <div class="value" style="font-size:1.4rem">${val}</div>
    </div>
  `).join('') : '<div style="color:#475569;font-size:0.8rem">טרם יצבר מידע על התראות ראשונות</div>';

  const kpiEl = document.getElementById('first-alarm-kpi');
  if (kpiEl) kpiEl.innerHTML = kpiHtml;
  const kpiElAlarms = document.getElementById('first-alarm-kpi-alarms');
  if (kpiElAlarms) kpiElAlarms.innerHTML = kpiHtml;

  const ORDER = ['triggered', 'triggered_late', 'user_cancelled', 'already_inside_radius', 'auto_cancelled_moving_away', 'stale_tracking', 'timeout', 'app_killed_technical', 'app_killed_abandoned', 'open_active', 'open_stale'];
  const LABELS = {
    triggered:                  '✅ צלצל בזמן אמת',
    triggered_late:             '🟡 צלצל מאוחר (נתפס בפתיחה / ETA)',
    user_cancelled:             '👤 בוטל ע"י משתמש',
    already_inside_radius:      '📍 כבר בפנים בהפעלה',
    auto_cancelled_moving_away: '🚶 בוטל (התרחק)',
    stale_tracking:             '💤 מעקב תקוע',
    timeout:                    '⏰ פג זמן (10 שע)',
    app_killed_technical:       '💀 app_killed — kill טכני בזמן נסיעה',
    app_killed_abandoned:       '🧟 app_killed — זומבי / נטוש',
    open_active:                '🔄 פעיל כרגע (פחות מ-12 שע)',
    open_stale:                 '⚠️ לא נסגר אי פעם (יותר מ-12 שע)',
  };

  const tbody = document.getElementById('tbody-sessions');
  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#475569">אין נתונים עדיין — יצבר מ-13.5.2026</td></tr>';
    return;
  }

  // Keep the legacy total for display references, but split the app_killed bucket into two
  // dashboard-facing categories so analysts can distinguish a true technical kill from a stale abandon.
  if (technicalKills + abandonedKills > 0) {
    counts['app_killed'] = technicalKills + abandonedKills;
  }

  tbody.innerHTML = ORDER
    .filter(k => counts[k])
    .map(k => {
      const versionDetail = k === 'open_stale' && Object.keys(staleByVersion).length
        ? '<tr><td colspan="3" style="color:#64748b;font-size:0.75rem;padding:2px 8px 8px;direction:ltr">' +
          'גרסאות: ' +
          Object.entries(staleByVersion)
            .sort((a, b) => b[1] - a[1])
            .map(([v, n]) => `<span style="background:#262c42;padding:1px 6px;border-radius:4px;margin-left:4px">${escHtml(v)} ×${n}</span>`)
            .join('') + '</td></tr>'
        : '';
      return `<tr>
        <td>${LABELS[k] || k}</td>
        <td>${counts[k].toLocaleString()}</td>
        <td>${pct(counts[k], total)}</td>
      </tr>${versionDetail}`;
    }).join('');

  // ── Alarm frequency histogram ────────────────────────────────────────────
  const sessionsPerDevice = {};
  (data || []).forEach(r => {
    sessionsPerDevice[r.device_id_anon] = (sessionsPerDevice[r.device_id_anon] || 0) + 1;
  });
  const freqBuckets = [
    { label: '1', min: 1, max: 1 },
    { label: '2–3', min: 2, max: 3 },
    { label: '4–6', min: 4, max: 6 },
    { label: '7–10', min: 7, max: 10 },
    { label: '11–19', min: 11, max: 19 },
    { label: '20+', min: 20, max: Infinity },
  ];
  const freqCounts = freqBuckets.map(b =>
    Object.values(sessionsPerDevice).filter(n => n >= b.min && n <= b.max).length
  );
  const totalFreqDevices = freqCounts.reduce((s, v) => s + v, 0);
  const powerUsers = Object.values(sessionsPerDevice).filter(n => n >= 20).length;
  const medianSessions = (() => {
    const vals = Object.values(sessionsPerDevice).sort((a, b) => a - b);
    if (!vals.length) return 0;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? Math.round((vals[m - 1] + vals[m]) / 2) : vals[m];
  })();

  const freqKpiEl = document.getElementById('alarm-freq-kpis');
  if (freqKpiEl && totalFreqDevices > 0) {
    freqKpiEl.innerHTML = [
      { label: 'מכשירים ייחודיים', value: totalFreqDevices, sub: 'הפעילו התראה לפחות פעם' },
      { label: 'חציון sessions', value: medianSessions, sub: 'מכשיר ממוצע' },
      { label: 'Power users (20+)', value: powerUsers, sub: pct(powerUsers, totalFreqDevices) + ' מהמשתמשים', color: '#f59e0b' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem${k.color ? ';color:' + k.color : ''}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }
  if (totalFreqDevices > 0) {
    renderChart('chart-alarm-freq', {
      type: 'bar',
      data: {
        labels: freqBuckets.map((b, i) => b.label + (i === 5 ? ' 🔥' : '')),
        datasets: [{
          label: 'מכשירים',
          data: freqCounts,
          backgroundColor: freqBuckets.map((_, i) => i === 5 ? '#f59e0b' : i >= 3 ? '#6366f1' : '#3b82f6'),
          borderRadius: 4,
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} מכשירים (${pct(ctx.parsed.y, totalFreqDevices)})` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' },
               title: { display: true, text: 'sessions שהופעלו (30 יום)', color: '#64748b', font: { size: 10 } } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  } else {
    showEmptyState('chart-alarm-freq', 'אין נתונים עדיין');
  }

  // ── Free vs. Paid engagement ───────────────────────────────────────────
  const paidSessions    = (data || []).filter(r => r.props?.subscription_status === 'premium' || r.props?.is_premium === true);
  const freeSessions    = (data || []).filter(r => !r.props?.subscription_status || r.props?.subscription_status !== 'premium');
  const paidTriggered   = paidSessions.filter(isRealtimeTriggered).length;
  const freeTriggered   = freeSessions.filter(isRealtimeTriggered).length;
  const paidDevices     = new Set(paidSessions.map(r => r.device_id_anon)).size;
  const freeDevices     = new Set(freeSessions.map(r => r.device_id_anon)).size;
  const paidSuccessRate = paidSessions.length > 0 ? Math.round(paidTriggered / paidSessions.length * 100) : null;
  const freeSuccessRate = freeSessions.length > 0 ? Math.round(freeTriggered / freeSessions.length * 100) : null;
  const avgPaidSessions = paidDevices > 0 ? +(paidSessions.length / paidDevices).toFixed(1) : null;
  const avgFreeSessions = freeDevices > 0 ? +(freeSessions.length / freeDevices).toFixed(1) : null;

  const pvfKpiEl = document.getElementById('paid-vs-free-kpis');
  if (pvfKpiEl) {
    if (paidSessions.length > 0) {
      pvfKpiEl.innerHTML = [
        { label: '👑 Paid — % הצלחה',   value: paidSuccessRate !== null ? paidSuccessRate + '%' : '—', sub: paidSessions.length + ' sessions · ' + paidDevices + ' מכשירים', color: '#f59e0b' },
        { label: '🆓 Free — % הצלחה',   value: freeSuccessRate !== null ? freeSuccessRate + '%' : '—', sub: freeSessions.length + ' sessions · ' + freeDevices + ' מכשירים', color: '#3b82f6' },
        { label: '👑 Paid — sessions/מכשיר', value: avgPaidSessions ?? '—', sub: 'מחויבות גבוהה יותר?', color: '#f59e0b' },
        { label: '🆓 Free — sessions/מכשיר', value: avgFreeSessions ?? '—', sub: '', color: '#3b82f6' },
      ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
      renderChart('chart-paid-vs-free', {
        type: 'bar',
        data: {
          labels: ['% הצלחה', 'sessions ממוצע למכשיר'],
          datasets: [
            { label: '👑 Paid', data: [paidSuccessRate, avgPaidSessions], backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: '🆓 Free', data: [freeSuccessRate, avgFreeSessions], backgroundColor: '#3b82f6', borderRadius: 4 },
          ]
        },
        options: {
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
            y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
          }
        }
      });
    } else {
      pvfKpiEl.innerHTML = '<div style="color:#475569;font-size:0.82rem;padding:8px 0">⚠️ <code>props.subscription_status</code> לא נמצא ב-sessions — יצטבר כשהשדה יתווסף ל-alarm_sessions</div>';
      showEmptyState('chart-paid-vs-free', 'props.subscription_status לא נמצא עדיין — יצטבר בגרסה הבאה');
    }
  }

  // ── Reliability — כשלים שקטים ─────────────────────────────────────────
  const technicalKillCount = counts['app_killed_technical'] || 0;
  const abandonedKillCount = counts['app_killed_abandoned'] || 0;
  const silentKilled = technicalKillCount;
  const silentStale  = counts['open_stale']  || 0;
  const silentTotal  = silentKilled + silentStale;
  const trigBg       = trigSrcCounts['background'] || 0;
  const trigFg       = trigSrcCounts['foreground_check'] || 0;
  const trigUnknown  = trigSrcCounts['unknown'] || 0;

  const reliKpisEl = document.getElementById('reliability-kpis');
  if (reliKpisEl && total > 0) {
    const reliItems = [
      { label: '🔴 כשל שקט ודאי', value: silentTotal, sub: pct(silentTotal, total) + ' מכלל sessions', color: '#ef4444' },
      { label: '💀 app_killed — technical kill', value: technicalKillCount, sub: 'האפליקציה נהרגה בזמן נסיעה', color: '#dc2626' },
      { label: '🧟 app_killed — zombie / abandoned', value: abandonedKillCount, sub: 'לא הייתה תנועה אמיתית; לא כשל נסיעה', color: '#a855f7' },
      { label: '🟢 Background אוטומטי', value: trigBg || '—', sub: trigBg > 0 ? pct(trigBg, total) + ' מכלל sessions' : 'יצבר בגרסה הבאה', color: trigBg > 0 ? '#10b981' : '#475569' },
      { label: '� רקע→FSI (real-time)', value: trigFg || '—', sub: trigFg > 0 ? pct(trigFg, total) + ' — רקע צלצל, FSI פתח את האפליקציה' : 'יצבר בגרסה הבאה', color: trigFg > 0 ? '#34d399' : '#475569' },
    ];
    reliKpisEl.innerHTML = reliItems.map(k =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`
    ).join('');
  }

  const reliLabels = ['🟢 Background', '� רקע→FSI', '❓ צלצל — מקור לא ידוע', '💀 app_killed', '⚠️ open_stale', '👤 user_cancelled', '⏰ timeout', '📍 כבר בפנים'];
  const reliData   = [trigBg, trigFg, trigUnknown, silentKilled, silentStale, counts['user_cancelled'] || 0, counts['timeout'] || 0, counts['already_inside_radius'] || 0];
  const reliColors = ['#10b981', '#34d399', '#4ade80', '#ef4444', '#f87171', '#3b82f6', '#94a3b8', '#6366f1'];

  renderChart('chart-reliability', {
    type: 'bar',
    data: {
      labels: reliLabels,
      datasets: [{ label: 'sessions', data: reliData, backgroundColor: reliColors, borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} sessions (${pct(ctx.parsed.x, total)})` } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y: { position: 'right', ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
      }
    }
  });

  // ── Trigger Source Quality — KPI + trend ─────────────────────────────
  // Data-quality view: "how often do we know WHY a session triggered". Must use the RAW
  // triggered total (all sources), NOT counts['triggered'] — the latter excludes 'triggered_late'
  // (foreground_check/notification_open/eta_fallback) while trigKnown/missing/unknown are counted
  // from the raw outcome, so dividing by counts['triggered'] could yield shares above 100%.
  const trigTotal = trigKnown + trigMissing + trigUnknownValue;
  const trigUnresolved = trigMissing + trigUnknownValue;
  const trigKnownShare = trigTotal > 0 ? Math.round((trigKnown / trigTotal) * 100) : 0;
  const trigMissingShare = trigTotal > 0 ? Math.round((trigMissing / trigTotal) * 100) : 0;
  const trigUnknownShare = trigTotal > 0 ? Math.round((trigUnknownValue / trigTotal) * 100) : 0;
  const trigUnresolvedShare = trigTotal > 0 ? Math.round((trigUnresolved / trigTotal) * 100) : 0;

  const triggerSrcKpiEl = document.getElementById('trigger-source-quality-kpis');
  if (triggerSrcKpiEl) {
    if (trigTotal > 0) {
      triggerSrcKpiEl.innerHTML = [
        { label: '🧭 Known source', value: `${trigKnownShare}%`, sub: `${trigKnown}/${trigTotal} triggered`, color: trigKnownShare >= 85 ? '#10b981' : trigKnownShare >= 60 ? '#f59e0b' : '#ef4444' },
        { label: '❓ Unknown value', value: `${trigUnknownShare}%`, sub: `${trigUnknownValue}/${trigTotal} triggered`, color: trigUnknownShare >= 20 ? '#ef4444' : trigUnknownShare >= 8 ? '#f59e0b' : '#10b981' },
        { label: '🕳 Missing source', value: `${trigMissingShare}%`, sub: `${trigMissing}/${trigTotal} triggered`, color: trigMissingShare >= 5 ? '#ef4444' : trigMissingShare > 0 ? '#f59e0b' : '#10b981' },
        { label: '⚠️ Unresolved total', value: `${trigUnresolvedShare}%`, sub: `${trigUnresolved}/${trigTotal} triggered`, color: trigUnresolvedShare >= 20 ? '#ef4444' : trigUnresolvedShare >= 8 ? '#f59e0b' : '#10b981' },
      ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.35rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
    } else {
      triggerSrcKpiEl.innerHTML = '<div style="color:#475569;font-size:0.82rem;padding:8px 0">אין triggered sessions בחלון הזמן הנוכחי</div>';
    }
  }

  const triggerSrcAlertEl = document.getElementById('trigger-source-alert');
  if (triggerSrcAlertEl) {
    if (trigTotal === 0) {
      triggerSrcAlertEl.style.display = 'none';
    } else {
      const warn = QUALITY_THRESHOLDS.triggerSourceUnresolvedWarn;
      const critical = QUALITY_THRESHOLDS.triggerSourceUnresolvedCritical;
      const isCritical = trigUnresolvedShare >= critical;
      const isWarn = !isCritical && trigUnresolvedShare >= warn;
      const bg = isCritical ? 'rgba(239,68,68,0.16)' : isWarn ? 'rgba(245,158,11,0.16)' : 'rgba(16,185,129,0.15)';
      const border = isCritical ? '#ef4444' : isWarn ? '#f59e0b' : '#10b981';
      const color = isCritical ? '#fca5a5' : isWarn ? '#fcd34d' : '#86efac';
      const level = isCritical ? 'CRITICAL' : isWarn ? 'WARNING' : 'OK';
      triggerSrcAlertEl.style.display = '';
      triggerSrcAlertEl.style.background = bg;
      triggerSrcAlertEl.style.border = `1px solid ${border}`;
      triggerSrcAlertEl.style.color = color;
      triggerSrcAlertEl.innerHTML = `
        איכות trigger_source: <strong>${level}</strong>
        · unresolved=${trigUnresolvedShare}% (סף אזהרה ${warn}%, סף קריטי ${critical}%)
        <br><span style="opacity:0.85">📅 סיווג real-time מול late אמין מ-${TRIGGER_SOURCE_RELIABLE_DATE} והלאה (לפני כן triggered חסרי-מקור נספרים כ-real-time).</span>
      `;
    }
  }

  const trendDays = Object.keys(triggerSourceDaily).sort();
  if (trendDays.length > 0) {
    const unresolvedTrend = trendDays.map(d => {
      const row = triggerSourceDaily[d];
      const unresolved = row.missing + row.unknown;
      return row.total > 0 ? Math.round((unresolved / row.total) * 100) : 0;
    });
    const missingTrend = trendDays.map(d => {
      const row = triggerSourceDaily[d];
      return row.total > 0 ? Math.round((row.missing / row.total) * 100) : 0;
    });
    const unknownTrend = trendDays.map(d => {
      const row = triggerSourceDaily[d];
      return row.total > 0 ? Math.round((row.unknown / row.total) * 100) : 0;
    });

    renderChart('chart-trigger-source-quality', {
      type: 'line',
      data: {
        labels: trendDays.map(d => d.slice(5)),
        datasets: [
          { label: '⚠️ unresolved %', data: unresolvedTrend, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)', tension: 0.25, fill: false, pointRadius: 2 },
          { label: '🕳 missing %', data: missingTrend, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.25, fill: false, pointRadius: 2 },
          { label: '❓ unknown %', data: unknownTrend, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.1)', tension: 0.25, fill: false, pointRadius: 2 },
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } },
        },
        scales: {
          x: { ticks: { color: '#64748b', maxRotation: 45, font: { size: 9 } }, grid: { color: '#1a1f30' } },
          y: { position: 'right', min: 0, max: 100, ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' } },
        }
      }
    });
  } else {
    showEmptyState('chart-trigger-source-quality', 'אין נתוני trigger_source להצגה');
  }

  // ── פירוט כשלים שקטים ────────────────────────────────────────────
  if (failedSessions.length > 0) {
    // יצרן דרך device_id_anon — שולפים לכל המכשירים (לא רק כושלים) כדי לחשב שיעור מנורמל
    const allDeviceIds = [...new Set((data || []).map(r => r.device_id_anon).filter(Boolean))];
    let mfrMap = {};
    if (allDeviceIds.length > 0) {
      const { data: mfrData } = await sb
        .from('device_daily_active')
        .select('device_id_anon, manufacturer')
        .in('device_id_anon', allDeviceIds)
        .not('manufacturer', 'is', null)
        .limit(5000);
      if (mfrData) mfrData.forEach(r => { mfrMap[r.device_id_anon] = r.manufacturer; });
    }

    // סה"כ sessions לפי גרסה ויצרן (מכלל sessions, לא רק כשלים) — לנרמול
    const verTotals = {};
    const mfrTotals = {};
    (data || []).forEach(r => {
      if (r.app_version) verTotals[r.app_version] = (verTotals[r.app_version] || 0) + 1;
      const m = r.device_id_anon && mfrMap[r.device_id_anon];
      if (m) mfrTotals[m] = (mfrTotals[m] || 0) + 1;
    });

    // כשלים לפי גרסה
    const verCounts = {};
    failedSessions.forEach(s => { verCounts[s.appVersion] = (verCounts[s.appVersion] || 0) + 1; });

    // כשלים לפי יצרן
    const mfrCounts = {};
    failedSessions.forEach(s => {
      const m = (s.deviceId && mfrMap[s.deviceId]) || '(לא ידוע)';
      mfrCounts[m] = (mfrCounts[m] || 0) + 1;
    });

    // דלי משך זמן (app_killed בלבד)
    const durBuckets = { '0-30דק׳': 0, '30-60דק׳': 0, '1-3שע׳': 0, '3-6שע׳': 0, '6-12שע׳': 0, '12+שע׳': 0 };
    failedSessions
      .filter(s => s.outcome === 'app_killed' && s.durationMins != null)
      .forEach(s => {
        const m = s.durationMins;
        if (m < 30) durBuckets['0-30דק׳']++;
        else if (m < 60) durBuckets['30-60דק׳']++;
        else if (m < 180) durBuckets['1-3שע׳']++;
        else if (m < 360) durBuckets['3-6שע׳']++;
        else if (m < 720) durBuckets['6-12שע׳']++;
        else durBuckets['12+שע׳']++;
      });

    document.getElementById('reliability-detail').style.display = '';

    // גרסאות — שיעור כשל % (כשלים / סה"כ sessions לאותה גרסה)
    const vSorted = Object.entries(verCounts)
      .map(([v, c]) => ({ v, c, total: verTotals[v] || c, rate: Math.round(c / (verTotals[v] || c) * 100) }))
      .filter(d => (verTotals[d.v] || d.c) >= 3)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
    renderChart('chart-kill-versions', {
      type: 'bar',
      data: {
        labels: vSorted.map(d => `${d.v} (n=${d.total})`),
        datasets: [{
          data: vSorted.map(d => d.rate),
          backgroundColor: vSorted.map(d => d.rate >= 30 ? '#ef4444' : d.rate >= 15 ? '#f59e0b' : '#10b981'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}% כשל (${vSorted[ctx.dataIndex].c}/${vSorted[ctx.dataIndex].total} sessions)` } }
        },
        scales: {
          x: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
          y: { position: 'right', ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
        }
      }
    });

    // יצרנים — שיעור כשל % (כשלים / סה"כ sessions לאותו יצרן)
    const mSorted = Object.entries(mfrCounts)
      .filter(([m]) => m !== '(לא ידוע)' && mfrTotals[m])
      .map(([m, c]) => ({ m, c, total: mfrTotals[m], rate: Math.round(c / mfrTotals[m] * 100) }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
    if (mSorted.length > 0) {
      renderChart('chart-kill-manufacturers', {
        type: 'bar',
        data: {
          labels: mSorted.map(d => `${d.m} (n=${d.total})`),
          datasets: [{
            data: mSorted.map(d => d.rate),
            backgroundColor: mSorted.map(d => d.rate >= 30 ? '#ef4444' : d.rate >= 15 ? '#f59e0b' : '#10b981'),
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}% כשל (${mSorted[ctx.dataIndex].c}/${mSorted[ctx.dataIndex].total} sessions)` } }
          },
          scales: {
            x: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
            y: { position: 'right', ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
          }
        }
      });
    }

    const killedWithDur = failedSessions.filter(s => s.outcome === 'app_killed' && s.durationMins != null);
    if (killedWithDur.length > 0) {
      renderChart('chart-kill-duration', {
        type: 'bar',
        data: {
          labels: Object.keys(durBuckets),
          datasets: [{ data: Object.values(durBuckets), backgroundColor: '#ef4444', borderRadius: 4 }]
        },
        options: {
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} sessions` } } },
          scales: {
            x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1a1f30' } },
            y: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true }
          }
        }
      });
    }

    // ── הרשאות חסרות ─────────────────────────────────────────────────────
    const withPerms = failedSessions.filter(s => {
      // sessions שנוצרו בגרסה החדשה בלבד (יש permissions object בתוך props)
      return s.rawProps && s.rawProps.permissions;
    });
    if (withPerms.length > 0) {
      const permsEl = document.getElementById('reliability-permissions');
      const kpisEl  = document.getElementById('permissions-kpis');
      if (permsEl) permsEl.style.display = '';
      const PERM_LABELS = {
        bg_location:   { label: '📍 מיקום רקע', desc: 'כולם' },
        battery_exempt:{ label: '🔋 פטור סוללה', desc: 'כולם' },
        dnd_access:    { label: '🔕 גישת DND', desc: 'פרימיום' },
        overlay:       { label: '🖥 הצגה מעל מסכים', desc: 'פרימיום' },
      };
      const missingCounts = {};
      withPerms.forEach(s => {
        const p = s.rawProps.permissions;
        Object.keys(PERM_LABELS).forEach(k => {
          if (p[k] === false) missingCounts[k] = (missingCounts[k] || 0) + 1;
        });
      });
      if (kpisEl) {
        const n = withPerms.length;
        kpisEl.innerHTML = Object.entries(PERM_LABELS).map(([k, { label, desc }]) => {
          const missing = missingCounts[k] || 0;
          const color = missing > 0 ? '#ef4444' : '#10b981';
          return `<div class="kpi">
            <div class="label">${label} <span style="font-size:0.65rem;color:#475569">(${desc})</span></div>
            <div class="value" style="font-size:1.3rem;color:${color}">${missing > 0 ? missing + ' חסרה' : '✓ הכל'}</div>
            <div class="sub">${missing > 0 ? pct(missing, n) + ' מ-' + n + ' sessions עם נתונים' : n + ' sessions — הרשאה תקינה'}</div>
          </div>`;
        }).join('');
      }
    }
  }

  return {
    total,
    triggered: counts['triggered'] || 0,
    timeout: counts['timeout'] || 0,
  };
}

// ─── Retention ────────────────────────────────────────────────────────────
async function loadRetention(sb) {
  const since60 = DATA_START_DATE;
  const { data, error } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', since60)
    .order('event_date', { ascending: true }));

  if (error || !data?.length) return;

  const firstSeen = {};
  data.forEach(r => {
    if (!firstSeen[r.device_id_anon] || r.event_date < firstSeen[r.device_id_anon])
      firstSeen[r.device_id_anon] = r.event_date;
  });

  const activeDays = new Set(data.map(r => `${r.device_id_anon}|${r.event_date}`));

  function addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // D1 ו-D7 — אותו קוהורט (התקינו לפחות 8 ימים לפני), כדי שיהיו ישירות ניתנים להשוואה
  // D30 — קוהורט נפרד (31+ ימים), כי צריך שיהיה להם זמן לחזור
  const cohortD7  = Object.entries(firstSeen).filter(([,f]) => f <= dateNDaysAgo(8));
  const cohortD30 = Object.entries(firstSeen).filter(([,f]) => f <= dateNDaysAgo(31));

  const retD1 = cohortD7.length
    ? Math.round(cohortD7.filter(([dev,first]) =>
        activeDays.has(`${dev}|${addDays(first,1)}`)).length / cohortD7.length * 100)
    : null;
  const retD7 = cohortD7.length
    ? Math.round(cohortD7.filter(([dev,first]) =>
        [1,2,3,4,5,6,7].some(d => activeDays.has(`${dev}|${addDays(first,d)}`))).length / cohortD7.length * 100)
    : null;
  const retD30 = cohortD30.length
    ? Math.round(cohortD30.filter(([dev,first]) =>
        Array.from({length:30},(_,i)=>i+1).some(d => activeDays.has(`${dev}|${addDays(first,d)}`))).length / cohortD30.length * 100)
    : null;

  document.getElementById('retention-kpis').innerHTML = [
    ['תוך יום',   retD1,  cohortD7.length],
    ['תוך שבוע',  retD7,  cohortD7.length],
    ['תוך חודש',  retD30, cohortD30.length],
  ].map(([label, rate, n]) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${rate!==null?rate+'%':'—'}</div><div class="sub">${n ? n+' משתמשים' : 'אין מספיק נתונים'}</div></div>`
  ).join('');

  const cohort = Object.entries(firstSeen).map(([d]) => d);
  if (!cohort.length) return;

  const days = [1,2,3,4,5,6,7,10,14,21,30];
  const rates = days.map(maxDay => {
    // "תוך X ימים" = חזר בכל יום שהוא מ-1 עד maxDay
    const dayRange = Array.from({length: maxDay}, (_, i) => i + 1);
    const ret = cohort.filter(dev =>
      dayRange.some(d => activeDays.has(`${dev}|${addDays(firstSeen[dev], d)}`))
    ).length;
    return Math.round(ret / cohort.length * 100);
  });

  renderChart('chart-retention', {
    type: 'line',
    data: {
      labels: days.map(d => d === 1 ? 'תוך יום' : d === 7 ? 'תוך שבוע' : d === 30 ? 'תוך חודש' : `תוך ${d} ימים`),
      datasets: [{
        label: `שימור (${cohort.length} משתמשים)`,
        data: rates,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font:{size:11} } } },
      scales: {
        x: { ticks:{color:'#64748b'}, grid:{color:'#1a1f30'} },
        y: { position: 'right', ticks:{color:'#64748b', callback:v=>v+'%'}, grid:{color:'#1a1f30'}, min:0, max:100 },
      }
    }
  });

  // ── Cohort retention table ─────────────────────────────────────────────
  const cohortWrap = document.getElementById('cohort-table-wrap');
  if (!cohortWrap) return;

  function addDaysStr(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // קבץ לפי חודש הצטרפות
  const byMonth = {};
  Object.entries(firstSeen).forEach(([dev, first]) => {
    const m = first.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push({ dev, first });
  });

  const cohortMonths = Object.keys(byMonth).sort();
  const today = new Date().toISOString().slice(0, 10);
  const COLS = [
    { label: 'D1',  days: 1,  minAge: 2 },
    { label: 'D7',  days: 7,  minAge: 8 },
    { label: 'D14', days: 14, minAge: 15 },
    { label: 'D30', days: 30, minAge: 31 },
  ];

  function cohortCellColor(rate) {
    if (rate === null) return '#1a1f30';
    if (rate >= 20) return 'rgba(16,185,129,0.25)';
    if (rate >= 10) return 'rgba(245,158,11,0.25)';
    return 'rgba(239,68,68,0.2)';
  }
  function cohortTextColor(rate) {
    if (rate === null) return '#475569';
    if (rate >= 20) return '#4ade80';
    if (rate >= 10) return '#fbbf24';
    return '#f87171';
  }

  const rows = cohortMonths.map(month => {
    const members = byMonth[month];
    const n = members.length;
    const cells = COLS.map(col => {
      // בדוק שיש מספיק זמן מאז ההצטרפות
      const earliest = members.map(m => m.first).sort()[0];
      const ageInDays = (new Date(today) - new Date(earliest + '-01')) / 86400000;
      if (ageInDays < col.minAge) return null; // עדיין מוקדם
      const returned = members.filter(({ dev, first }) =>
        Array.from({ length: col.days }, (_, i) => i + 1).some(d => activeDays.has(`${dev}|${addDaysStr(first, d)}`))
      ).length;
      return Math.round(returned / n * 100);
    });
    return { month, n, cells };
  });

  if (!rows.length) {
    cohortWrap.innerHTML = '<div style="color:#475569;font-size:0.82rem">אין מספיק נתונים — יצטבר עם הזמן</div>';
    return;
  }

  cohortWrap.innerHTML = `
    <table class="cohort-table">
      <thead>
        <tr>
          <th>חודש</th>
          <th>גודל</th>
          ${COLS.map(c => `<th>${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.reverse().map(({ month, n, cells }) => `
          <tr>
            <td>${month}</td>
            <td style="color:#64748b">${n}</td>
            ${cells.map(rate => `
              <td style="background:${cohortCellColor(rate)};color:${cohortTextColor(rate)};font-weight:600">
                ${rate !== null ? rate + '%' : '—'}
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="font-size:0.72rem;color:#475569;margin-top:8px">🟢 ≥20% &nbsp; 🟡 10–19% &nbsp; 🔴 <10% &nbsp; — = עדיין מוקדם</div>
  `;
}

// ─── Peak Hours ────────────────────────────────────────────────────────────
async function loadPeakHours(sb, since30) {
  const { data, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 50000);

  if (error || !data?.length) return;

  const hours     = new Array(24).fill(0);
  const triggered = new Array(24).fill(0);
  const trigRealtimeByHour = new Array(24).fill(0); // background + geofence + native_sampling + foreground_check (rang live)
  const trigLateByHour = new Array(24).fill(0);     // notification_open + eta_fallback (real-time path failed)
  const trigUnknownByHour = new Array(24).fill(0);  // unknown / missing source (pre-instrumentation)
  const silentByHour = new Array(24).fill(0);

  const now = Date.now();
  data.forEach(r => {
    const h = new Date(r.started_at).getHours();
    hours[h]++;
    let key = r.outcome || null;
    if (!key) {
      const ageH = (now - new Date(r.started_at).getTime()) / 3600000;
      key = ageH < 12 ? 'open_active' : 'open_stale';
    }
    if (key === 'user_cancelled' && r.props?.reason === 'already_inside_radius') {
      key = 'already_inside_radius';
    }

    if (r.outcome === 'triggered') {
      triggered[h]++;
      const src = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
      // foreground_check = background rang + FSI opened the app (real-time). Only notification_open
      // (user tapped a notification) and eta_fallback (timed safety-net) are genuine late catches.
      if (src === 'background' || src === 'geofence' || src === 'native_sampling' || src === 'foreground_check') trigRealtimeByHour[h]++;
      else if (src === 'notification_open' || src === 'eta_fallback') trigLateByHour[h]++;
      else trigUnknownByHour[h]++;
    }
    if (key === 'app_killed' || key === 'open_stale') {
      silentByHour[h]++;
    }
  });

  const colors = hours.map((_, i) => {
    if (i >= 6  && i <= 9)  return '#10b981';
    if (i >= 15 && i <= 20) return '#3b82f6';
    if (i >= 22 || i <= 5)  return '#475569';
    return '#8b5cf6';
  });

  renderChart('chart-hours', {
    type: 'bar',
    data: {
      labels: Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`),
      datasets: [{ label:'הפעלות', data:hours, backgroundColor:colors, borderRadius:3 }]
    },
    options: {
      plugins: { legend:{display:false} },
      scales: {
        x: { ticks:{color:'#64748b',maxRotation:45,font:{size:10}}, grid:{color:'#1a1f30'} },
        y: { position: 'right', ticks:{color:'#64748b'}, grid:{color:'#1a1f30'}, beginAtZero:true },
      }
    }
  });

  // ── הצלחה לפי שעה — פירוק מקורות/ודאות ───────────────────────────────
  const successKpiEl = document.getElementById('success-by-hour-kpis');
  const nightHours = [22, 23, 0, 1, 2, 3, 4, 5];
  const dayHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const sumByHours = (arr, idxs) => idxs.reduce((s, i) => s + (arr[i] || 0), 0);
  const nightTotal = sumByHours(hours, nightHours);
  const dayTotal = sumByHours(hours, dayHours);
  const nightSilent = sumByHours(silentByHour, nightHours);
  const daySilent = sumByHours(silentByHour, dayHours);
  const totalUnknown = trigUnknownByHour.reduce((s, v) => s + v, 0);
  const totalTriggered = triggered.reduce((s, v) => s + v, 0);
  const nightSilentRate = nightTotal > 0 ? Math.round((nightSilent / nightTotal) * 100) : 0;
  const daySilentRate = dayTotal > 0 ? Math.round((daySilent / dayTotal) * 100) : 0;
  const unknownShare = totalTriggered > 0 ? Math.round((totalUnknown / totalTriggered) * 100) : 0;

  if (successKpiEl) {
    successKpiEl.innerHTML = [
      { label: '🌙 כשל שקט בלילה', value: `${nightSilentRate}%`, sub: `${nightSilent}/${nightTotal || 0} sessions`, color: nightSilentRate >= 18 ? '#ef4444' : nightSilentRate >= 10 ? '#f59e0b' : '#10b981' },
      { label: '☀️ כשל שקט ביום', value: `${daySilentRate}%`, sub: `${daySilent}/${dayTotal || 0} sessions`, color: daySilentRate >= 18 ? '#ef4444' : daySilentRate >= 10 ? '#f59e0b' : '#10b981' },
      { label: '❓ מקור לא ידוע', value: `${unknownShare}%`, sub: `${totalUnknown}/${totalTriggered || 0} triggered`, color: unknownShare >= 40 ? '#ef4444' : unknownShare >= 20 ? '#f59e0b' : '#10b981' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  renderChart('chart-success-by-hour', {
    type: 'bar',
    data: {
      labels: Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`),
      datasets: [
        { label: '🟢 בזמן-אמת (GPS+geofence)', data: trigRealtimeByHour, backgroundColor: 'rgba(16,185,129,0.85)', borderRadius: 2, yAxisID: 'y', stack: 'outcome' },
        { label: '🟡 נתפס מאוחר (פתיחה/ETA)', data: trigLateByHour, backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 2, yAxisID: 'y', stack: 'outcome' },
        { label: '❓ מקור לא ידוע', data: trigUnknownByHour, backgroundColor: 'rgba(74,222,128,0.85)', borderRadius: 2, yAxisID: 'y', stack: 'outcome' },
        { label: '🔴 silent ודאי', data: silentByHour, backgroundColor: 'rgba(239,68,68,0.82)', borderRadius: 2, yAxisID: 'y', stack: 'outcome' },
        { label: 'sessions', data: hours, type: 'line', borderColor: '#94a3b8', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: 'y2' },
      ]
    },
    options: {
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const hourTotal = hours[ctx.dataIndex] || 0;
              if (ctx.datasetIndex === 4) return ` sessions: ${ctx.parsed.y}`;
              const pctHour = hourTotal > 0 ? Math.round((ctx.parsed.y / hourTotal) * 100) : 0;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y} (${pctHour}% מהשעה)`;
            }
          }
        }
      },
      scales: {
        x: { ticks:{color:'#64748b',maxRotation:45,font:{size:10}}, grid:{color:'#1a1f30'} },
        y: {
          position: 'right',
          ticks: { color: '#64748b' },
          grid: { color: '#1a1f30' },
          beginAtZero: true,
          stacked: true,
          title: { display: true, text: 'תוצאות לפי מקור (כמות)', color: '#64748b', font: { size: 10 } },
        },
        y2: {
          position: 'left',
          ticks: { color: '#475569', font: { size: 10 } },
          grid: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'כמות', color: '#475569', font: { size: 10 } },
        },
      }
    }
  });
}

// ─── Session Duration by Outcome ───────────────────────────────────────────
async function loadSessionDuration(sb, since30) {
  const { data: rawData, error } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 50000);
  const data = (rawData || []).filter(r => r.ended_at != null && r.outcome != null);

  if (error || !data?.length) return;

  const BUCKETS = [
    { label: '<5s',     max: 5/60 },
    { label: '5-30s',   max: 0.5 },
    { label: '30s-2m',  max: 2 },
    { label: '2-10m',   max: 10 },
    { label: '10-30m',  max: 30 },
    { label: '30m-2h',  max: 120 },
    { label: '>2h',     max: Infinity },
  ];

  const OUTCOMES = ['triggered', 'user_cancelled', 'auto_cancelled_moving_away', 'timeout'];
  const COLORS = {
    triggered:                  '#10b981',
    user_cancelled:             '#3b82f6',
    auto_cancelled_moving_away: '#8b5cf6',
    timeout:                    '#ef4444',
  };
  const LABELS = {
    triggered:                  '✅ צלצל',
    user_cancelled:             '👤 בוטל',
    auto_cancelled_moving_away: '🚶 התרחק',
    timeout:                    '⏰ פג זמן',
  };

  const counts = {};
  OUTCOMES.forEach(o => { counts[o] = new Array(BUCKETS.length).fill(0); });

  data.forEach(r => {
    if (!counts[r.outcome]) return;
    const mins = (new Date(r.ended_at) - new Date(r.started_at)) / 60000;
    if (mins < 0) return;
    const bi = BUCKETS.findIndex(b => mins < b.max);
    if (bi >= 0) counts[r.outcome][bi]++;
  });

  const present = OUTCOMES.filter(o => counts[o].some(v => v > 0));
  if (!present.length) return;

  renderChart('chart-duration', {
    type: 'bar',
    data: {
      labels: BUCKETS.map(b => b.label),
      datasets: present.map(o => ({
        label: LABELS[o] || o,
        data: counts[o],
        backgroundColor: COLORS[o] || '#64748b',
        borderRadius: 3,
      }))
    },
    options: {
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} sessions` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: {
          position: 'right',
          type: 'logarithmic',
          ticks: { color: '#64748b', callback: v => Number.isInteger(Math.log10(v)) || v === 1 ? v : null },
          grid: { color: '#1a1f30' },
          min: 0.9,
        },
      }
    }
  });
}

// ─── New Users per Day ─────────────────────────────────────────────────────
async function loadNewUsers(sb, since30) {
  const since90 = DATA_START_DATE;
  const { data, error } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', since90)
    .order('event_date', { ascending: true }));

  if (error || !data?.length) return;

  // Apply OS filter (android/apple) — match loadDAU behaviour so the chart respects the OS scope.
  const filteredData = FILTERED_DEVICE_IDS ? applyOSFilter(data) : data;

  const firstSeen = {};
  filteredData.forEach(r => {
    if (!firstSeen[r.device_id_anon] || r.event_date < firstSeen[r.device_id_anon])
      firstSeen[r.device_id_anon] = r.event_date;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const newPerDay = {};
  Object.values(firstSeen).forEach(date => {
    // התעלם מתאריכים עתידיים (מכשירים עם שעון שגוי ששלחו event_date עתידי)
    if (date >= since30 && date <= todayStr) newPerDay[date] = (newPerDay[date] || 0) + 1;
  });

  const labels = Object.keys(newPerDay).sort();
  const values = labels.map(d => newPerDay[d]);
  if (!labels.length) return;
  const showMa = labels.length >= 7;
  const ma7 = showMa ? sma(values, 7) : null;

  renderChart('chart-new-users', {
    type: 'bar',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        { label: 'משתמשים חדשים', data: values, backgroundColor: '#10b981', borderRadius: 4, order: 1 },
        ...(showMa ? [{ label: 'ממוצע נע 7 ימים', data: ma7, type: 'line', borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, order: 0 }] : []),
      ]
    },
    options: {
      plugins: { legend: { display: showMa, labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

// ─── Inactive Users / Churn tracking ───────────────────────────────────────
async function loadInactiveUsers(sb) {
  const { data, error } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', DATA_START_DATE)
    .order('event_date', { ascending: true }));

  if (error) { showEmptyState('chart-inactive-users', `שגיאה: ${error.message}`); return; }
  if (!data?.length) { showEmptyState('chart-inactive-users'); return; }

  // last-seen date per device
  const lastSeen = {};
  data.forEach(r => {
    if (!lastSeen[r.device_id_anon] || r.event_date > lastSeen[r.device_id_anon])
      lastSeen[r.device_id_anon] = r.event_date;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();
  const daysSince = (dateStr) =>
    Math.floor((todayMs - new Date(dateStr + 'T00:00:00Z').getTime()) / 86400000);

  const buckets = { active: 0, cooling: 0, atRisk: 0, churned: 0 };
  Object.values(lastSeen).forEach(date => {
    const n = daysSince(date);
    if (n <= 2) buckets.active++;
    else if (n <= 7) buckets.cooling++;
    else if (n <= 14) buckets.atRisk++;
    else buckets.churned++;
  });

  const total = buckets.active + buckets.cooling + buckets.atRisk + buckets.churned;
  const inactive = buckets.atRisk + buckets.churned;
  const churnRate = total ? Math.round((inactive / total) * 100) : 0;
  const churnedRate = total ? Math.round((buckets.churned / total) * 100) : 0;

  document.getElementById('inactive-kpis').innerHTML = [
    ['סה"כ משתמשים', total, ''],
    ['לא פעילים (8+ ימים)', inactive, total ? `${churnRate}% מהכלל` : ''],
    ['נטשו (15+ ימים)', buckets.churned, total ? `${churnedRate}% מהכלל` : ''],
  ].map(([label, val, sub]) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${val}</div><div class="sub">${sub}</div></div>`
  ).join('');

  renderChart('chart-inactive-users', {
    type: 'bar',
    data: {
      labels: ['פעילים (0–2 ימים)', 'מצטננים (3–7)', 'בסיכון נטישה (8–14)', 'נטשו (15+)'],
      datasets: [{
        label: 'מספר משתמשים',
        data: [buckets.active, buckets.cooling, buckets.atRisk, buckets.churned],
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
        borderRadius: 4,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

// ─── App Open Frequency ───────────────────────────────────────────────────
async function loadAppOpenFrequency(sb, since30) {
  const { data, error } = await rpcDeviceFeatureEvents(sb, since30, 'app.opened', 200000);

  if (error) { showEmptyState('chart-app-open-freq', `שגיאה: ${error.message}`); return; }
  if (!data?.length) { showEmptyState('chart-app-open-freq', 'אין נתונים עדיין — app.opened יתחיל להצטבר בגרסה הקרובה'); return; }

  const opensPerDevice = {};
  (data || []).forEach(r => {
    opensPerDevice[r.device_id_anon] = (opensPerDevice[r.device_id_anon] || 0) + (r.count || 0);
  });

  const buckets = [
    { label: '1', min: 1, max: 1 },
    { label: '2–3', min: 2, max: 3 },
    { label: '4–6', min: 4, max: 6 },
    { label: '7–10', min: 7, max: 10 },
    { label: '11–19', min: 11, max: 19 },
    { label: '20+', min: 20, max: Infinity },
  ];

  const values = Object.values(opensPerDevice);
  const bucketCounts = buckets.map(b => values.filter(n => n >= b.min && n <= b.max).length);
  const totalDevices = values.length;
  const totalOpens = values.reduce((sum, value) => sum + value, 0);
  const medianOpens = (() => {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  })();
  const powerUsers = values.filter(n => n >= 20).length;

  const kpiEl = document.getElementById('app-open-freq-kpis');
  if (kpiEl) {
    kpiEl.innerHTML = [
      { label: 'מכשירים ייחודיים', value: totalDevices, sub: 'פתחו את האפליקציה לפחות פעם' },
      { label: 'חציון כניסות', value: medianOpens, sub: 'ב-30 יום' },
      { label: 'Power users (20+)', value: powerUsers, sub: pct(powerUsers, totalDevices) + ' מהמשתמשים', color: '#f59e0b' },
      { label: 'סה״כ כניסות', value: totalOpens, sub: 'app.opened events' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem${k.color ? ';color:' + k.color : ''}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  renderChart('chart-app-open-freq', {
    type: 'bar',
    data: {
      labels: buckets.map((b, i) => b.label + (i === buckets.length - 1 ? ' 🔥' : '')),
      datasets: [{
        label: 'מכשירים',
        data: bucketCounts,
        backgroundColor: buckets.map((_, i) => i === buckets.length - 1 ? '#f59e0b' : i >= 3 ? '#6366f1' : '#3b82f6'),
        borderRadius: 4,
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} מכשירים (${pct(ctx.parsed.y, totalDevices)})` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' }, title: { display: true, text: 'app.opened ב-30 יום', color: '#64748b', font: { size: 10 } } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

