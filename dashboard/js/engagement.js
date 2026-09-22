// ─── DAU / MAU ─────────────────────────────────────────────────────────────
async function loadDAU(sb, since30, today) {
  const { data, error } = await fetchAllRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', since30)
    .order('event_date', { ascending: true }));

  if (error) { console.error('DAU error:', error); return 0; }

  // Apply OS filter
  const filteredData = FILTERED_DEVICE_IDS ? applyOSFilter(data || []) : (data || []);

  const mauDevices = new Set(filteredData.map(r => r.device_id_anon));
  const mau = mauDevices.size;

  const dauDevices = new Set(filteredData.filter(r => r.event_date === today).map(r => r.device_id_anon));
  const dau = dauDevices.size;

  setText('kpi-dau', dau);
  setText('kpi-mau', mau);
  setText('kpi-stickiness', pct(dau, mau));

  const byDate = {};
  filteredData.forEach(r => {
    if (!byDate[r.event_date]) byDate[r.event_date] = new Set();
    byDate[r.event_date].add(r.device_id_anon);
  });
  const labels = Object.keys(byDate).sort();
  const values = labels.map(d => byDate[d].size);
  const showMa = labels.length >= 7;
  const ma7 = showMa ? sma(values, 7) : null;

  renderChart('chart-dau', {
    type: 'bar',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        { label: 'פעילים יומיים', data: values, backgroundColor: '#3b82f6', borderRadius: 4, order: 1 },
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
  return mau;
}

// ─── Feature Events ────────────────────────────────────────────────────────
async function loadFeatureEvents(sb, since30) {
  const { data, error } = await sb
    .from('feature_events')
    .select('event_name, count, event_date')
    .gte('event_date', since30);

  if (error) {
    console.error('feature_events error:', error);
    const tbody = document.getElementById('tbody-events');
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="error">שגיאת טעינה: ${escHtml(error.message)}</td></tr>`;
    ['chart-success-trend', 'chart-success-trend-alarms'].forEach(id =>
      showEmptyState(id, `שגיאה: ${error.message}`)
    );
    return;
  }

  const totals = {};
  const days = new Set();
  // feature_events is a global aggregate with no device_id_anon, so it can't honour the
  // OS/version/country scope. When such a scope is active, rebuild the per-event totals from
  // device_feature_events (filterable) so the funnel + KPIs + events table respect the filter.
  const scopedRows = await fetchScopedFeatureRows(sb, since30);
  const sourceRows = scopedRows || (data || []);
  sourceRows.forEach(r => {
    totals[r.event_name] = (totals[r.event_name] || 0) + r.count;
    days.add(r.event_date);
  });
  const numDays = Math.max(days.size, 1);

  const enabled     = totals['alarm.enabled'] || 0;
  const triggeredEvents = totals['alarm.triggered'] || 0;
  const triggered   = ALARM_SESSION_METRICS?.triggered ?? triggeredEvents;
  const dismissed   = totals['alarm.dismissed'] || 0;
  const toggledOff  = totals['location.alarm_toggled.off'] || 0;
  const timeoutEvents = totals['alarm.timeout'] || 0;
  const timeoutCount = ALARM_SESSION_METRICS?.timeout ?? timeoutEvents;
  const routeOn     = totals['route.alarm_toggled.on'] || 0;
  const locOn       = totals['location.alarm_toggled.on'] || 0;
  const ringtone    = totals['settings.alarm_style_changed'] || 0;
  const appOpened   = totals['app.opened'] || 0;
  const sessionTotal = ALARM_SESSION_METRICS?.total ?? 0;

  setText('kpi-enabled', enabled);
  setText('kpi-triggered', triggered);
  setText('kpi-success-rate', sessionTotal > 0 ? pct(triggered, sessionTotal) : '—');
  setText('kpi-dismissed', dismissed);
  setText('kpi-toggled-off', toggledOff);
  // kpi-timeout + kpi-session-success נקבעים מ-loadAlarmSessions (מבוסס sessions, מדויק יותר)
  setText('kpi-routes-pct', pct(routeOn, routeOn + locOn));
  setText('kpi-ringtone-pct', pct(ringtone, appOpened));

  renderChart('chart-funnel', {
    type: 'bar',
    data: {
      labels: ['הופעלו', 'צלצלו', 'כובו אחרי צלצול', 'כובו ידנית', 'פג זמן'],
      datasets: [{
        label: 'count',
        data: [enabled, triggered, dismissed, toggledOff, timeoutCount],
        backgroundColor: ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444'],
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y: { position: 'right', ticks: { color: '#94a3b8' }, grid: { display: false } },
      }
    }
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const tbody = document.getElementById('tbody-events');
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#475569;text-align:center;padding:20px">אין נתונים ב-feature_events עדיין</td></tr>';
  } else {
    tbody.innerHTML = sorted.map(([name, total]) => `
      <tr>
        <td style="font-family:monospace;direction:ltr">${escHtml(name)}</td>
        <td>${total.toLocaleString()}</td>
        <td>${(total / numDays).toFixed(1)}</td>
      </tr>
    `).join('');
  }

  // ── גרף שימור הפעלה אוטומטית ─────────────────────────────────────────
  const locCreated   = totals['location.created'] || 0;
  const locToggledOff = toggledOff;          // location.alarm_toggled.off
  const locToggledOn  = locOn;               // location.alarm_toggled.on
  // "נשארו פעילים" = יוצרו פחות כיבויים נטו (כיבויים שלא חזרו להפעיל)
  const netDisabled  = Math.max(0, locToggledOff - locToggledOn);
  const keptActive   = Math.max(0, locCreated - netDisabled);
  const disableRate  = locCreated > 0 ? Math.round((locToggledOff / locCreated) * 100) : 0;

  const kpiAlarmRetention = document.getElementById('kpi-alarm-retention');
  if (kpiAlarmRetention) {
    kpiAlarmRetention.innerHTML = [
      { label: 'יעדים שנוצרו', value: locCreated.toLocaleString(), sub: 'הופעלו אוטומטית' },
      { label: 'כיבויים ידניים', value: locToggledOff.toLocaleString(), sub: 'לחיצות כיבוי (כולל חוזרות)' },
      { label: 'חזרו להפעיל', value: locToggledOn.toLocaleString(), sub: 'לחיצות הפעלה ידנית' },
      { label: '% כיבוי מסך יצירה', value: locCreated > 0 ? disableRate + '%' : '—', sub: 'כיבויים / יצירות' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  // דוחן — נשארו פעילים vs כובו נטו
  renderChart('chart-alarm-retention-donut', {
    type: 'doughnut',
    data: {
      labels: ['נשארו פעילים', 'כובו ידנית (נטו)'],
      datasets: [{
        data: [keptActive, netDisabled],
        backgroundColor: ['#10b981', '#ef4444'],
        borderWidth: 0,
      }]
    },
    options: {
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = keptActive + netDisabled;
              const p = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${p}%)`;
            }
          }
        }
      }
    }
  });

  // עמודות — השוואה: יצירות / כיבויים / הפעלות חוזרות
  renderChart('chart-alarm-retention-bar', {
    type: 'bar',
    data: {
      labels: ['יוצרו (הופעלו אוטומטית)', 'כובו ידנית', 'הופעלו מחדש ידנית'],
      datasets: [{
        label: 'כמות',
        data: [locCreated, locToggledOff, locToggledOn],
        backgroundColor: ['#3b82f6', '#ef4444', '#10b981'],
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y: { position: 'right', ticks: { color: '#94a3b8' }, grid: { display: false } },
      }
    }
  });

  // ── משפך יצירה ──────────────────────────────────────────────────────
  const locAddOpened = totals['location.add_new_opened'] || 0;
  const locCancelled = totals['location.form_cancelled']  || 0;
  const rteAddOpened = totals['route.add_new_opened']     || 0;
  const rteCreated   = totals['route.created']            || 0;
  const rteCancelled = totals['route.form_cancelled']     || 0;
  // locCreated כבר מוגדר למעלה

  const funnelEl = document.getElementById('creation-funnel-bars');
  if (funnelEl && locAddOpened === 0 && rteAddOpened === 0) {
    funnelEl.innerHTML = '<div style="color:#475569;font-size:0.82rem;padding:16px 0;text-align:center;border:1px dashed #2d3250;border-radius:8px">אין נתונים עדיין — <code>location.add_new_opened</code> / <code>route.add_new_opened</code> לא נרשמו בתקופה זו</div>';
  }
  if (funnelEl && (locAddOpened > 0 || rteAddOpened > 0)) {
    const makeFunnelSection = (label, opened, created, cancelled, color) => {
      if (!opened) return `<div style="color:#475569;font-size:0.8rem;margin-bottom:16px">${label}: אין נתונים</div>`;
      const compPct = Math.round(created / opened * 100);
      const canPct  = Math.round(cancelled / opened * 100);
      const leftPct = 100 - compPct - canPct;
      const compColor = compPct >= 60 ? '#10b981' : compPct >= 40 ? '#f59e0b' : '#ef4444';
      const row = (lbl, n, pctVal, barColor) => `
        <div class="funnel-row">
          <div class="funnel-label">${lbl}</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${pctVal}%;background:${barColor}"></div><span class="funnel-val">${n}</span></div>
          <div class="funnel-pct">${pctVal}%</div>
        </div>`;
      return `<div style="margin-bottom:24px">
        <div style="font-size:0.85rem;font-weight:600;color:#94a3b8;margin-bottom:8px">${label}</div>
        ${row('פתחו טופס', opened, 100, '#334155')}
        ${row('שמרו ✅', created, compPct, color)}
        ${row('ביטלו ❌', cancelled, canPct, '#64748b')}
        <div style="font-size:0.75rem;color:#475569;margin-top:4px">${leftPct > 0 ? leftPct + '% עזבו ללא פעולה · ' : ''}${compPct < 40 ? '<span style="color:#ef4444">⚠️ נטישה גבוהה</span>' : ''}</div>
      </div>`;
    };
    funnelEl.innerHTML =
      makeFunnelSection('📍 מיקומים', locAddOpened, locCreated, locCancelled, '#3b82f6') +
      makeFunnelSection('🗺️ מסלולים', rteAddOpened, rteCreated, rteCancelled, '#6366f1');
  }

  // ── Gift / Rating modal analytics ──────────────────────────────────
  const giftShown = totals['gift.modal_shown'] || 0;
  const giftThanks = totals['gift.thanks_tapped'] || 0;
  const ratingShown = totals['rating.modal_shown'] || 0;
  const ratingPositive = totals['rating.positive_tapped'] || 0;
  const ratingNegative = totals['rating.negative_tapped'] || 0;
  const ratingLater = totals['rating.later_tapped'] || 0;
  const feedbackShown = totals['rating.feedback_modal_shown'] || 0;
  const feedbackSubmitted = totals['rating.feedback_submitted'] || 0;

  const giftRatingKpis = document.getElementById('gift-rating-kpis');
  if (giftRatingKpis) {
    giftRatingKpis.innerHTML = [
      { label: 'חשיפות מתנה', value: giftShown.toLocaleString(), sub: 'gift.modal_shown' },
      { label: 'חשיפות דירוג', value: ratingShown.toLocaleString(), sub: 'rating.modal_shown' },
      { label: '% תודה על מתנה', value: giftShown > 0 ? pct(giftThanks, giftShown) : '—', sub: 'gift.thanks_tapped / gift.modal_shown' },
      { label: '% תגובה בדירוג', value: ratingShown > 0 ? pct(ratingPositive + ratingNegative + ratingLater, ratingShown) : '—', sub: 'חיובי/שלילי/אחר כך מתוך חשיפות' },
      { label: '% שליחת פידבק', value: feedbackShown > 0 ? pct(feedbackSubmitted, feedbackShown) : '—', sub: 'rating.feedback_submitted / feedback_modal_shown' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.35rem">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  const giftRatingByDay = {
    giftShown: {},
    ratingShown: {},
    feedbackShown: {},
    feedbackSubmitted: {},
  };
  (data || []).forEach(r => {
    if (r.event_name === 'gift.modal_shown') {
      giftRatingByDay.giftShown[r.event_date] = (giftRatingByDay.giftShown[r.event_date] || 0) + r.count;
    }
    if (r.event_name === 'rating.modal_shown') {
      giftRatingByDay.ratingShown[r.event_date] = (giftRatingByDay.ratingShown[r.event_date] || 0) + r.count;
    }
    if (r.event_name === 'rating.feedback_modal_shown') {
      giftRatingByDay.feedbackShown[r.event_date] = (giftRatingByDay.feedbackShown[r.event_date] || 0) + r.count;
    }
    if (r.event_name === 'rating.feedback_submitted') {
      giftRatingByDay.feedbackSubmitted[r.event_date] = (giftRatingByDay.feedbackSubmitted[r.event_date] || 0) + r.count;
    }
  });

  const giftRatingLabels = Array.from(new Set([
    ...Object.keys(giftRatingByDay.giftShown),
    ...Object.keys(giftRatingByDay.ratingShown),
    ...Object.keys(giftRatingByDay.feedbackShown),
    ...Object.keys(giftRatingByDay.feedbackSubmitted),
  ])).sort();

  if (!giftRatingLabels.length) {
    showEmptyState('chart-gift-rating-trend', 'אין עדיין חשיפות למסכי מתנה/דירוג בתקופה זו');
  } else {
    renderChart('chart-gift-rating-trend', {
      type: 'line',
      data: {
        labels: giftRatingLabels.map(d => d.slice(5)),
        datasets: [
          {
            label: 'חשיפות מתנה',
            data: giftRatingLabels.map(d => giftRatingByDay.giftShown[d] || 0),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.2)',
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: 'חשיפות דירוג',
            data: giftRatingLabels.map(d => giftRatingByDay.ratingShown[d] || 0),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.2)',
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: 'מסך פידבק',
            data: giftRatingLabels.map(d => giftRatingByDay.feedbackShown[d] || 0),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139,92,246,0.2)',
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: 'פידבק שנשלח',
            data: giftRatingLabels.map(d => giftRatingByDay.feedbackSubmitted[d] || 0),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.2)',
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 14 }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  }

  const interactionCount = ratingPositive + ratingNegative + ratingLater;
  const funnelValues = [giftShown, giftThanks, ratingShown, interactionCount, feedbackShown, feedbackSubmitted];
  if (funnelValues.every(v => v === 0)) {
    showEmptyState('chart-gift-rating-funnel', 'אין נתוני משפך למסכי מתנה/דירוג בתקופה זו');
  } else {
    renderChart('chart-gift-rating-funnel', {
      type: 'bar',
      data: {
        labels: ['חשיפות מתנה', 'לחצו תודה', 'חשיפות דירוג', 'בחרו פעולה בדירוג', 'מסך פידבק', 'שלחו פידבק'],
        datasets: [{
          label: 'כמות',
          data: funnelValues,
          backgroundColor: ['#3b82f6', '#1d4ed8', '#f59e0b', '#f97316', '#8b5cf6', '#10b981'],
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
          y: { position: 'right', ticks: { color: '#94a3b8' }, grid: { display: false } },
        }
      }
    });
  }

  // ── GPS Speed Null ──────────────────────────────────────────────────
  const gpsNullTotal = totals['gps.speed_null'] || 0;
  const gpsGapTotal  = totals['gps.update_gap_detected'] || 0;
  const gpsPerDay    = numDays > 0 ? Math.round(gpsNullTotal / numDays) : 0;
  const gpsGapPerDay = numDays > 0 ? Math.round(gpsGapTotal / numDays) : 0;
  const gpsKpiEl     = document.getElementById('gps-null-kpis');
  if (gpsKpiEl) {
    const severity = gpsPerDay > 100 ? '🔴 גבוה מאוד' : gpsPerDay > 30 ? '🟡 מוגבר' : '✅ תקין';
    gpsKpiEl.innerHTML = [
      { label: 'סה\'\"כ null speeds', value: gpsNullTotal.toLocaleString(), sub: numDays + ' ימים' },
      { label: 'ממוצע יומי', value: gpsPerDay, sub: severity },
      { label: 'יחס ל-app.opened', value: appOpened ? (Math.round(gpsNullTotal / appOpened * 10) / 10) : '—', sub: 'nulls per open' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  const gpsGapKpiEl = document.getElementById('gps-gap-kpis');
  if (gpsGapKpiEl) {
    const severity =
      gpsGapPerDay >= QUALITY_THRESHOLDS.gpsGapPerDayCritical
        ? '🔴 גבוה'
        : gpsGapPerDay >= QUALITY_THRESHOLDS.gpsGapPerDayWarn
          ? '🟡 מוגבר'
          : '✅ תקין';
    gpsGapKpiEl.innerHTML = [
      { label: 'סה\'"כ gap detections', value: gpsGapTotal.toLocaleString(), sub: numDays + ' ימים' },
      { label: 'ממוצע יומי', value: gpsGapPerDay, sub: severity },
      {
        label: 'יחס מול gps.speed_null',
        value: gpsNullTotal > 0 ? pct(gpsGapTotal, gpsNullTotal) : '—',
        sub: gpsNullTotal > 0 ? `${gpsGapTotal}/${gpsNullTotal}` : 'אין null speeds להשוואה',
      },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  const gpsGapAlertEl = document.getElementById('gps-gap-alert');
  if (gpsGapAlertEl) {
    const warn = QUALITY_THRESHOLDS.gpsGapPerDayWarn;
    const critical = QUALITY_THRESHOLDS.gpsGapPerDayCritical;
    const isCritical = gpsGapPerDay >= critical;
    const isWarn = !isCritical && gpsGapPerDay >= warn;
    const bg = isCritical ? 'rgba(239,68,68,0.16)' : isWarn ? 'rgba(245,158,11,0.16)' : 'rgba(16,185,129,0.15)';
    const border = isCritical ? '#ef4444' : isWarn ? '#f59e0b' : '#10b981';
    const color = isCritical ? '#fca5a5' : isWarn ? '#fcd34d' : '#86efac';
    const level = isCritical ? 'CRITICAL' : isWarn ? 'WARNING' : 'OK';
    gpsGapAlertEl.style.display = '';
    gpsGapAlertEl.style.background = bg;
    gpsGapAlertEl.style.border = `1px solid ${border}`;
    gpsGapAlertEl.style.color = color;
    gpsGapAlertEl.innerHTML = `
      איכות GPS-gap: <strong>${level}</strong>
      · ממוצע יומי=${gpsGapPerDay} (סף אזהרה ${warn}, סף קריטי ${critical})
    `;
  }

  const gpsNullByDay = {};
  (data || []).filter(r => r.event_name === 'gps.speed_null').forEach(r => {
    gpsNullByDay[r.event_date] = (gpsNullByDay[r.event_date] || 0) + r.count;
  });
  const gpsLabels = Object.keys(gpsNullByDay).sort();
  if (gpsLabels.length === 0) {
    showEmptyState('chart-gps-null', 'אין אירועי gps.speed_null בתקופה זו — GPS עובד תקין ✅');
  } else {
  renderChart('chart-gps-null', {
      type: 'bar',
      data: {
        labels: gpsLabels.map(d => d.slice(5)),
        datasets: [{ label: 'gps.speed_null', data: gpsLabels.map(d => gpsNullByDay[d]), backgroundColor: '#f59e0b', borderRadius: 4 }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  }

  const gpsGapByDay = {};
  (data || []).filter(r => r.event_name === 'gps.update_gap_detected').forEach(r => {
    gpsGapByDay[r.event_date] = (gpsGapByDay[r.event_date] || 0) + r.count;
  });
  const gpsGapLabels = Object.keys(gpsGapByDay).sort();
  if (gpsGapLabels.length === 0) {
    showEmptyState('chart-gps-gap', 'אין אירועי gps.update_gap_detected בתקופה זו ✅');
  } else {
    const gpsGapDaily = gpsGapLabels.map(d => gpsGapByDay[d]);
    const gpsGapMa7 = gpsGapDaily.map((_, i) => {
      const window = gpsGapDaily.slice(Math.max(0, i - 6), i + 1);
      return window.length >= 2 ? Math.round(window.reduce((s, v) => s + v, 0) / window.length) : null;
    });

    renderChart('chart-gps-gap', {
      type: 'bar',
      data: {
        labels: gpsGapLabels.map(d => d.slice(5)),
        datasets: [
          { label: 'gps.update_gap_detected', data: gpsGapDaily, backgroundColor: '#ef4444', borderRadius: 4, order: 2 },
          {
            type: 'line',
            label: 'ממוצע 7 ימים',
            data: gpsGapMa7,
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.35,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: true,
            order: 1,
          },
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: ctx => gpsGapLabels[ctx[0].dataIndex],
              label: ctx => {
                const value = ctx.parsed.y;
                if (ctx.dataset.label === 'ממוצע 7 ימים') {
                  return value !== null ? ` ממוצע 7 ימים: ${value}` : ' אין מספיק נתונים';
                }
                return ` gps.update_gap_detected: ${value}`;
              },
            }
          }
        },
        scales: {
          x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  }

  // ── Approaching notification funnel ────────────────────────────────────
  const approachingEl = document.getElementById('approaching-funnel-bars');
  if (approachingEl) {
    const approachingSent = totals['alarm.approaching_notification_sent'] || 0;
    const alarmEnabled   = totals['alarm.enabled'] || 0;

    const { data: sessData, error: sessError } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);

    if (sessError) {
      approachingEl.innerHTML = `<div style="color:#f87171;font-size:0.82rem;padding:12px 0;text-align:center;border:1px dashed #7f1d1d;border-radius:8px">שגיאת טעינה ב-<code>alarm_sessions</code>: ${escHtml(sessError.message)}</div>`;
    } else if (!sessData?.length) {
      approachingEl.innerHTML = '<div style="color:#475569;font-size:0.82rem;padding:12px 0;text-align:center;border:1px dashed #2d3250;border-radius:8px">אין נתונים עדיין — <code>alarm_sessions</code> לא נרשמו בתקופה זו</div>';
    } else {
      const now = Date.now();
      const counts = {};
      const trigSrcCounts = {};

      (sessData || []).forEach(r => {
        let key = r.outcome || null;
        if (!key) {
          const ageH = (now - new Date(r.started_at).getTime()) / 3600000;
          key = ageH < 12 ? 'open_active' : 'open_stale';
        }
        if (key === 'user_cancelled' && r.props?.reason === 'already_inside_radius') {
          key = 'already_inside_radius';
        }
        counts[key] = (counts[key] || 0) + 1;
        if (r.outcome === 'triggered') {
          const src = r.props?.trigger_source || 'unknown';
          trigSrcCounts[src] = (trigSrcCounts[src] || 0) + 1;
        }
      });

      const totalSessions = sessData.length;
      // Real-time certain success = rang automatically without the user having to act.
      //   background = GPS proximity loop · geofence = native OS geofence safety-net (both ring live) ·
      //   native_sampling = native dynamic GPS sampling · foreground_check = background rang +
      //   fullScreenIntent opened the app (pending existence proves the background ring path ran;
      //   see isRealtimeTriggered in helpers.js).
      const trigBg = trigSrcCounts['background'] || 0;
      const trigGeo = trigSrcCounts['geofence'] || 0;
      const trigNative = trigSrcCounts['native_sampling'] || 0;
      const trigFg = trigSrcCounts['foreground_check'] || 0;
      const trigNotifOpen = trigSrcCounts['notification_open'] || 0;
      const trigEta = trigSrcCounts['eta_fallback'] || 0;
      const trigUnknown = trigSrcCounts['unknown'] || 0;
      const realtimeCertain = trigBg + trigGeo + trigNative + trigFg;
      // Late catch = the alarm DID alert, but only after the real-time path failed —
      //   the user tapped a notification (notification_open) or the timed ETA fallback fired.
      const lateCatch = trigNotifOpen + trigEta;
      const silentCertain = (counts['app_killed'] || 0) + (counts['open_stale'] || 0);
      const unclassified = Math.max(0, totalSessions - (realtimeCertain + lateCatch + trigUnknown + silentCertain));

      const certainSuccessRate = Math.round((realtimeCertain / totalSessions) * 100);
      const lateRate = Math.round((lateCatch / totalSessions) * 100);
      const silentRate = Math.round((silentCertain / totalSessions) * 100);
      const unknownRate = Math.round((trigUnknown / totalSessions) * 100);

      const silentColor = silentRate >= 20 ? '#ef4444' : silentRate >= 12 ? '#f59e0b' : '#10b981';
      const unknownColor = unknownRate >= 30 ? '#ef4444' : unknownRate >= 15 ? '#f59e0b' : '#10b981';

      function fRow(label, n, base, color) {
        const w = base > 0 ? Math.max(2, Math.round(n / base * 100)) : 0;
        const p = base > 0 ? Math.round(n / base * 100) + '%' : '—';
        return `<div class="funnel-row">
          <div class="funnel-label">${label}</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${w}%;background:${color}"></div><span class="funnel-val">${n.toLocaleString()}</span></div>
          <div class="funnel-pct">${p}</div>
        </div>`;
      }

      approachingEl.innerHTML = `
        ${fRow('🔔 sessions הופעלו (30 יום)', totalSessions, totalSessions, '#334155')}
        ${fRow('🟢 ודאי הצליח בזמן-אמת (GPS + geofence)', realtimeCertain, totalSessions, '#10b981')}
        ${fRow('🟡 נתפס מאוחר (פתיחה / ETA)', lateCatch, totalSessions, '#eab308')}
        ${fRow('🟡 הצליח — מקור לא ידוע (קדם-מכשור)', trigUnknown, totalSessions, '#4ade80')}
        ${fRow('🔴 כשל שקט ודאי', silentCertain, totalSessions, '#ef4444')}
        ${fRow('⚪ ביטול / אחר', unclassified, totalSessions, '#64748b')}
        <div style="margin-top:12px;font-size:0.82rem">
          ודאי הצלחה בזמן-אמת: <strong style="color:#10b981">${certainSuccessRate}%</strong>
          <span style="color:#475569;font-size:0.72rem;margin-right:8px">(${realtimeCertain.toLocaleString()} / ${totalSessions.toLocaleString()})</span>
          · נתפס מאוחר: <strong style="color:#eab308">${lateRate}%</strong>
          <span style="color:#475569;font-size:0.72rem;margin-right:8px">(${lateCatch.toLocaleString()} / ${totalSessions.toLocaleString()})</span>
          · כשל שקט ודאי: <strong style="color:${silentColor}">${silentRate}%</strong>
          <span style="color:#475569;font-size:0.72rem;margin-right:8px">(${silentCertain.toLocaleString()} / ${totalSessions.toLocaleString()})</span>
          · מקור לא ידוע: <strong style="color:${unknownColor}">${unknownRate}%</strong>
          <span style="color:#475569;font-size:0.72rem;margin-right:8px">(${trigUnknown.toLocaleString()} / ${totalSessions.toLocaleString()})</span>
        </div>
        <div style="margin-top:6px;font-size:0.72rem;color:#64748b">
          📡 context בלבד: approaching_sent=${approachingSent.toLocaleString()} · alarm.enabled=${alarmEnabled.toLocaleString()}
          · פירוט late: foreground=${trigFg.toLocaleString()} · notif_open=${trigNotifOpen.toLocaleString()} · eta=${trigEta.toLocaleString()}
        </div>
      `;
    }
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────
async function loadVersions(sb, since30) {
  const { data, error } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, app_version, event_date')
    .gte('event_date', since30)
    .order('event_date', { ascending: true }));

  if (error) return;

  // נשמור את הגרסה הכי עדכנית לכל מכשיר (ascending → האחרון מנצח)
  const deviceVersion = {};
  (data || []).forEach(r => { deviceVersion[r.device_id_anon] = r.app_version; });

  const versionCount = {};
  Object.values(deviceVersion).forEach(v => {
    const key = v || 'לא ידוע';
    versionCount[key] = (versionCount[key] || 0) + 1;
  });

  const sorted = Object.entries(versionCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const palette = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#a855f7', '#06b6d4'];

  renderChart('chart-versions', {
    type: 'doughnut',
    data: {
      labels: sorted.map(([v]) => v),
      datasets: [{ data: sorted.map(([, c]) => c), backgroundColor: palette, borderWidth: 0 }]
    },
    options: {
      plugins: { legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }
    }
  });
}

// ─── Version Comparison (לפי גרסה — באחוזים) ─────────────────────────────────
// Classifies an alarm-session row into a comparable outcome key.
// Mirrors the canonical logic in loadAlarmSessions so figures agree.
function classifySessionOutcome(r, nowMs) {
  let key = r.outcome || null;
  if (!key) {
    const ageH = (nowMs - new Date(r.started_at).getTime()) / 3600000;
    key = ageH < 12 ? 'open_active' : 'open_stale';
  }
  if (key === 'user_cancelled' && r.props?.reason === 'already_inside_radius') {
    key = 'already_inside_radius';
  }
  if (key === 'triggered') {
    const ts = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
    if (ts === 'notification_open' || ts === 'eta_fallback') {
      key = 'triggered_late';
    }
  }
  return key;
}

async function loadVersionComparison(sb, since30) {
  // השוואת גרסאות מתעלמת מפילוח הגרסה (תמיד כל הגרסאות) אך מכבדת פילוח מדינה.
  const baseClient = createBaseClient();
  const { countryCode } = getDashboardScopeParams();
  const sinceIso = since30 + 'T00:00:00Z';

  const { data: sessions, error: sErr } = await baseClient.rpc('dashboard_alarm_sessions_read', {
    p_since: sinceIso,
    p_limit: 100000,
    p_app_version: null,
    p_country_code: countryCode,
  });

  // מכשירים פעילים לכל גרסה (הגרסה האחרונה שנראתה לכל מכשיר)
  const { data: deviceRows } = await fetchAllRows(() => {
    let q = baseClient
      .from('device_daily_active')
      .select('device_id_anon, app_version, event_date, manufacturer')
      .gte('event_date', since30)
      .order('event_date', { ascending: true });
    if (countryCode) q = q.eq('country_code', countryCode);
    return q;
  });

  const deviceVersion = {};
  const deviceMfr = {}; // device_id_anon -> manufacturer (lowercased; ליבת הנירמול)
  (deviceRows || []).forEach(r => {
    if (r.app_version) deviceVersion[r.device_id_anon] = r.app_version;
    const m = (r.manufacturer || '').toString().trim().toLowerCase();
    if (m) deviceMfr[r.device_id_anon] = m;
  });
  const devicesByVersion = {};
  Object.values(deviceVersion).forEach(v => { devicesByVersion[v] = (devicesByVersion[v] || 0) + 1; });

  const tbody = document.getElementById('tbody-version-compare');
  if (sErr) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="error">שגיאה: ${escHtml(sErr.message)}</td></tr>`;
    return;
  }

  const now = Date.now();
  const mfrKey = (id) => deviceMfr[id] || 'unknown';
  // אגרגציה לכל גרסה
  const baseMfr = {}; // שיעור הצלחה בסיס לכל יצרן באוכלוסייה כולה (ליבת הנירמול)
  const byVersion = {};
  const ensure = (v) => byVersion[v] || (byVersion[v] = {
    total: 0, triggered: 0, late: 0, silent: 0, timeout: 0, cancelled: 0,
    devices: new Set(), mfrTotals: {}, mfrSet: new Set(),
  });
  (sessions || []).forEach(r => {
    // Real trips only — exclude toggle noise so every per-version rate matches the headline.
    if (!isRealTripSession(r)) return;
    const v = r.app_version || 'לא ידוע';
    const b = ensure(v);
    b.total++;
    b.devices.add(r.device_id_anon);
    const mk = mfrKey(r.device_id_anon);
    b.mfrTotals[mk] = (b.mfrTotals[mk] || 0) + 1;
    b.mfrSet.add(mk);
    const key = classifySessionOutcome(r, now);
    if (key === 'triggered') b.triggered++;
    else if (key === 'triggered_late') b.late++;
    else if (key === 'app_killed' || key === 'open_stale') b.silent++;
    else if (key === 'timeout') b.timeout++;
    else if (key === 'user_cancelled') b.cancelled++;
    // בסיס אוכלוסייה לכל יצרן — הצלחה real-time בלבד (key === 'triggered')
    const pop = baseMfr[mk] || (baseMfr[mk] = { total: 0, triggered: 0 });
    pop.total++;
    if (key === 'triggered') pop.triggered++;
  });

  // ודא שגם גרסאות עם מכשירים אך ללא sessions מופיעות
  Object.keys(devicesByVersion).forEach(v => ensure(v));

  // ── נירמול לפי הרכב יצרנים (indirect standardization) ──
  // לכל יצרן שיעור-הצלחה בסיס באוכלוסייה. "מצופה" לגרסה = סך ה-sessions שלה משוקלל
  // בשיעור הבסיס של היצרנים שלה. מנורמל = שיעור-האוכלוסייה הגולמי × (נצפה/מצופה).
  // מנטרל את הטיית הרכב-המכשירים: build על Pixel בלבד לא "ינצח" מלאכותית.
  let popTotal = 0, popTriggered = 0;
  Object.values(baseMfr).forEach(m => { popTotal += m.total; popTriggered += m.triggered; });
  const crudeRate = popTotal > 0 ? popTriggered / popTotal : null;
  const baseRate = {};
  Object.entries(baseMfr).forEach(([m, s]) => { baseRate[m] = s.total > 0 ? s.triggered / s.total : null; });
  function adjustedSuccess(b) {
    if (!b.total || crudeRate === null) return null;
    let expected = 0, haveBase = 0;
    Object.entries(b.mfrTotals).forEach(([m, n]) => {
      const br = baseRate[m];
      if (br != null) { expected += n * br; haveBase += n; }
    });
    if (expected <= 0 || haveBase < b.total * 0.5) return null; // אין בסיס אמין מספיק
    const smr = b.triggered / expected; // Standardized Morbidity Ratio
    return Math.min(100, Math.round(crudeRate * smr * 100));
  }
  // מדגם מוטה: יצרן יחיד (אין גיוון מכשירים) או מתחת ל-30 sessions
  function biasNote(b) {
    const reasons = [];
    if (b.total > 0 && b.mfrSet.size <= 1) reasons.push('יצרן יחיד');
    if (b.total > 0 && b.total < 30) reasons.push('<30 sessions');
    return reasons;
  }

  const versions = Object.keys(byVersion).sort(compareVersions);
  const pctNum = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const fmtPct = (n) => (n === null ? '—' : n + '%');

  if (!versions.length || versions.every(v => byVersion[v].total === 0 && !devicesByVersion[v])) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="color:#475569">אין נתונים עדיין</td></tr>';
    showEmptyState('chart-version-success', 'אין נתונים עדיין');
    showEmptyState('chart-version-breakdown', 'אין נתונים עדיין');
    showEmptyState('chart-version-silent', 'אין נתונים עדיין');
    return;
  }

  // ── טבלה ──
  if (tbody) {
    tbody.innerHTML = versions.map(v => {
      const b = byVersion[v];
      const devices = devicesByVersion[v] || b.devices.size || 0;
      const succ = pctNum(b.triggered, b.total);
      const succColor = succ === null ? '#64748b' : succ >= 70 ? '#10b981' : succ >= 50 ? '#f59e0b' : '#ef4444';
      const silentPct = pctNum(b.silent, b.total);
      const silentColor = silentPct === null ? '#64748b' : silentPct >= 18 ? '#ef4444' : silentPct >= 10 ? '#f59e0b' : '#10b981';
      const perDevice = devices > 0 && b.total > 0 ? (b.total / devices).toFixed(1) : '—';
      const adj = adjustedSuccess(b);
      const adjColor = adj === null ? '#64748b' : adj >= 70 ? '#10b981' : adj >= 50 ? '#f59e0b' : '#ef4444';
      const mfrList = Object.entries(b.mfrTotals).sort((a, c) => c[1] - a[1]).map(([m, n]) => `${m}:${n}`).join(' · ');
      const adjTitle = adj === null ? 'אין מספיק בסיס יצרני לנירמול' : `מנורמל להרכב היצרנים של הגרסה (${mfrList}). מסיר את יתרון/חיסרון המכשירים.`;
      const reasons = biasNote(b);
      const warn = reasons.length
        ? ` <span title="מדגם מוטה — ${reasons.join(' · ')}. ההשוואה הגולמית לא אמינה; הסתמך על העמודה המנורמלת." style="color:#f59e0b;cursor:help">⚠️</span>`
        : '';
      return `<tr>
        <td style="font-weight:600;color:#7dd3fc">v${escHtml(v)}${warn}</td>
        <td>${devices.toLocaleString()}</td>
        <td>${b.total.toLocaleString()}</td>
        <td style="color:${succColor};font-weight:600">${fmtPct(succ)}</td>
        <td style="color:${adjColor}" title="${escHtml(adjTitle)}">${adj === null ? '—' : adj + '%'}</td>
        <td>${fmtPct(pctNum(b.late, b.total))}</td>
        <td style="color:${silentColor}">${fmtPct(silentPct)}</td>
        <td>${fmtPct(pctNum(b.timeout, b.total))}</td>
        <td>${fmtPct(pctNum(b.cancelled, b.total))}</td>
        <td>${perDevice}</td>
      </tr>`;
    }).join('');
  }

  // לתרשימים — רק גרסאות עם מינימום sessions, מסודרות מהישנה לחדשה (ציר X טבעי)
  const MIN_SESSIONS = 10;
  const chartVersions = versions
    .filter(v => byVersion[v].total >= MIN_SESSIONS)
    .sort((a, b) => compareVersions(b, a)); // ascending (ישן → חדש) לתרשים מגמה
  const labels = chartVersions.map(v => 'v' + v);

  if (!chartVersions.length) {
    showEmptyState('chart-version-success', `אין גרסה עם ${MIN_SESSIONS}+ sessions עדיין`);
    showEmptyState('chart-version-breakdown', `אין גרסה עם ${MIN_SESSIONS}+ sessions עדיין`);
    showEmptyState('chart-version-silent', `אין גרסה עם ${MIN_SESSIONS}+ sessions עדיין`);
    return;
  }

  const successData = chartVersions.map(v => pctNum(byVersion[v].triggered, byVersion[v].total));
  const adjustedData = chartVersions.map(v => adjustedSuccess(byVersion[v]));
  const lateData = chartVersions.map(v => pctNum(byVersion[v].late, byVersion[v].total));
  const silentData = chartVersions.map(v => pctNum(byVersion[v].silent, byVersion[v].total));
  const otherData = chartVersions.map(v => {
    const b = byVersion[v];
    const accounted = b.triggered + b.late + b.silent;
    return pctNum(b.total - accounted, b.total);
  });

  renderChart('chart-version-success', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: '% הצלחה גולמי',
          data: successData,
          backgroundColor: successData.map(p => p === null ? '#475569' : p >= 70 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'),
          borderRadius: 4,
          order: 2,
        },
        {
          type: 'line',
          label: '📐 מנורמל להרכב יצרנים',
          data: adjustedData,
          borderColor: '#38bdf8',
          backgroundColor: '#38bdf8',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          spanGaps: true,
          order: 1,
        },
      ]
    },
    options: {
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}% (${byVersion[chartVersions[ctx.dataIndex]].total} sessions)` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
      }
    }
  });

  renderChart('chart-version-breakdown', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '✅ הצלחה real-time', data: successData, backgroundColor: 'rgba(16,185,129,0.85)', borderRadius: 2, stack: 's' },
        { label: '🟡 צלצל מאוחר', data: lateData, backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 2, stack: 's' },
        { label: '🔴 כשל שקט', data: silentData, backgroundColor: 'rgba(239,68,68,0.82)', borderRadius: 2, stack: 's' },
        { label: '⚪ אחר (בוטל/פג זמן/וכו)', data: otherData, backgroundColor: 'rgba(100,116,139,0.7)', borderRadius: 2, stack: 's' },
      ]
    },
    options: {
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: { stacked: true, position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
      }
    }
  });

  renderChart('chart-version-silent', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% כשל שקט',
        data: silentData,
        backgroundColor: silentData.map(p => p === null ? '#475569' : p >= 18 ? '#ef4444' : p >= 10 ? '#f59e0b' : '#10b981'),
        borderRadius: 4,
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}% כשל שקט (${byVersion[chartVersions[ctx.dataIndex]].silent} sessions)` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });
}

// ─── Day of Week (ימות השבוע) ────────────────────────────────────────────────
const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

async function loadDayOfWeek(sb, since30) {
  // מכבד את פילוח הגרסה והמדינה (משתמש ב-sb ה-scoped וב-rpc הרגיל)
  const { data: sessions, error: sErr } = await rpcAlarmSessions(sb, since30 + 'T00:00:00Z', 100000);

  const now = Date.now();
  // אגרגציה ל-7 ימי שבוע (0=ראשון)
  const dow = Array.from({ length: 7 }, () => ({ total: 0, triggered: 0, late: 0, silent: 0, other: 0 }));
  if (!sErr) {
    (sessions || []).forEach(r => {
      const d = new Date(r.started_at);
      if (isNaN(d)) return;
      // Real trips only — exclude toggle noise so daily success rates match the headline.
      if (!isRealTripSession(r)) return;
      const idx = d.getDay();
      const b = dow[idx];
      b.total++;
      const key = classifySessionOutcome(r, now);
      if (key === 'triggered') b.triggered++;
      else if (key === 'triggered_late') b.late++;
      else if (key === 'app_killed' || key === 'open_stale') b.silent++;
      else b.other++;
    });
  }

  const pctNum = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const successPct = dow.map(b => pctNum(b.triggered, b.total));
  const latePct = dow.map(b => pctNum(b.late, b.total));
  const silentPct = dow.map(b => pctNum(b.silent, b.total));
  const otherPct = dow.map(b => pctNum(b.other, b.total));
  const totalSessions = dow.reduce((s, b) => s + b.total, 0);

  // ── KPIs: היום הטוב/הגרוע ביותר בהצלחה ──
  const kpiEl = document.getElementById('weekday-success-kpis');
  if (kpiEl) {
    if (totalSessions === 0) {
      kpiEl.innerHTML = '<div style="color:#475569;font-size:0.82rem">אין נתונים עדיין</div>';
    } else {
      const ranked = dow
        .map((b, i) => ({ i, total: b.total, succ: pctNum(b.triggered, b.total) }))
        .filter(x => x.total >= 5 && x.succ !== null);
      const best = ranked.reduce((a, x) => (a === null || x.succ > a.succ ? x : a), null);
      const worst = ranked.reduce((a, x) => (a === null || x.succ < a.succ ? x : a), null);
      const busiest = dow
        .map((b, i) => ({ i, total: b.total }))
        .reduce((a, x) => (x.total > a.total ? x : a), { i: 0, total: -1 });
      kpiEl.innerHTML = [
        best ? { label: '🟢 היום הכי מצליח', value: HEBREW_WEEKDAYS[best.i], sub: best.succ + '% הצלחה', color: '#10b981' } : null,
        worst ? { label: '🔴 היום הכי פחות מצליח', value: HEBREW_WEEKDAYS[worst.i], sub: worst.succ + '% הצלחה', color: '#ef4444' } : null,
        { label: '🔔 היום העמוס ביותר', value: HEBREW_WEEKDAYS[busiest.i], sub: busiest.total + ' sessions', color: '#3b82f6' },
      ].filter(Boolean).map(k =>
        `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`
      ).join('');
    }
  }

  // ── % הצלחה לפי יום ──
  if (totalSessions > 0) {
    renderChart('chart-weekday-success', {
      type: 'bar',
      data: {
        labels: HEBREW_WEEKDAYS,
        datasets: [{
          label: '% הצלחה real-time',
          data: successPct,
          backgroundColor: successPct.map(p => p === null ? '#475569' : p >= 70 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'),
          borderRadius: 4,
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}% (${dow[ctx.dataIndex].total} sessions)` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
        }
      }
    });

    // ── sessions לפי יום (כמות מצטברת) ──
    renderChart('chart-weekday-sessions', {
      type: 'bar',
      data: {
        labels: HEBREW_WEEKDAYS,
        datasets: [{ label: 'sessions', data: dow.map(b => b.total), backgroundColor: '#6366f1', borderRadius: 4 }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} sessions (${pctNum(ctx.parsed.y, totalSessions)}% מהשבוע)` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });

    // ── פירוק תוצאות מוערם ──
    renderChart('chart-weekday-breakdown', {
      type: 'bar',
      data: {
        labels: HEBREW_WEEKDAYS,
        datasets: [
          { label: '✅ הצלחה real-time', data: successPct, backgroundColor: 'rgba(16,185,129,0.85)', borderRadius: 2, stack: 's' },
          { label: '🟡 צלצל מאוחר', data: latePct, backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 2, stack: 's' },
          { label: '🔴 כשל שקט', data: silentPct, backgroundColor: 'rgba(239,68,68,0.82)', borderRadius: 2, stack: 's' },
          { label: '⚪ אחר', data: otherPct, backgroundColor: 'rgba(100,116,139,0.7)', borderRadius: 2, stack: 's' },
        ]
      },
      options: {
        plugins: {
          legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
          y: { stacked: true, position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
        }
      }
    });
  } else {
    showEmptyState('chart-weekday-success', 'אין נתונים עדיין');
    showEmptyState('chart-weekday-sessions', 'אין נתונים עדיין');
    showEmptyState('chart-weekday-breakdown', 'אין נתונים עדיין');
  }

  // ── משתמשים פעילים ממוצע ליום בשבוע (מנוטרל ממספר הופעות היום) ──
  const { data: deviceRows, error: dErr } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, event_date')
    .gte('event_date', since30));

  if (!dErr && deviceRows?.length) {
    // לכל תאריך — קבוצת מכשירים ייחודיים
    const devicesPerDate = {};
    deviceRows.forEach(r => {
      const dateStr = r.event_date;
      (devicesPerDate[dateStr] || (devicesPerDate[dateStr] = new Set())).add(r.device_id_anon);
    });
    const sumByDow = Array(7).fill(0);
    const countByDow = Array(7).fill(0);
    Object.entries(devicesPerDate).forEach(([dateStr, set]) => {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d)) return;
      const idx = d.getDay();
      sumByDow[idx] += set.size;
      countByDow[idx] += 1;
    });
    const avgByDow = sumByDow.map((s, i) => (countByDow[i] > 0 ? Math.round(s / countByDow[i]) : 0));
    renderChart('chart-weekday-dau', {
      type: 'bar',
      data: {
        labels: HEBREW_WEEKDAYS,
        datasets: [{ label: 'ממוצע פעילים', data: avgByDow, backgroundColor: '#0ea5e9', borderRadius: 4 }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} פעילים בממוצע (${countByDow[ctx.dataIndex]} ${HEBREW_WEEKDAYS[ctx.dataIndex]}'ים בתקופה)` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  } else {
    showEmptyState('chart-weekday-dau', 'אין נתונים עדיין');
  }
}

// ─── Languages ─────────────────────────────────────────────────────────────
const LANGUAGE_LABELS = {
  he: 'עברית',
  en: 'English',
  ar: 'العربية',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
};

async function loadLanguageUsage(sb, since30) {
  const { data, error } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, language_code, event_date')
    .gte('event_date', since30)
    .order('event_date', { ascending: true }));

  if (error) {
    showEmptyState('chart-languages', `שגיאה: ${error.message}`);
    return;
  }
  if (!data?.length) {
    showEmptyState('chart-languages', 'אין נתוני שפה עדיין');
    return;
  }

  // Keep the latest language snapshot per device in the selected window.
  const deviceLang = {};
  (data || []).forEach(r => {
    const raw = String(r.language_code || '').trim().toLowerCase();
    deviceLang[r.device_id_anon] = raw || 'unknown';
  });

  const counts = {};
  Object.values(deviceLang).forEach(code => {
    const key = code || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = sorted.map(([code]) => {
    if (code === 'unknown') return 'לא ידוע';
    const friendly = LANGUAGE_LABELS[code] || code;
    return `${friendly} (${code})`;
  });

  renderChart('chart-languages', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'משתמשים פעילים',
        data: sorted.map(([, c]) => c),
        backgroundColor: '#0ea5e9',
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y: { position: 'right', ticks: { color: '#94a3b8' }, grid: { display: false } },
      }
    }
  });
}

// ─── Manufacturers ─────────────────────────────────────────────────────────
async function loadManufacturers(sb, since30) {
  const { data, error } = await fetchOsScopedRows(() => sb
    .from('device_daily_active')
    .select('device_id_anon, manufacturer')
    .gte('event_date', since30)
    .not('manufacturer', 'is', null));

  if (error || !data?.length) {
    const canvas = document.getElementById('chart-manufacturers');
    if (canvas) canvas.parentElement.insertAdjacentHTML('beforeend',
      '<div style="color:#475569;font-size:0.8rem;margin-top:8px">יצבר מ-build הבא</div>');
    return;
  }

  const deviceMfr = {};
  data.forEach(r => { deviceMfr[r.device_id_anon] = r.manufacturer; });

  const counts = {};
  Object.values(deviceMfr).forEach(m => {
    const key = m || 'Other';
    counts[key] = (counts[key] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#64748b'];

  renderChart('chart-manufacturers', {
    type: 'doughnut',
    data: {
      labels: sorted.map(([m]) => m),
      datasets: [{ data: sorted.map(([, c]) => c), backgroundColor: palette, borderWidth: 0 }]
    },
    options: {
      plugins: { legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }
    }
  });
}

