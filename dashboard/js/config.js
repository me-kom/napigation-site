// ─── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://zkszmclqycfqpupazpcl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RlVvv6BOGDCztWDFDyMU8w_nrwwXsVK';
window.DASHBOARD_SUPABASE_URL = SUPABASE_URL;
window.DASHBOARD_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
const VERSION_FILTERABLE_TABLES = new Set(['alarm_sessions', 'device_daily_active', 'device_feature_events']);
const COUNTRY_FILTERABLE_TABLES = new Set(['alarm_sessions', 'device_daily_active', 'device_feature_events']);
const DATE_UPPER_BOUND_TABLES = new Set(['device_daily_active', 'feature_events', 'device_feature_events']);
let ACTIVE_VERSION_FILTER = 'all';
let AVAILABLE_VERSION_FILTERS = [];
let ACTIVE_COUNTRY_FILTER = 'all';
let AVAILABLE_COUNTRY_FILTERS = [];
let ACTIVE_DATE_FILTER = 'all';
const AVAILABLE_DATE_FILTERS = ['7d', '30d', '90d', 'custom'];
let ACTIVE_DATE_FROM = '';
let ACTIVE_DATE_TO = '';
let ACTIVE_OS_FILTER = 'all';
const AVAILABLE_OS_FILTERS = ['android', 'ios'];
const QUALITY_THRESHOLDS = {
  triggerSourceUnresolvedWarn: 5,
  triggerSourceUnresolvedCritical: 12,
  gpsGapPerDayWarn: 4,
  gpsGapPerDayCritical: 12,
};

function createBaseClient() {
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function createScopedClient(baseClient) {
  const hasCustomDateUpperBound = ACTIVE_DATE_FILTER === 'custom' && !!ACTIVE_DATE_TO;
  if (ACTIVE_VERSION_FILTER === 'all' && ACTIVE_COUNTRY_FILTER === 'all' && !hasCustomDateUpperBound) return baseClient;
  return new Proxy(baseClient, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver);
      return function fromWithScope(tableName) {
        const builder = target.from(tableName);
        const hasVersionScope = VERSION_FILTERABLE_TABLES.has(tableName) && ACTIVE_VERSION_FILTER !== 'all';
        const hasCountryScope = COUNTRY_FILTERABLE_TABLES.has(tableName) && ACTIVE_COUNTRY_FILTER !== 'all';
        const hasDateUpperScope = ACTIVE_DATE_FILTER === 'custom' && DATE_UPPER_BOUND_TABLES.has(tableName) && !!ACTIVE_DATE_TO;
        if (!hasVersionScope && !hasCountryScope && !hasDateUpperScope) return builder;
        return new Proxy(builder, {
          get(qTarget, qProp, qReceiver) {
            if (qProp !== 'select') return Reflect.get(qTarget, qProp, qReceiver);
            return function selectWithScope(...args) {
              let scoped = qTarget.select(...args);
              if (hasVersionScope) {
                scoped = scoped.eq('app_version', ACTIVE_VERSION_FILTER);
              }
              if (hasCountryScope) {
                scoped = scoped.eq('country_code', ACTIVE_COUNTRY_FILTER);
              }
              if (hasDateUpperScope) {
                scoped = scoped.lte('event_date', ACTIVE_DATE_TO);
              }
              return scoped;
            };
          }
        });
      };
    }
  });
}

function getClient() {
  const base = createBaseClient();
  return createScopedClient(base);
}

function getVersionScopeLabel() {
  return ACTIVE_VERSION_FILTER === 'all' ? 'כל הגרסאות' : `גרסה ${ACTIVE_VERSION_FILTER}`;
}

function getCountryScopeLabel() {
  return ACTIVE_COUNTRY_FILTER === 'all' ? 'כל המדינות' : `מדינה ${ACTIVE_COUNTRY_FILTER}`;
}

function getDateScopeLabel() {
  if (ACTIVE_DATE_FILTER === 'all') return 'כל התקופה';
  if (ACTIVE_DATE_FILTER === '7d') return '7 ימים אחרונים';
  if (ACTIVE_DATE_FILTER === '30d') return '30 ימים אחרונים';
  if (ACTIVE_DATE_FILTER === '90d') return '90 ימים אחרונים';
  if (ACTIVE_DATE_FILTER === 'custom') {
    if (ACTIVE_DATE_FROM && ACTIVE_DATE_TO) return `טווח ${ACTIVE_DATE_FROM} עד ${ACTIVE_DATE_TO}`;
    return 'טווח מותאם';
  }
  return 'כל התקופה';
}

function getOSScopeLabel() {
  if (ACTIVE_OS_FILTER === 'all') return 'כל המערכות';
  if (ACTIVE_OS_FILTER === 'android') return 'אנדרואיד';
  if (ACTIVE_OS_FILTER === 'ios') return 'iOS';
  return 'כל המערכות';
}

function getScopeLabel() {
  return `${getVersionScopeLabel()} · ${getCountryScopeLabel()} · ${getDateScopeLabel()} · ${getOSScopeLabel()}`;
}

function calculateSinceDate() {
  return getDateRange().sinceDate;
}

function getDateRange() {
  const today = new Date().toISOString().slice(0, 10);
  if (ACTIVE_DATE_FILTER === '7d') return { sinceDate: dateNDaysAgo(7), endDate: null };
  if (ACTIVE_DATE_FILTER === '30d') return { sinceDate: dateNDaysAgo(30), endDate: null };
  if (ACTIVE_DATE_FILTER === '90d') return { sinceDate: dateNDaysAgo(90), endDate: null };
  if (ACTIVE_DATE_FILTER === 'custom') {
    const from = (ACTIVE_DATE_FROM || '').trim();
    const to = (ACTIVE_DATE_TO || '').trim();
    if (from && to && from <= to) {
      const safeFrom = from < DATA_START_DATE ? DATA_START_DATE : from;
      const safeTo = to > today ? today : to;
      if (safeFrom <= safeTo) return { sinceDate: safeFrom, endDate: safeTo };
    }
  }
  return { sinceDate: DATA_START_DATE, endDate: null };
}

// ─── Compare versions semantically (semver) ──────────────────────────────────
function compareVersions(versionA, versionB) {
  const parseVersion = (v) => {
    const parts = String(v).split('.').map(p => parseInt(p, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const [a0, a1, a2] = parseVersion(versionA);
  const [b0, b1, b2] = parseVersion(versionB);
  if (a0 !== b0) return b0 - a0;  // סדר יורד: גרסה גדולה קודם
  if (a1 !== b1) return b1 - a1;
  return b2 - a2;
}

function renderVersionFilterTabs() {
  const container = document.getElementById('version-tabs');
  if (!container) return;
  const items = ['all', ...AVAILABLE_VERSION_FILTERS];
  container.innerHTML = items.map(version => {
    const isAll = version === 'all';
    const isActive = version === ACTIVE_VERSION_FILTER;
    const label = isAll ? 'כל הגרסאות' : `v${version}`;
    return `<button class="version-tab ${isActive ? 'active' : ''}" data-version="${escHtml(version)}" onclick="setVersionFilter('${escHtml(version)}')">${label}</button>`;
  }).join('');
}

async function refreshVersionFilters(baseClient, sinceDate, endDate = null) {
  const { data, error } = await fetchAllRows(() => {
    let q = baseClient
      .from('device_daily_active')
      .select('app_version')
      .gte('event_date', sinceDate)
      .not('app_version', 'is', null);
    if (endDate) q = q.lte('event_date', endDate);
    return q;
  });

  if (error) {
    console.error('version filter load error:', error);
    AVAILABLE_VERSION_FILTERS = [];
    ACTIVE_VERSION_FILTER = 'all';
    renderVersionFilterTabs();
    return;
  }

  const counts = {};
  (data || []).forEach(row => {
    const v = String(row.app_version || '').trim();
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });

  AVAILABLE_VERSION_FILTERS = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([version]) => version)
    .sort(compareVersions);  // Sort versions in descending order (newest first)

  if (ACTIVE_VERSION_FILTER !== 'all' && !AVAILABLE_VERSION_FILTERS.includes(ACTIVE_VERSION_FILTER)) {
    ACTIVE_VERSION_FILTER = 'all';
  }

  renderVersionFilterTabs();
}

function renderCountryFilterTabs() {
  const container = document.getElementById('country-tabs');
  if (!container) return;
  const items = ['all', ...AVAILABLE_COUNTRY_FILTERS];
  container.innerHTML = items.map(country => {
    const isAll = country === 'all';
    const isActive = country === ACTIVE_COUNTRY_FILTER;
    const label = isAll ? 'כל המדינות' : country;
    return `<button class="version-tab ${isActive ? 'active' : ''}" data-country="${escHtml(country)}" onclick="setCountryFilter('${escHtml(country)}')">${label}</button>`;
  }).join('');
}

async function refreshCountryFilters(baseClient, sinceDate, endDate = null) {
  const { data, error } = await fetchAllRows(() => {
    let q = baseClient
      .from('device_daily_active')
      .select('country_code')
      .gte('event_date', sinceDate)
      .not('country_code', 'is', null);
    if (endDate) q = q.lte('event_date', endDate);
    return q;
  });

  if (error) {
    console.error('country filter load error:', error);
    AVAILABLE_COUNTRY_FILTERS = [];
    ACTIVE_COUNTRY_FILTER = 'all';
    renderCountryFilterTabs();
    return;
  }

  const counts = {};
  (data || []).forEach(row => {
    const c = String(row.country_code || '').trim().toUpperCase();
    if (!c) return;
    counts[c] = (counts[c] || 0) + 1;
  });

  AVAILABLE_COUNTRY_FILTERS = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([country]) => country)
    .sort((a, b) => a.localeCompare(b));

  if (ACTIVE_COUNTRY_FILTER !== 'all' && !AVAILABLE_COUNTRY_FILTERS.includes(ACTIVE_COUNTRY_FILTER)) {
    ACTIVE_COUNTRY_FILTER = 'all';
  }

  renderCountryFilterTabs();
}

function renderDateFilterTabs() {
  const container = document.getElementById('date-tabs');
  if (!container) return;
  const items = ['all', ...AVAILABLE_DATE_FILTERS];
  container.innerHTML = items.map(period => {
    const isAll = period === 'all';
    const isActive = period === ACTIVE_DATE_FILTER;
    let label = 'כל התקופה';
    if (period === '7d') label = '7 ימים';
    else if (period === '30d') label = '30 ימים';
    else if (period === '90d') label = '90 ימים';
    else if (period === 'custom') label = 'טווח מותאם';
    return `<button class="version-tab ${isActive ? 'active' : ''}" data-period="${escHtml(period)}" onclick="setDateFilter('${escHtml(period)}')">${label}</button>`;
  }).join('');
  syncCustomDateInputs();
}

function syncCustomDateInputs() {
  const fromInput = document.getElementById('date-from');
  const toInput = document.getElementById('date-to');
  const wrap = document.getElementById('custom-date-range');
  if (!fromInput || !toInput || !wrap) return;
  fromInput.value = ACTIVE_DATE_FROM || '';
  toInput.value = ACTIVE_DATE_TO || '';
  wrap.style.display = ACTIVE_DATE_FILTER === 'custom' ? 'flex' : 'none';
}

function renderOSFilterTabs() {
  const container = document.getElementById('os-tabs');
  if (!container) return;
  const items = ['all', ...AVAILABLE_OS_FILTERS];
  container.innerHTML = items.map(os => {
    const isAll = os === 'all';
    const isActive = os === ACTIVE_OS_FILTER;
    let label = 'כל המערכות';
    if (os === 'android') label = 'אנדרואיד';
    else if (os === 'ios') label = 'iOS';
    return `<button class="version-tab ${isActive ? 'active' : ''}" data-os="${escHtml(os)}" onclick="setOSFilter('${escHtml(os)}')">${label}</button>`;
  }).join('');
}

async function setVersionFilter(version) {
  if (version === ACTIVE_VERSION_FILTER) return;
  ACTIVE_VERSION_FILTER = version;
  renderVersionFilterTabs();
  updateFeatureEventScopeWarnings();
  await loadAll();
}

async function setCountryFilter(country) {
  if (country === ACTIVE_COUNTRY_FILTER) return;
  ACTIVE_COUNTRY_FILTER = country;
  renderCountryFilterTabs();
  updateFeatureEventScopeWarnings();
  await loadAll();
}

async function setDateFilter(period) {
  if (period === ACTIVE_DATE_FILTER) return;
  if (period === 'custom' && (!ACTIVE_DATE_FROM || !ACTIVE_DATE_TO)) {
    ACTIVE_DATE_TO = new Date().toISOString().slice(0, 10);
    ACTIVE_DATE_FROM = dateNDaysAgo(30);
  }
  ACTIVE_DATE_FILTER = period;
  renderDateFilterTabs();
  updateFeatureEventScopeWarnings();
  await loadAll();
}

async function applyCustomDateRange() {
  const fromInput = document.getElementById('date-from');
  const toInput = document.getElementById('date-to');
  if (!fromInput || !toInput) return;
  const from = String(fromInput.value || '').trim();
  const to = String(toInput.value || '').trim();
  if (!from || !to) {
    alert('יש לבחור תאריך התחלה ותאריך סיום');
    return;
  }
  if (from > to) {
    alert('תאריך התחלה חייב להיות קטן או שווה לתאריך סיום');
    return;
  }
  ACTIVE_DATE_FROM = from;
  ACTIVE_DATE_TO = to;
  ACTIVE_DATE_FILTER = 'custom';
  renderDateFilterTabs();
  updateFeatureEventScopeWarnings();
  await loadAll();
}

async function setOSFilter(os) {
  if (os === ACTIVE_OS_FILTER) return;
  ACTIVE_OS_FILTER = os;
  renderOSFilterTabs();
  updateFeatureEventScopeWarnings();
  await loadAll();
}

function updateFeatureEventScopeWarnings() {
  const versionFiltered = ACTIVE_VERSION_FILTER !== 'all';
  const countryFiltered = ACTIVE_COUNTRY_FILTER !== 'all';
  const dateFiltered = ACTIVE_DATE_FILTER !== 'all';
  const osFiltered = ACTIVE_OS_FILTER !== 'all';
  const parts = [];
  if (versionFiltered) parts.push('כל הגרסאות');
  if (countryFiltered) parts.push('כל המדינות');
  if (dateFiltered) parts.push('כל התקופה');
  if (osFiltered) parts.push('כל המערכות');
  const warningLabel = parts.length > 0 ? '⚠️ ' + parts.join(' + ') : '';
  const badgeHtml = warningLabel ? `<span style="color:#f59e0b"> · ${warningLabel}</span>` : '';
  const el1 = document.getElementById('kpi-enabled-scope');
  const el2 = document.getElementById('kpi-dismissed-scope');
  const el3 = document.getElementById('kpi-toggled-off-scope');
  if (el1) el1.innerHTML = warningLabel ? `<span style="color:#f59e0b">${warningLabel}</span>` : '';
  if (el2) el2.innerHTML = badgeHtml;
  if (el3) el3.innerHTML = badgeHtml;
}

