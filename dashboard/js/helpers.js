// ─── Helpers ───────────────────────────────────────────────────────────────
function pct(a, b) {
  if (!b || b === 0) return '—';
  return Math.round((a / b) * 100) + '%';
}

// Single source of truth for "success": the alarm rang automatically in real-time.
// Counts as success: background (GPS proximity loop), geofence (native OS safety-net),
// native_sampling, and foreground_check. foreground_check is a REAL-TIME success: the background
// pipeline detected arrival, saved a pending alarm and fired a fullScreenIntent that opened the
// app; checkPendingAlarm then closed the session. Because savePendingAlarm runs ONLY inside
// scheduleLocationAlarm (the background ring path), a foreground_check session PROVES the
// background rang in real-time — it was mislabeled as "late" only because the FSI-opened app won
// the attribution race (fixed at source in useLocationMonitor + end_alarm_session, 13.7.2026).
// Still LATE (real-time path failed): notification_open (user tapped a notification) and
// eta_fallback (timed safety-net fired because GPS/geofence never triggered).
// Use this everywhere "% הצלחה" is reported so all figures agree with the headline KPI.
function isRealtimeTriggered(r) {
  if (!r || r.outcome !== 'triggered') return false;
  const ts = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
  return ts !== 'notification_open' && ts !== 'eta_fallback';
}

// Single source of truth for success-rate filtering.
// The dashboard must distinguish three buckets instead of treating them as one problem:
//   • Neutral noise: immediate cancel / already-inside / test behavior -> excluded from both
//     numerator and denominator.
//   • Soft success: user cancelled after a real trip started but was still far from the target,
//     so the system did not fail; it should not count as a failure.
//   • Hard failure: app_killed with movement evidence, timeout, or manual cancel very close to
//     the destination -> real defects that must affect the KPI.
const NEUTRAL_CANCEL_MAX_MIN = 2;
const SOFT_SUCCESS_MIN_MIN = 2;
function sessionDurationMinutes(r) {
  if (!r || !r.started_at || !r.ended_at) return null;
  const mins = (new Date(r.ended_at) - new Date(r.started_at)) / 60000;
  return Number.isFinite(mins) ? mins : null;
}
function isNearArrivalCancel(r) {
  if (!r || r.outcome !== 'user_cancelled') return false;
  const dist = Number(r.props?.distance_km);
  const radius = Number(r.props?.radius_km);
  if (!Number.isFinite(dist) || !Number.isFinite(radius) || radius <= 0) return false;
  return dist <= radius * 2;
}
function hasMovementEvidence(r) {
  if (!r) return false;
  const dist = Number(r.props?.distance_km ?? r.props?.last_distance_km ?? r.props?.final_distance_km);
  if (Number.isFinite(dist) && dist > 0.1) return true;
  const sec = Number(r.props?.trip_elapsed_sec ?? r.props?.duration_sec ?? r.props?.minutes_away);
  if (Number.isFinite(sec) && sec >= 60) return true;

  const mins = sessionDurationMinutes(r);
  if (r.outcome === 'app_killed') {
    // Stale/abandoned app_killed sessions can sit open for 12h+ with no real motion.
    // Duration alone must not convert those into a technical-kill signal.
    if (mins != null && mins >= 12 * 60) return false;
    return mins != null && mins >= 10;
  }

  return mins != null && mins >= 2;
}
function isNeutralNoiseSession(r) {
  if (!r) return true;
  const reason = typeof r.props?.reason === 'string' ? r.props.reason.trim() : '';
  if (reason === 'already_inside_radius') return true;
  if (r.outcome === 'user_cancelled' && r.started_at && r.ended_at) {
    const mins = sessionDurationMinutes(r);
    if (Number.isFinite(mins) && mins < NEUTRAL_CANCEL_MAX_MIN) return true;
  }
  return false;
}
function isSoftSuccessSession(r) {
  if (!r || r.outcome !== 'user_cancelled') return false;
  if (isNeutralNoiseSession(r)) return false;
  const mins = sessionDurationMinutes(r);
  if (!Number.isFinite(mins) || mins < SOFT_SUCCESS_MIN_MIN) return false;
  if (isNearArrivalCancel(r)) return false;
  return true;
}
function isHardFailureSession(r) {
  if (!r) return false;
  if (r.outcome === 'timeout') return true;
  if (r.outcome === 'app_killed') return hasMovementEvidence(r);
  if (r.outcome === 'user_cancelled') return isNearArrivalCancel(r);
  return false;
}
function isLateTriggered(r) {
  if (!r || r.outcome !== 'triggered') return false;
  const ts = typeof r.props?.trigger_source === 'string' ? r.props.trigger_source.trim() : '';
  return ts === 'notification_open' || ts === 'eta_fallback';
}
function isTrueSuccessSession(r) {
  if (!r) return false;
  if (isSoftSuccessSession(r)) return true;
  if (isRealtimeTriggered(r) || isLateTriggered(r)) return true;
  return false;
}
// True when the session is a genuine navigation attempt — use to filter success-rate denominators.
function isRealTripSession(r) {
  return !!r && !isNeutralNoiseSession(r);
}

// Single source of truth for "silent miss" outcomes — the alarm never rang in real-time.
const RELIABILITY_SILENT_OUTCOMES = new Set(['app_killed', 'stale_tracking', 'open_stale']);

// A "silent" outcome whose lifetime exceeds any real trip is an ABANDONED session, NOT a miss:
// the user enabled the alarm and never travelled, so it was auto-closed as app_killed/open_stale
// by the 24h server stale-cron (or 48h client cleanup, see PROJECT_STATUS 17.7.2026). These have
// no distance/trigger data and would otherwise inflate the red "silent miss" band. The threshold
// sits above the 10h in-app trip timeout, so a genuinely tracked trip can never be mistaken for it.
const ABANDONED_STALE_MIN_HOURS = 12;
function sessionDurationHours(r) {
  if (!r || !r.started_at) return null;
  const end = r.ended_at ? new Date(r.ended_at) : new Date();
  const h = (end - new Date(r.started_at)) / 3600000;
  return Number.isFinite(h) ? h : null;
}
function isAbandonedStaleSession(r) {
  if (!r || !RELIABILITY_SILENT_OUTCOMES.has(r.outcome)) return false;
  const h = sessionDurationHours(r);
  return h != null && h >= ABANDONED_STALE_MIN_HOURS;
}

// Dashboard-only split for app_killed: one is a genuine technical failure during motion,
// the other is an abandoned/stale session that never travelled and was closed later by cron.
function classifyAppKilledSession(r) {
  if (!r || r.outcome !== 'app_killed') return null;
  if (isAbandonedStaleSession(r)) return 'abandoned_session';
  if (hasMovementEvidence(r)) return 'technical_kill';
  return 'abandoned_session';
}

// Derives device platform from the fields stored on device_daily_active.
// iOS devices report manufacturer 'Apple' (expo-device); android_version is populated only on
// Android (Platform.OS === 'android'). Any other non-empty manufacturer is treated as Android.
function devicePlatform(manufacturer, androidVersion) {
  const mfr = (manufacturer || '').toString().trim().toLowerCase();
  if (mfr === 'apple') return 'apple';
  if (androidVersion != null && String(androidVersion).trim() !== '') return 'android';
  if (mfr && mfr !== 'unknown') return 'android';
  return 'unknown';
}

// Filter data rows by OS if FILTERED_DEVICE_IDS is active
function applyOSFilter(rows) {
  if (!FILTERED_DEVICE_IDS || ACTIVE_OS_FILTER === 'all') return rows;
  return rows.filter(r => FILTERED_DEVICE_IDS.has(r.device_id_anon));
}

// True when any scope filter that requires per-device data is active.
// feature_events (aggregated, no device_id_anon) can't honour these — callers must rebuild
// from device_feature_events instead (see fetchScopedFeatureRows).
function isPerDeviceScopeActive() {
  return ACTIVE_OS_FILTER !== 'all' || ACTIVE_VERSION_FILTER !== 'all' || ACTIVE_COUNTRY_FILTER !== 'all';
}

// Like fetchAllRows but also applies the active OS filter (device_id_anon set) to the result.
// Use for any direct device_daily_active read that counts/aggregates devices, so the OS scope
// (which can't be expressed as a PostgREST filter) is honoured client-side.
async function fetchOsScopedRows(buildQuery) {
  const res = await fetchAllRows(buildQuery);
  if (res.data && FILTERED_DEVICE_IDS) res.data = applyOSFilter(res.data);
  return res;
}

// Rebuilds feature_events-shaped rows ({event_name, event_date, count}) from device_feature_events
// so they honour the active OS/version/country scope (the RPC filters version/country server-side,
// rpcDeviceFeatureEvents applies OS client-side). Returns null when no scope filter is active —
// callers should then use the full feature_events aggregate (which has complete history).
async function fetchScopedFeatureRows(sb, sinceDate) {
  if (!isPerDeviceScopeActive()) return null;
  const { data, error } = await rpcDeviceFeatureEvents(sb, sinceDate, null, 200000);
  if (error || !data) return null;
  const agg = new Map();  // "event_name|event_date" -> summed count
  data.forEach(r => {
    if (!r.event_name) return;
    const key = r.event_name + '|' + (r.event_date || '');
    agg.set(key, (agg.get(key) || 0) + (r.count || 0));
  });
  const rows = [];
  agg.forEach((count, key) => {
    const i = key.lastIndexOf('|');
    rows.push({ event_name: key.slice(0, i), event_date: key.slice(i + 1), count });
  });
  return rows;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getDashboardScopeParams() {
  return {
    appVersion: ACTIVE_VERSION_FILTER === 'all' ? null : ACTIVE_VERSION_FILTER,
    countryCode: ACTIVE_COUNTRY_FILTER === 'all' ? null : ACTIVE_COUNTRY_FILTER,
    osPlatform: ACTIVE_OS_FILTER === 'all' ? null : ACTIVE_OS_FILTER,
  };
}

async function rpcAlarmSessions(sb, sinceIso, limit = 100000) {
  const { appVersion, countryCode } = getDashboardScopeParams();
  const result = await sb.rpc('dashboard_alarm_sessions_read', {
    p_since: sinceIso,
    p_limit: limit,
    p_app_version: appVersion,
    p_country_code: countryCode,
  });
  
  // Apply client-side OS filtering
  if (result.data && FILTERED_DEVICE_IDS) {
    result.data = applyOSFilter(result.data);
  }
  
  return result;
}

async function rpcLocationGrid(sb, sinceDate, limit = 5000) {
  return sb.rpc('dashboard_location_grid_read', {
    p_since_date: sinceDate,
    p_limit: limit,
  });
}

async function rpcDeviceFeatureEvents(sb, sinceDate, eventName = null, limit = 200000) {
  const { appVersion, countryCode } = getDashboardScopeParams();
  const result = await sb.rpc('dashboard_device_feature_events_read', {
    p_since_date: sinceDate,
    p_limit: limit,
    p_event_name: eventName,
    p_app_version: appVersion,
    p_country_code: countryCode,
  });
  
  // Apply client-side OS filtering
  if (result.data && FILTERED_DEVICE_IDS) {
    result.data = applyOSFilter(result.data);
  }
  
  return result;
}

async function rpcRevenueEvents(sb, sinceIso, environment = null, limit = 10000) {
  return sb.rpc('dashboard_revenue_events_read', {
    p_since: sinceIso,
    p_limit: limit,
    p_environment: environment,
  });
}

// store_metrics — נתוני חנות (Google Play / App Store). גלובלי — לא מסונן לפי גרסה/מדינה.
async function rpcStoreMetrics(sb, sinceDate, source = null, limit = 100000) {
  return sb.rpc('dashboard_store_metrics_read', {
    p_since_date: sinceDate,
    p_source: source,
    p_limit: limit,
  });
}

// PostgREST מגביל כל בקשת SELECT ל-1000 שורות בצד השרת, ולכן `.limit(100000)` מתעלם
// בשקט — חוזרות רק 1000 השורות הראשונות (הישנות ביותר כשהמיון עולה), והשורות העדכניות
// (כולל פעילי היום!) נושרות לגמרי. הפונקציה מדפדפת עם .range() ומחזירה את כל הסט.
// buildQuery חייבת להחזיר query חדש בכל קריאה (PostgREST builder אינו ניתן לשימוש חוזר).
async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// ─── תאריך התחלת מדידה — מציג נתונים מ-25.5.2026 והלאה בלבד ──────────────────
const DATA_START_DATE = '2026-05-25';

// ─── תאריך שממנו סיווג trigger_source (real-time מול late) אמין ──────────────
// trigger_source נכנס לקוד ~29.5.2026 והתייצב ב-4.6; אומץ בהמוניות עם 1.2.0 (16.6).
// לפני תאריך זה חלק מה-triggered חסרי מקור ונספרים כ-real-time (best-effort) —
// מה שמנפח מעט את "% הצלחה real-time". השוואות מגמה אמינות מהתאריך הזה והלאה.
const TRIGGER_SOURCE_RELIABLE_DATE = '2026-06-16';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── RTL לצירי תאריך/זמן ─────────────────────────────────────────────────────
// הדשבורד עברי ונקרא מימין לשמאל, ולכן כל ציר X שהוא ציר תאריך/זמן חייב לזרום
// מימין (ישן) לשמאל (חדש). מזהים תוויות תאריך/זמן אוטומטית והופכים את הציר, כך
// שכל גרף קו-זמן — קיים ועתידי — יהיה RTL בלי חיווט פר-גרף.
const DATE_TIME_LABEL_RE = /^(\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?|\d{1,2}:\d{2})$/;
function looksLikeDateTimeAxis(labels) {
  if (!Array.isArray(labels) || labels.length < 2) return false;
  for (const l of labels) {
    if (typeof l !== 'string' || !DATE_TIME_LABEL_RE.test(l.trim())) return false;
  }
  return true;
}
function applyRtlTimeAxis(config) {
  if (!config || !config.data) return;
  const opts = config.options || (config.options = {});
  if (opts.indexAxis === 'y') return; // עמודות אופקיות: הקטגוריה על ציר Y, לא קו-זמן
  if (!looksLikeDateTimeAxis(config.data.labels)) return;
  const scales = opts.scales || (opts.scales = {});
  const x = scales.x || (scales.x = {});
  if (x.reverse === undefined) x.reverse = true; // לא דורסים reverse שהוגדר במפורש
}

// ─── ממוצע נע (Simple Moving Average) ────────────────────────────────────────
// מחליק את רעש העונתיות היומי (סופ"ש מול אמצע שבוע) כדי לחשוף את המגמה האמיתית.
// trailing — כל נקודה היא ממוצע ה-`window` ימים שעד אליה (כולל). מחזיר מערך באותו
// אורך כמו הקלט, כך שהוא מתיישר 1:1 עם תוויות הגרף (גם כשציר X הפוך ל-RTL).
function sma(values, window = 7) {
  if (!Array.isArray(values)) return [];
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    if (!slice.length) return 0;
    return +(slice.reduce((s, v) => s + (Number(v) || 0), 0) / slice.length).toFixed(1);
  });
}

const CHARTS = {};
function renderChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  // הסרת הודעת ריקנות אם קיימת
  const prev = document.getElementById(id + '-empty');
  if (prev) prev.remove();
  canvas.style.display = '';
  applyRtlTimeAxis(config);
  if (CHARTS[id]) CHARTS[id].destroy();
  CHARTS[id] = new Chart(canvas, config);
}

function showEmptyState(canvasId, message = 'אין נתונים עדיין') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (CHARTS[canvasId]) { CHARTS[canvasId].destroy(); delete CHARTS[canvasId]; }
  canvas.style.display = 'none';
  let msgEl = document.getElementById(canvasId + '-empty');
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.id = canvasId + '-empty';
    msgEl.style.cssText = 'color:#475569;font-size:0.82rem;padding:24px 0;text-align:center;border:1px dashed #2d3250;border-radius:8px;margin-top:4px';
    canvas.parentNode.insertBefore(msgEl, canvas.nextSibling);
  }
  msgEl.textContent = message;
}

// ─── Tab Navigation ────────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + tab);
      });
      // Fix Leaflet map rendering when tab becomes visible
      if (tab === 'users') {
        Object.values(MAPS).forEach(m => m.invalidateSize());
        // Re-fit bounds on first open (map was initialized hidden → view was wrong)
        if (!_mapsInitialized) {
          _mapsInitialized = true;
          setTimeout(() => {
            if (HEAT_BOUNDS['map-public'] && MAPS['map-public'])
              MAPS['map-public'].fitBounds(HEAT_BOUNDS['map-public'], { padding: [20, 20], animate: false });
          }, 80);
        }
      }
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pct,
    isRealtimeTriggered,
    isNeutralNoiseSession,
    isSoftSuccessSession,
    isHardFailureSession,
    isTrueSuccessSession,
    isRealTripSession,
    isLateTriggered,
    hasMovementEvidence,
    isAbandonedStaleSession,
    classifyAppKilledSession,
    sessionDurationMinutes,
  };
}

