// ─── Behavior — per-device co-occurrence + breadth ────────────────────────

// Human-readable Hebrew labels for ALL tracked feature events. Falls back to
// the raw dot-event name so future/unmapped events still render.
const FEATURE_LABELS = {
  // ── אפליקציה ────────────────────────────────────────────────────────────
  'app.opened': 'פתיחת האפליקציה',
  'screen.viewed': 'מעבר מסך (כללי)',
  'screen.locations_viewed': 'מסך מיקומים',
  'screen.routes_viewed': 'מסך מסלולים',
  'screen.settings_viewed': 'מסך הגדרות',
  'screen.upgrade_viewed': 'מסך שדרוג',
  'screen.donate_viewed': 'מסך תרומה',
  'screen.login_viewed': 'מסך התחברות',
  'screen.signup_viewed': 'מסך הרשמה',
  'screen.forgot_password_viewed': 'מסך שחזור סיסמה',
  'screen.customer_center_viewed': 'מסך מרכז לקוח',

  // ── מיקומים ─────────────────────────────────────────────────────────────
  'location.add_new_opened': 'פתיחת טופס מיקום חדש',
  'location.created': 'יצירת מיקום',
  'location.created_from_search_dropdown': 'יצירת מיקום מרשימת חיפוש',
  'location.updated': 'עריכת מיקום',
  'location.deleted': 'מחיקת מיקום',
  'location.edit_opened': 'פתיחת עריכת מיקום',
  'location.form_cancelled': 'ביטול טופס מיקום',
  'location.alert_time_set': 'הגדרת זמן התראה',
  'location.search_selected': 'בחירת כתובת בחיפוש',
  'location.search_abandoned': 'נטישת חיפוש כתובת',
  'location.alarm_toggled.on': 'הפעלת פעמון מיקום',

  // ── מסלולים ─────────────────────────────────────────────────────────────
  'route.add_new_opened': 'פתיחת טופס מסלול חדש',
  'route.created': 'יצירת מסלול',
  'route.updated': 'עריכת מסלול',
  'route.deleted': 'מחיקת מסלול',
  'route.reversed': 'היפוך מסלול',
  'route.reordered': 'שינוי סדר עצירות',
  'route.edit_opened': 'פתיחת עריכת מסלול',
  'route.form_cancelled': 'ביטול טופס מסלול',
  'route.advance_failed': 'התקדמות מסלול נכשלה',
  'route.advance_failed.advance_exception': 'שגיאה בהתקדמות מסלול',

  // ── התראות ──────────────────────────────────────────────────────────────
  'alarm.enabled': 'הפעלת התראה',
  'alarm.triggered': 'התראה צלצלה',
  'alarm.dismissed': 'כיבוי התראה',
  'alarm.dismissed_auto_hide': 'כיבוי אוטומטי (time-out)',
  'alarm.auto_cancelled': 'ביטול אוטומטי (עזיבה/חוסר תנועה)',
  'alarm.enabled_already_inside_radius': 'הפעלה כשכבר בתוך הרדיוס',
  'alarm.approaching_notification_sent': 'שליחת התראת "מתקרב"',
  'alarm.eta_fallback_scheduled': 'תזמון ETA חלופי',
  'alarm.eta_fallback_opened': 'פתיחת ETA חלופי',
  'alarm.address_edited_mid_tracking': 'עריכת כתובת בזמן מעקב',
  'alarm.timeout': 'ביטול אחרי timeout',
  'alarm.watchdog_restarted': 'Watchdog — איתחול',
  'alarm.watchdog_restart_failed': 'Watchdog — איתחול נכשל',
  'alarm.pending_clear_failed': 'ניקוי pending נכשל',
  'alarm.session_start_failed': 'התחלת session נכשלה',
  'alarm.session_end_failed': 'סיום session נכשל',

  // ── ניווט מהיר ──────────────────────────────────────────────────────────
  'quick_nav.started': 'ניווט מהיר — התחלה',
  'quick_nav.completed': 'ניווט מהיר — הושלם',
  'quick_nav.failed': 'ניווט מהיר — נכשל',

  // ── הגדרות ──────────────────────────────────────────────────────────────
  'settings.radius_changed': 'שינוי רדיוס ברירת מחדל',
  'settings.alarm_style_changed': 'שינוי סגנון צליל',
  'settings.alarm_volume_changed': 'שינוי עוצמת צליל',
  'settings.default_alert_time_changed': 'שינוי זמן התראה ברירת מחדל',
  'settings.custom_sound_picked': 'בחירת צליל מותאם',
  'settings.custom_sound_cleared': 'מחיקת צליל מותאם',
  'settings.data_cleared_all': 'מחיקת כל הנתונים',
  'settings.data_cleared_routes': 'מחיקת כל המסלולים',
  'settings.data_cleared_locations': 'מחיקת כל המיקומים',
  'settings.defaults_reset': 'איפוס הגדרות ברירת מחדל',
  'settings.nav_app_changed': 'שינוי אפליקציית ניווט',
  'settings.nav_app_cleared': 'ניקוי אפליקציית ניווט',
  'settings.dnd_guard_enabled': 'הפעלת הגנת נא-לא-להפריע',
  'settings.support_email_tapped': 'לחיצה על תמיכה במייל',
  'settings.theme_changed': 'שינוי ערכת נושא',
  'settings.language_changed': 'שינוי שפה',

  // ── GPS ─────────────────────────────────────────────────────────────────
  'gps.high_accuracy_timeout_or_error': 'GPS — timeout / שגיאה ב-High Accuracy',
  'gps.high_accuracy_escalation_failed': 'GPS — escalation נכשל',
  'gps.speed_null': 'GPS — מהירות null',
  'gps.update_gap_detected': 'GPS — פער עדכונים',

  // ── הרשאות ──────────────────────────────────────────────────────────────
  'permission.location.background.granted': 'הרשאת מיקום רקע — אושרה',
  'permission.location.background.denied': 'הרשאת מיקום רקע — נדחתה',
  'permission.location.foreground.granted': 'הרשאת מיקום פורגראונד — אושרה',
  'permission.notifications.granted': 'הרשאת התראות — אושרה',
  'permission.notifications.denied': 'הרשאת התראות — נדחתה',
  'permission.battery_optimization.shown': 'הצגת בקשת אופטימיזציה לסוללה',
  'permission.overlay.shown': 'הצגת בקשת הצגה מעל אפליקציות',

  // ── התראות מערכת (push notifications) ──────────────────────────────────
  'notification.stop_action_received': 'פעולת עצור — התקבלה',
  'notification.stop_action_failed': 'פעולת עצור — נכשלה',
  'push_token.registered.auth': 'Token push — נרשם (משתמש מחובר)',
  'push_token.registered.anon': 'Token push — נרשם (אנונימי)',
  'push_token.register.failed': 'Token push — רישום נכשל',
  'push_token.register.failed.anon_rpc': 'Token push — RPC אנונימי נכשל',
  'push_token.register.failed.auth_rpc': 'Token push — RPC מחובר נכשל',
  'push_token.register.skipped.no_rc_user_id': 'Token push — דולג (אין RC user)',
  'push_token.permission.skipped': 'הרשאת push — דולגה',

  // ── אונבורדינג ──────────────────────────────────────────────────────────
  'onboarding.accepted': 'אישור תנאי שימוש',
  'onboarding.legal_link_tapped': 'לחיצה על קישור משפטי',

  // ── אימות ────────────────────────────────────────────────────────────────
  'auth.sign_in.attempted': 'ניסיון התחברות',
  'auth.sign_in.success': 'התחברות הצליחה',
  'auth.sign_in.failed': 'התחברות נכשלה',
  'auth.sign_in.unexpected_error': 'שגיאה בלתי צפויה — כניסה',
  'auth.sign_up.attempted': 'ניסיון הרשמה',
  'auth.sign_up.success': 'הרשמה הצליחה',
  'auth.sign_up.failed': 'הרשמה נכשלה',
  'auth.sign_up.failed.password_mismatch': 'הרשמה — סיסמאות לא תואמות',
  'auth.sign_up.failed.password_too_short': 'הרשמה — סיסמה קצרה מדי',
  'auth.sign_up.unexpected_error': 'שגיאה בלתי צפויה — הרשמה',
  'auth.password_reset.attempted': 'ניסיון שחזור סיסמה',
  'auth.password_reset.success': 'שחזור סיסמה הצליח',
  'auth.password_reset.failed': 'שחזור סיסמה נכשל',
  'auth.password_reset.unexpected_error': 'שגיאה בלתי צפויה — שחזור סיסמה',
  'auth.routing.redirected.no_session': 'ניתוב — אין session, הועבר לכניסה',
  'auth.routing.redirected.signed_out': 'ניתוב — מנותק, הועבר לכניסה',
  'auth.routing.check.failed': 'בדיקת ניתוב — נכשלה',

  // ── רכישות ──────────────────────────────────────────────────────────────
  'purchase.attempted': 'ניסיון רכישה',
  'purchase.success': 'רכישה הושלמה',
  'purchase.cancelled': 'רכישה בוטלה',
  'purchase.failed': 'רכישה נכשלה',
  'purchase.restore_attempted': 'ניסיון שחזור רכישה',
  'purchase.restore_success': 'שחזור רכישה הצליח',
  'purchase.trial_eligibility_synced': 'זכאות ניסיון — סונכרנה',
  'purchase.trial_eligibility_sync_failed': 'זכאות ניסיון — סנכרון נכשל',
  'screen.upgrade.paywall_shown': 'Paywall — מוצג (שדרוג)',
  'screen.upgrade.paywall_shown_failed': 'Paywall — הצגה נכשלה (שדרוג)',
  'screen.upgrade.purchase_completed': 'שדרוג — רכישה הושלמה',
  'screen.upgrade.restore_completed': 'שדרוג — שחזור הושלם',
  'screen.upgrade.purchase_cancelled': 'שדרוג — רכישה בוטלה',
  'screen.upgrade.purchase_error': 'שדרוג — שגיאת רכישה',
  'screen.upgrade.restore_error': 'שדרוג — שגיאת שחזור',
  'screen.donate.paywall_shown': 'Paywall — מוצג (תרומה)',
  'screen.donate.purchase_completed': 'תרומה — רכישה הושלמה',
  'screen.donate.restore_completed': 'תרומה — שחזור הושלם',
  'screen.donate.purchase_cancelled': 'תרומה — רכישה בוטלה',
  'screen.donate.purchase_error': 'תרומה — שגיאת רכישה',

  // ── Trial ────────────────────────────────────────────────────────────────
  'trial.day5_reminder_sent': 'תזכורת יום 5 — נשלחה',
  'trial.day5_reminder_scheduled': 'תזכורת יום 5 — תוזמנה',
  'trial.day5_reminder_failed': 'תזכורת יום 5 — נכשלה',

  // ── דירוג ומשוב ──────────────────────────────────────────────────────────
  'rating.modal_shown': 'דיאלוג דירוג — הוצג',
  'rating.feedback_modal_shown': 'דיאלוג משוב — הוצג',
  'rating.positive_tapped': 'דירוג חיובי — לחיצה',
  'rating.negative_tapped': 'דירוג שלילי — לחיצה',
  'rating.store_review_requested': 'ביקורת בחנות — נשלחה בקשה',
  'rating.store_review_unavailable': 'ביקורת בחנות — לא זמינה',
  'rating.store_review_failed': 'ביקורת בחנות — נכשלה',
  'rating.feedback_submitted': 'משוב — נשלח',
  'rating.feedback_skipped': 'משוב — דולג',
  'rating.feedback_submit_failed': 'משוב — שליחה נכשלה',
  'rating.later_tapped': 'דירוג — "אחר כך"',
  'rating.modal_closed': 'דיאלוג דירוג — נסגר',

  // ── מתנה ─────────────────────────────────────────────────────────────────
  'gift.modal_shown': 'חלון מתנה — הוצג',
  'gift.modal_closed': 'חלון מתנה — נסגר',
  'gift.thanks_tapped': 'מתנה — לחיצה על "תודה"',

  // ── פרומו ─────────────────────────────────────────────────────────────────
  'promo.shown': 'פרומו — הוצג',
  'promo.cta_tapped': 'פרומו — לחיצה על CTA',
  'promo.dismissed': 'פרומו — נדחה',

  // ── מסכים (useScreenTracking — screen.<key>.viewed) ─────────────────────
  'screen.home.viewed': 'מסך בית',
  'screen.tabs_index.viewed': 'מסך בית (tabs)',
  'screen.tabs_routes.viewed': 'מסך מסלולים (tabs)',
  'screen.tabs_settings.viewed': 'מסך הגדרות (tabs)',
  'screen.auth_login.viewed': 'מסך התחברות',
  'screen.auth_signup.viewed': 'מסך הרשמה',
  'screen.auth_forgot_password.viewed': 'מסך שחזור סיסמה',
  'screen.customer_center.viewed': 'מסך מרכז לקוח',
  'screen.developer.viewed': 'מסך פיתוח',
  'screen.donate.viewed': 'מסך תרומה',
  'screen.upgrade.viewed': 'מסך שדרוג',
  'screen.screens_map.viewed': 'מסך מפה',
  'screen.not_found.viewed': 'מסך 404 (לא נמצא)',

  // ── הרשאות — priming ─────────────────────────────────────────────────────
  'permission.notifications.priming_shown': 'Priming — התראות הוצג',
  'permission.notifications.priming_dismissed': 'Priming — התראות נדחה',
  'permission.location.foreground.priming_shown': 'Priming — מיקום (foreground) הוצג',
  'permission.location.foreground.priming_dismissed': 'Priming — מיקום (foreground) נדחה',
  'permission.location.background.priming_shown': 'Priming — מיקום (background) הוצג',
  'permission.location.background.priming_dismissed': 'Priming — מיקום (background) נדחה',

  // ── כשלי הפעלה/כיבוי/מחיקת התראה ──────────────────────────────────────
  'alarm.enable_failed': 'הפעלת התראה נכשלה',
  'alarm.disable_failed': 'כיבוי התראה נכשל',
  'alarm.delete_failed': 'מחיקת התראה נכשלה',

  // ── שגיאות ───────────────────────────────────────────────────────────────
  'error.any': 'שגיאה (כלשהי)',
};
function featureLabel(ev) {
  if (FEATURE_LABELS[ev]) return FEATURE_LABELS[ev];
  // auto-translate unknown screen.*.viewed events
  if (/^screen\..+\.viewed$/.test(ev)) {
    const key = ev.replace(/^screen\./, '').replace(/\.viewed$/, '');
    return 'מסך ' + key.replace(/_/g, ' ');
  }
  return ev;
}

async function loadBehavior(sb, since30) {
  const { data, error } = await rpcDeviceFeatureEvents(sb, since30, null, 200000);
  const matrixEl = document.getElementById('behavior-cooccurrence');

  if (error) {
    if (matrixEl) matrixEl.innerHTML = `<div class="loading">שגיאה: ${error.message}</div>`;
    showEmptyState('chart-behavior-breadth', `שגיאה: ${error.message}`);
    showEmptyState('chart-feature-adoption', `שגיאה: ${error.message}`);
    const stickyErr = document.getElementById('feature-stickiness');
    if (stickyErr) stickyErr.innerHTML = `<div class="loading">שגיאה: ${error.message}</div>`;
    return;
  }
  if (!data?.length) {
    if (matrixEl) matrixEl.innerHTML = '<div class="loading">אין נתונים עדיין — יצטבר מהגרסה עם track_event ואילך</div>';
    showEmptyState('chart-behavior-breadth', 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
    showEmptyState('chart-feature-adoption', 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
    const stickyEmpty = document.getElementById('feature-stickiness');
    if (stickyEmpty) stickyEmpty.innerHTML = '<div class="loading">אין נתונים עדיין — יצטבר מהגרסה הקרובה</div>';
    return;
  }

  // device → Set(event_name) ; event → Set(device) (for ranking & co-occurrence)
  const deviceEvents = new Map();
  const eventDevices = new Map();
  // event → (device → total count) — for stickiness (avg uses & repeat rate)
  const eventDeviceCount = new Map();

  // Noise/system events excluded from the dependency matrix (not user-chosen features).
  const isNoiseEvent = (e) =>
    e.startsWith('gps.') || e.startsWith('error.') || e.startsWith('push_token.') ||
    e.startsWith('notification.') || e.startsWith('app.version') ||
    e.includes('.session_') || e.includes('_failed') || e.includes('watchdog') ||
    e.startsWith('trial.') || e.includes('priming');

  (data || []).forEach(r => {
    const dev = r.device_id_anon, ev = r.event_name;
    if (!dev || !ev) return;
    if (!deviceEvents.has(dev)) deviceEvents.set(dev, new Set());
    deviceEvents.get(dev).add(ev);
    if (!isNoiseEvent(ev)) {
      if (!eventDevices.has(ev)) eventDevices.set(ev, new Set());
      eventDevices.get(ev).add(dev);
      if (!eventDeviceCount.has(ev)) eventDeviceCount.set(ev, new Map());
      const dc = eventDeviceCount.get(ev);
      dc.set(dev, (dc.get(dev) || 0) + (r.count || 0));
    }
  });

  // ── Breadth distribution (distinct event types per device, ALL events) ──
  const breadthValues = [...deviceEvents.values()].map(s => s.size);
  const buckets = [
    { label: '1', min: 1, max: 1 },
    { label: '2–3', min: 2, max: 3 },
    { label: '4–6', min: 4, max: 6 },
    { label: '7–10', min: 7, max: 10 },
    { label: '11+', min: 11, max: Infinity },
  ];
  const bucketCounts = buckets.map(b => breadthValues.filter(n => n >= b.min && n <= b.max).length);
  const totalDevices = breadthValues.length;
  const medianBreadth = (() => {
    const s = [...breadthValues].sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
  })();
  const shallow = breadthValues.filter(n => n <= 1).length;
  const deep = breadthValues.filter(n => n >= 7).length;

  const bkpi = document.getElementById('behavior-breadth-kpis');
  if (bkpi) {
    bkpi.innerHTML = [
      { label: 'מכשירים', value: totalDevices, sub: 'עם פעולה אחת לפחות' },
      { label: 'חציון רוחב', value: medianBreadth, sub: 'סוגי פיצ\'רים למשתמש' },
      { label: 'אימוץ רדוד', value: pct(shallow, totalDevices), sub: 'פיצ\'ר אחד בלבד', color: '#ef4444' },
      { label: 'משתמשי-עומק', value: pct(deep, totalDevices), sub: '7+ פיצ\'רים', color: '#22c55e' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem${k.color ? ';color:' + k.color : ''}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  renderChart('chart-behavior-breadth', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        label: 'מכשירים', data: bucketCounts,
        backgroundColor: buckets.map((_, i) => i >= 3 ? '#22c55e' : i === 0 ? '#ef4444' : '#3b82f6'), borderRadius: 4,
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} מכשירים (${pct(ctx.parsed.y, totalDevices)})` } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1a1f30' }, title: { display: true, text: 'מספר פיצ\'רים ייחודיים', color: '#64748b', font: { size: 10 } } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
      }
    }
  });

  // ── Feature adoption (reach) — % of active devices that used each feature ──
  const adoptionRanked = [...eventDevices.entries()]
    .map(([ev, set]) => ({ ev, devices: set.size }))
    .sort((a, b) => b.devices - a.devices);
  const TOP_ADOPTION = 15;
  const adoptionTop = adoptionRanked.slice(0, TOP_ADOPTION);

  const akpi = document.getElementById('feature-adoption-kpis');
  if (akpi) {
    const trackedFeatures = adoptionRanked.length;
    const topFeature = adoptionTop[0];
    // Core feature = used by ≥40% of devices; ignored = <5%.
    const coreCount = adoptionRanked.filter(f => f.devices / totalDevices >= 0.40).length;
    const ignoredCount = adoptionRanked.filter(f => f.devices / totalDevices < 0.05).length;
    akpi.innerHTML = [
      { label: 'פיצ\'רים שנמדדו', value: trackedFeatures, sub: 'עם משתמש אחד לפחות' },
      { label: 'הפיצ\'ר המוביל', value: topFeature ? pct(topFeature.devices, totalDevices) : '—', sub: topFeature ? featureLabel(topFeature.ev) : '', color: '#22c55e' },
      { label: 'פיצ\'רי ליבה', value: coreCount, sub: '40%+ מהמשתמשים', color: '#3b82f6' },
      { label: 'פיצ\'רים מוזנחים', value: ignoredCount, sub: 'פחות מ-5% אימוץ', color: '#ef4444' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem${k.color ? ';color:' + k.color : ''}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  renderChart('chart-feature-adoption', {
    type: 'bar',
    data: {
      labels: adoptionTop.map(f => featureLabel(f.ev)),
      datasets: [{
        label: 'אחוז אימוץ',
        data: adoptionTop.map(f => Math.round((f.devices / totalDevices) * 1000) / 10),
        backgroundColor: adoptionTop.map(f => {
          const r = f.devices / totalDevices;
          return r >= 0.40 ? '#22c55e' : r >= 0.10 ? '#3b82f6' : '#ef4444';
        }),
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}% (${adoptionTop[ctx.dataIndex].devices}/${totalDevices} מכשירים)` } }
      },
      scales: {
        x: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true, max: 100 },
        y: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { display: false } },
      }
    }
  });

  // ── Feature stickiness — adopters, avg uses/user, repeat rate ──
  const stickyEl = document.getElementById('feature-stickiness');
  if (stickyEl) {
    const stickyRows = [...eventDeviceCount.entries()]
      .map(([ev, devMap]) => {
        const adopters = devMap.size;
        let totalUses = 0, repeaters = 0;
        devMap.forEach(c => { totalUses += c; if (c > 1) repeaters++; });
        return {
          ev,
          adopters,
          avgUses: adopters ? totalUses / adopters : 0,
          repeatRate: adopters ? repeaters / adopters : 0,
        };
      })
      .filter(r => r.adopters >= 3) // need ≥3 adopters for a meaningful rate
      .sort((a, b) => b.adopters - a.adopters)
      .slice(0, 15);

    if (stickyRows.length < 1) {
      stickyEl.innerHTML = '<div class="loading">אין מספיק נתונים עדיין (צריך פיצ\'ר עם 3+ משתמשים)</div>';
    } else {
      const repeatColor = (p) => p >= 0.5 ? '#22c55e' : p >= 0.25 ? '#f59e0b' : '#ef4444';
      let html = '<table style="border-collapse:collapse;font-size:0.8rem;width:100%;min-width:520px">';
      html += '<thead><tr>'
        + '<th style="text-align:right;padding:8px 10px;color:#94a3b8;border-bottom:1px solid #1a1f30">פיצ\'ר</th>'
        + '<th style="text-align:center;padding:8px 10px;color:#94a3b8;border-bottom:1px solid #1a1f30">משתמשים</th>'
        + '<th style="text-align:center;padding:8px 10px;color:#94a3b8;border-bottom:1px solid #1a1f30">ממוצע שימושים</th>'
        + '<th style="text-align:center;padding:8px 10px;color:#94a3b8;border-bottom:1px solid #1a1f30">% חוזרים</th>'
        + '</tr></thead><tbody>';
      stickyRows.forEach(r => {
        html += '<tr>'
          + `<td style="text-align:right;padding:7px 10px;color:#cbd5e1;white-space:nowrap" title="${r.ev}">${featureLabel(r.ev)}</td>`
          + `<td style="text-align:center;padding:7px 10px;color:#e2e8f0">${r.adopters}</td>`
          + `<td style="text-align:center;padding:7px 10px;color:#e2e8f0">${r.avgUses.toFixed(1)}</td>`
          + `<td style="text-align:center;padding:7px 10px;font-weight:600;color:${repeatColor(r.repeatRate)}">${Math.round(r.repeatRate * 100)}%</td>`
          + '</tr>';
      });
      html += '</tbody></table>';
      stickyEl.innerHTML = html;
    }
  }

  // ── שימוש חוזר ביעדים — ספריית יעדים שמורה מול חד-פעמי (Power feature / PMF) ──
  // נגזר כולו מספירות אירועים אנונימיות קיימות (feature_events) — בלי instrumentation
  // חדש ובלי נתוני מיקום. "ספרייה" = יצירת יעד מתוכנן או הפעלה חוזרת על יעד שמור;
  // "חד-פעמי" = יצירה+הפעלה מיידית מחיפוש או ניווט מהיר.
  const DEST_FLOWS = [
    { ev: 'location.alarm_toggled.on',            label: '🔁 הפעלה על יעד שמור',  kind: 'library', color: '#22c55e' },
    { ev: 'location.created',                     label: '💾 יצירת יעד מתוכנן',   kind: 'library', color: '#3b82f6' },
    { ev: 'location.created_from_search_dropdown', label: '⚡ יצירה+הפעלה מחיפוש', kind: 'adhoc',   color: '#f59e0b' },
    { ev: 'quick_nav.completed',                  label: '🚀 ניווט מהיר',          kind: 'adhoc',   color: '#a855f7' },
  ];
  const flowTotal = {};             // ev → סך מופעים
  const flowDevices = {};           // ev → Set(device)
  const libraryDevices = new Set(); // מכשירים שהשתמשו בנתיב הספרייה השמורה
  const adhocDevices = new Set();   // מכשירים שהשתמשו בנתיב החד-פעמי
  DEST_FLOWS.forEach(f => { flowTotal[f.ev] = 0; flowDevices[f.ev] = new Set(); });
  (data || []).forEach(r => {
    const f = DEST_FLOWS.find(x => x.ev === r.event_name);
    if (!f || !r.device_id_anon) return;
    flowTotal[f.ev] += (r.count || 0);
    flowDevices[f.ev].add(r.device_id_anon);
    (f.kind === 'library' ? libraryDevices : adhocDevices).add(r.device_id_anon);
  });

  const reuseCount   = flowTotal['location.alarm_toggled.on'];
  const createCount  = flowTotal['location.created'] + flowTotal['location.created_from_search_dropdown'];
  const totalActions = DEST_FLOWS.reduce((s, f) => s + flowTotal[f.ev], 0);
  const usersAny     = new Set([...libraryDevices, ...adhocDevices]).size;
  const adhocOnly    = [...adhocDevices].filter(d => !libraryDevices.has(d)).length;

  const reuseKpiEl = document.getElementById('destination-reuse-kpis');
  if (reuseKpiEl) {
    reuseKpiEl.innerHTML = [
      { label: 'סך פעולות יעד', value: totalActions, sub: '30 יום' },
      { label: 'יחס שימוש חוזר', value: createCount ? (reuseCount / createCount).toFixed(1) + '×' : '—', sub: 'הפעלות על שמור ÷ יצירות חדשות', color: '#22c55e' },
      { label: '% עם ספריית יעדים', value: usersAny ? pct(libraryDevices.size, usersAny) : '—', sub: 'יצרו או הפעילו יעד שמור', color: '#3b82f6' },
      { label: '% חד-פעמי בלבד', value: usersAny ? pct(adhocOnly, usersAny) : '—', sub: 'רק חיפוש/ניווט מהיר', color: '#f59e0b' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem${k.color ? ';color:' + k.color : ''}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  if (totalActions === 0) {
    showEmptyState('chart-destination-reuse', 'אין נתונים עדיין — יצטבר מהגרסה הקרובה');
  } else {
    renderChart('chart-destination-reuse', {
      type: 'bar',
      data: {
        labels: DEST_FLOWS.map(f => f.label),
        datasets: [{
          label: 'פעולות',
          data: DEST_FLOWS.map(f => flowTotal[f.ev]),
          backgroundColor: DEST_FLOWS.map(f => f.color),
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} פעולות · ${flowDevices[DEST_FLOWS[ctx.dataIndex].ev].size} מכשירים` } }
        },
        scales: {
          x: { ticks: { color: '#64748b', precision: 0 }, grid: { color: '#1a1f30' }, beginAtZero: true },
          y: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { display: false } },
        }
      }
    });
  }

  // ── Co-occurrence matrix — P(column | row), top events by device reach ──
  const TOP_N = 12;

  const MIN_SUPPORT = 3; // ignore events with < 3 devices (too sparse for a probability)
  const topEvents = [...eventDevices.entries()]
    .filter(([, set]) => set.size >= MIN_SUPPORT)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, TOP_N)
    .map(([ev]) => ev);

  if (!matrixEl) return;
  if (topEvents.length < 2) {
    matrixEl.innerHTML = '<div class="loading">אין מספיק פיצ\'רים עם נתונים עדיין למטריצה (צריך ≥2 פיצ\'רים עם 3+ מכשירים)</div>';
    return;
  }

  const shortLabel = (e) => { const l = featureLabel(e); return l.length > 22 ? l.slice(0, 21) + '…' : l; };
  const cellColor = (p) => p == null ? 'transparent' : `rgba(34,197,94,${(0.12 + p * 0.78).toFixed(2)})`;

  let html = '<table style="border-collapse:collapse;font-size:0.72rem;min-width:760px">';
  html += '<thead><tr><th style="position:sticky;right:0;background:#0f1422;padding:6px 8px;text-align:right;color:#94a3b8">שורה ↓ \\ עמודה →</th>';
  topEvents.forEach(ev => {
    html += `<th style="padding:6px 6px;color:#94a3b8;white-space:nowrap" title="${ev}">${shortLabel(ev)}</th>`;
  });
  html += '</tr></thead><tbody>';
  topEvents.forEach(rowEv => {
    const rowDevices = eventDevices.get(rowEv);
    const rowSupport = rowDevices.size;
    html += `<tr><th style="position:sticky;right:0;background:#0f1422;padding:6px 8px;text-align:right;color:#cbd5e1;white-space:nowrap" title="${rowEv} · ${rowSupport} מכשירים">${shortLabel(rowEv)} <span style="color:#475569">(${rowSupport})</span></th>`;
    topEvents.forEach(colEv => {
      if (colEv === rowEv) {
        html += '<td style="padding:6px 8px;text-align:center;color:#334155;background:#0b0f1a">—</td>';
        return;
      }
      const colDevices = eventDevices.get(colEv);
      let both = 0;
      const [small, big] = rowDevices.size <= colDevices.size ? [rowDevices, colDevices] : [colDevices, rowDevices];
      small.forEach(d => { if (big.has(d)) both++; });
      const p = rowSupport ? both / rowSupport : null;
      const pctTxt = p == null ? '—' : Math.round(p * 100) + '%';
      html += `<td style="padding:6px 8px;text-align:center;color:#e2e8f0;background:${cellColor(p)}" title="${both}/${rowSupport} מכשירים שהפעילו ${rowEv} הפעילו גם ${colEv}">${pctTxt}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  matrixEl.innerHTML = html;
}

// ─── Store Metrics (Google Play / App Store) ───────────────────────────────
async function loadStoreMetrics(sb, since30) {
  const empEl = document.getElementById('stores-empty');
  const kpiEl = document.getElementById('stores-kpis');
  const RATE_CANVASES = ['chart-store-crash', 'chart-store-anr', 'chart-store-wakeup', 'chart-store-wakelock'];
  const ALL_CANVASES = [...RATE_CANVASES, 'chart-store-installs', 'chart-store-rating'];

  const { data, error } = await rpcStoreMetrics(sb, since30, 'google_play', 100000);

  if (error) {
    if (empEl) { empEl.style.display = ''; empEl.textContent = '⚠️ שגיאה בקריאת store_metrics: ' + error.message + ' — ודא שה-migration 20260626000000_create_store_metrics.sql הורץ.'; }
    if (kpiEl) kpiEl.innerHTML = '<div style="color:#ef4444;font-size:0.82rem">שגיאה בטעינה</div>';
    ALL_CANVASES.forEach(id => showEmptyState(id, 'שגיאה בטעינה'));
    return;
  }

  const rows = data || [];
  if (rows.length === 0) {
    if (empEl) { empEl.style.display = ''; empEl.textContent = 'אין נתונים עדיין. הגדר חשבון שירות של Google Play והרץ: node scripts/loadStoreMetrics.js (ראה כותרת הסקריפט להוראות).'; }
    if (kpiEl) kpiEl.innerHTML = '<div style="color:#475569;font-size:0.82rem">אין נתונים — הרץ את scripts/loadStoreMetrics.js</div>';
    ALL_CANVASES.forEach(id => showEmptyState(id, 'אין נתונים עדיין — הרץ את scripts/loadStoreMetrics.js'));
    return;
  }
  if (empEl) empEl.style.display = 'none';

  // ── אגרגציה: metric → (date → value) ──
  // מדדי rate/rating ממוצעים; מדדי count מסוכמים (לרוב שורה אחת ליום).
  const SUM_METRICS = new Set(['installs', 'uninstalls', 'review_count']);
  const byMetric = {};
  rows.forEach(r => {
    const m = r.metric;
    if (!byMetric[m]) byMetric[m] = {};
    const d = r.metric_date;
    if (!byMetric[m][d]) byMetric[m][d] = { sum: 0, n: 0 };
    byMetric[m][d].sum += Number(r.value) || 0;
    byMetric[m][d].n += 1;
  });
  const seriesOf = (metric) => {
    const obj = byMetric[metric];
    if (!obj) return { labels: [], values: [] };
    const dates = Object.keys(obj).sort();
    const isSum = SUM_METRICS.has(metric);
    return {
      labels: dates,
      values: dates.map(d => isSum ? obj[d].sum : obj[d].sum / obj[d].n),
    };
  };
  const latestOf = (metric) => {
    const s = seriesOf(metric);
    return s.values.length ? s.values[s.values.length - 1] : null;
  };
  const totalOf = (metric) => {
    const s = seriesOf(metric);
    return s.values.reduce((a, b) => a + b, 0);
  };
  const fmtDate = (d) => d.slice(5); // MM-DD

  // ── KPIs ──
  if (kpiEl) {
    const crash = latestOf('crash_rate');
    const anr = latestOf('anr_rate');
    const rating = latestOf('rating_total_avg') ?? latestOf('rating_avg') ?? latestOf('review_avg');
    const installs = totalOf('installs');
    const uninstalls = totalOf('uninstalls');
    const net = installs - uninstalls;
    const kpis = [
      crash !== null ? { label: '💥 Crash rate (אחרון)', value: (crash * 100).toFixed(2) + '%', color: crash <= 0.01 ? '#10b981' : crash <= 0.02 ? '#f59e0b' : '#ef4444' } : null,
      anr !== null ? { label: '🧊 ANR rate (אחרון)', value: (anr * 100).toFixed(2) + '%', color: anr <= 0.005 ? '#10b981' : anr <= 0.01 ? '#f59e0b' : '#ef4444' } : null,
      rating !== null ? { label: '⭐ דירוג', value: rating.toFixed(2), color: rating >= 4 ? '#10b981' : rating >= 3 ? '#f59e0b' : '#ef4444' } : null,
      installs > 0 || uninstalls > 0 ? { label: '📥 התקנות בטווח', value: Math.round(installs).toLocaleString('he-IL'), sub: `נטו ${net >= 0 ? '+' : ''}${Math.round(net).toLocaleString('he-IL')}`, color: '#3b82f6' } : null,
    ].filter(Boolean);
    kpiEl.innerHTML = kpis.length
      ? kpis.map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}</div>`).join('')
      : '<div style="color:#475569;font-size:0.82rem">אין מדדים זמינים עדיין</div>';
  }

  // ── גרפי rate (אחוז) ──
  const rateChart = (canvasId, metric, label, color) => {
    const s = seriesOf(metric);
    if (!s.values.length) { showEmptyState(canvasId, 'אין נתונים למדד זה'); return; }
    renderChart(canvasId, {
      type: 'line',
      data: {
        labels: s.labels.map(fmtDate),
        datasets: [{
          label,
          data: s.values.map(v => v * 100),
          borderColor: color,
          backgroundColor: color + '22',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(3)}%` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#1a1f30' } },
          y: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        }
      }
    });
  };
  rateChart('chart-store-crash', 'crash_rate', '% קריסות', '#ef4444');
  rateChart('chart-store-anr', 'anr_rate', '% ANR', '#f59e0b');
  rateChart('chart-store-wakeup', 'excessive_wakeup_rate', '% יקיצות עודפות', '#8b5cf6');
  rateChart('chart-store-wakelock', 'stuck_wakelock_rate', '% wakelocks תקועים', '#06b6d4');

  // ── התקנות מול הסרות ──
  (() => {
    const ins = seriesOf('installs');
    const uns = seriesOf('uninstalls');
    const allDates = Array.from(new Set([...ins.labels, ...uns.labels])).sort();
    if (!allDates.length) { showEmptyState('chart-store-installs', 'אין נתוני התקנות — דורש GOOGLE_PLAY_REPORTS_BUCKET'); return; }
    const insMap = Object.fromEntries(ins.labels.map((d, i) => [d, ins.values[i]]));
    const unsMap = Object.fromEntries(uns.labels.map((d, i) => [d, uns.values[i]]));
    renderChart('chart-store-installs', {
      type: 'bar',
      data: {
        labels: allDates.map(fmtDate),
        datasets: [
          { label: 'התקנות', data: allDates.map(d => insMap[d] ?? 0), backgroundColor: '#10b981', borderRadius: 3 },
          { label: 'הסרות', data: allDates.map(d => -(unsMap[d] ?? 0)), backgroundColor: '#ef4444', borderRadius: 3 },
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Math.abs(ctx.parsed.y)}` } }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#1a1f30' } },
          y: { stacked: true, position: 'right', ticks: { color: '#64748b', callback: v => Math.abs(v) }, grid: { color: '#1a1f30' } },
        }
      }
    });
  })();

  // ── דירוג ממוצע ──
  (() => {
    const daily = seriesOf('rating_avg');
    const total = seriesOf('rating_total_avg');
    const reviews = seriesOf('review_avg');
    const allDates = Array.from(new Set([...daily.labels, ...total.labels, ...reviews.labels])).sort();
    if (!allDates.length) { showEmptyState('chart-store-rating', 'אין נתוני דירוג עדיין'); return; }
    const mapOf = (s) => Object.fromEntries(s.labels.map((d, i) => [d, s.values[i]]));
    const dMap = mapOf(daily), tMap = mapOf(total), rMap = mapOf(reviews);
    const datasets = [];
    if (total.labels.length) datasets.push({ label: 'דירוג מצטבר', data: allDates.map(d => tMap[d] ?? null), borderColor: '#f59e0b', backgroundColor: '#f59e0b22', tension: 0.25, pointRadius: 2, spanGaps: true });
    if (daily.labels.length) datasets.push({ label: 'דירוג יומי', data: allDates.map(d => dMap[d] ?? null), borderColor: '#3b82f6', backgroundColor: '#3b82f622', tension: 0.25, pointRadius: 2, spanGaps: true });
    if (reviews.labels.length) datasets.push({ label: 'דירוג ביקורות', data: allDates.map(d => rMap[d] ?? null), borderColor: '#a855f7', backgroundColor: '#a855f722', tension: 0.25, pointRadius: 2, spanGaps: true });
    renderChart('chart-store-rating', {
      type: 'line',
      data: { labels: allDates.map(fmtDate), datasets },
      options: {
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ctx.parsed.y.toFixed(2)}` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#1a1f30' } },
          y: { position: 'right', min: 0, max: 5, ticks: { color: '#64748b' }, grid: { color: '#1a1f30' } },
        }
      }
    });
  })();
}

// ─── Watchdog Restarts ────────────────────────────────────────────────────
async function loadWatchdog(sb, since30) {
  const [wdRes, wdFailRes, dauRes, enabledRes] = await Promise.all([
    sb.from('feature_events').select('event_date, count').eq('event_name', 'alarm.watchdog_restarted').gte('event_date', since30),
    sb.from('feature_events').select('event_date, count').eq('event_name', 'alarm.watchdog_restart_failed').gte('event_date', since30),
    fetchAllRows(() => sb.from('device_daily_active').select('device_id_anon, event_date').gte('event_date', since30)),
    sb.from('feature_events').select('event_date, count').eq('event_name', 'alarm.enabled').gte('event_date', since30),
  ]);

  if (wdRes.error || dauRes.error || enabledRes.error) {
    showEmptyState('chart-watchdog', wdRes.error ? `שגיאה: ${wdRes.error.message}` : dauRes.error ? `שגיאה: ${dauRes.error.message}` : `שגיאה: ${enabledRes.error.message}`);
    return;
  }

  const dauByDay = {};
  (dauRes.data || []).forEach(r => {
    if (!dauByDay[r.event_date]) dauByDay[r.event_date] = new Set();
    dauByDay[r.event_date].add(r.device_id_anon);
  });

  const wdByDay = {};
  (wdRes.data || []).forEach(r => { wdByDay[r.event_date] = (wdByDay[r.event_date] || 0) + r.count; });

  const wdFailByDay = {};
  (wdFailRes.data || []).forEach(r => { wdFailByDay[r.event_date] = (wdFailByDay[r.event_date] || 0) + r.count; });

  const enabledByDay = {};
  (enabledRes.data || []).forEach(r => { enabledByDay[r.event_date] = (enabledByDay[r.event_date] || 0) + r.count; });

  const labelsSet = new Set([...Object.keys(dauByDay), ...Object.keys(enabledByDay), ...Object.keys(wdByDay), ...Object.keys(wdFailByDay)]);
  const labels    = Array.from(labelsSet).sort();
  const wdCounts  = labels.map(d => wdByDay[d] || 0);
  const wdFails   = labels.map(d => wdFailByDay[d] || 0);
  const enabledCounts = labels.map(d => enabledByDay[d] || 0);
  const wdPer100  = labels.map((d, i) => enabledCounts[i] > 0 ? Math.round((wdCounts[i] / enabledCounts[i]) * 1000) / 10 : null);
  const failPer100 = labels.map((d, i) => enabledCounts[i] > 0 ? Math.round((wdFails[i] / enabledCounts[i]) * 1000) / 10 : null);

  const wdTotal = wdCounts.reduce((s, v) => s + v, 0);
  const wdFailTotal = wdFails.reduce((s, v) => s + v, 0);
  const enabledTotal = enabledCounts.reduce((s, v) => s + v, 0);
  const wdAvgPer100 = enabledTotal > 0 ? Math.round((wdTotal / enabledTotal) * 1000) / 10 : 0;
  const failAvgPer100 = enabledTotal > 0 ? Math.round((wdFailTotal / enabledTotal) * 1000) / 10 : 0;
  const peakIdx = wdPer100.reduce((best, val, i) => (val != null && (best < 0 || val > (wdPer100[best] ?? -1)) ? i : best), -1);

  const wdKpiEl = document.getElementById('watchdog-kpis');
  if (wdKpiEl) {
    wdKpiEl.innerHTML = [
      { label: '🔁 איתחולים (סה"כ)', value: wdTotal.toLocaleString(), sub: `${enabledTotal.toLocaleString()} הפעלות`, color: '#f59e0b' },
      { label: '📉 watchdog לכל 100', value: `${wdAvgPer100}`, sub: 'ממוצע 30 יום', color: wdAvgPer100 >= 12 ? '#ef4444' : wdAvgPer100 >= 6 ? '#f59e0b' : '#10b981' },
      { label: '❌ כשלי איתחול לכל 100', value: `${failAvgPer100}`, sub: `${wdFailTotal.toLocaleString()} כשלים`, color: failAvgPer100 >= 3 ? '#ef4444' : failAvgPer100 >= 1 ? '#f59e0b' : '#10b981' },
      { label: '📌 יום שיא watchdog/100', value: peakIdx >= 0 ? `${wdPer100[peakIdx]}` : '—', sub: peakIdx >= 0 ? labels[peakIdx] : 'אין נתון', color: '#94a3b8' },
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value" style="font-size:1.4rem;color:${k.color}">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');
  }

  renderChart('chart-watchdog', {
    type: 'bar',
    data: {
      labels: labels.map(d => d.slice(5)),
      datasets: [
        { label: 'איתחולי watchdog', data: wdCounts, backgroundColor: '#f59e0b', borderRadius: 4 },
        { label: 'כישלון איתחול', data: wdFails, backgroundColor: '#ef4444', borderRadius: 4 },
        { label: 'watchdog לכל 100 הפעלות', data: wdPer100, type: 'line', borderColor: '#38bdf8', backgroundColor: 'transparent', borderWidth: 1.8, pointRadius: 0, tension: 0.25, yAxisID: 'y2' },
        { label: 'כשלי איתחול לכל 100', data: failPer100, type: 'line', borderColor: '#f87171', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4], tension: 0.25, yAxisID: 'y2' },
      ]
    },
    options: {
      plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { reverse: true, ticks: { color: '#64748b', maxTicksLimit: 15 }, grid: { color: '#1a1f30' } },
        y: { position: 'right', ticks: { color: '#64748b' }, grid: { color: '#1a1f30' }, beginAtZero: true },
        y2: {
          position: 'left',
          ticks: { color: '#38bdf8', callback: v => v + '' },
          grid: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'לכל 100 הפעלות', color: '#38bdf8', font: { size: 10 } },
        },
      }
    }
  });
}

