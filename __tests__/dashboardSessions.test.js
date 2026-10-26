const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboard = path.join(__dirname, '..', 'dashboard');
const read = file => fs.readFileSync(path.join(dashboard, file), 'utf8');
const session = (minute, extra = {}) => ({
  app_version: '1.3.11',
  started_at: new Date(Date.UTC(2026, 9, 25, 0, minute)).toISOString(),
  device_id_anon: 'fixture-device',
  country_code: 'IL',
  outcome: 'triggered',
  props: { trigger_source: 'geofence' },
  ...extra,
});

function harness(rows, overrides = {}) {
  const elements = {};
  const calls = [];
  const charts = [];
  const context = vm.createContext({
    ACTIVE_VERSION_FILTER: 'all', ACTIVE_COUNTRY_FILTER: 'all', ACTIVE_OS_FILTER: 'all',
    FILTERED_DEVICE_IDS: null,
    getDateRange: () => ({ endDate: null }),
    createBaseClient: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: rows, error: null };
      },
      from: () => ({
        select() { return this; }, gte() { return this; }, order() { return this; },
        lte() { return this; }, eq() { return this; },
        range: async () => ({
          data: Array.from({ length: 8 }, (_, i) => ({
            device_id_anon: `fixture-${i}`, app_version: '1.3.11', manufacturer: 'test',
          })),
          error: null,
        }),
      }),
    }),
    document: {
      getElementById: id => elements[id] || (elements[id] = {}),
      querySelectorAll: () => [],
    },
    setText: (id, value) => { (elements[id] || (elements[id] = {})).textContent = value; },
    escHtml: value => String(value),
    compareVersions: (a, b) => b.localeCompare(a),
    showEmptyState: () => {},
    renderChart: (id, config) => charts.push({ id, config }),
    ...overrides,
  });
  vm.runInContext(read('js/helpers.js'), context);
  vm.runInContext(read('js/engagement.js'), context);
  context.showEmptyState = () => {};
  context.renderChart = (id, config) => charts.push({ id, config });
  Object.assign(context, overrides);
  return { context, elements, calls, charts };
}

async function render(rows) {
  const h = harness(rows);
  await vm.runInContext("loadVersionComparison(null, '2026-05-25')", h.context);
  const cells = [...h.elements['tbody-version-compare'].innerHTML.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map(match => match[1].replace(/<[^>]+>/g, '').trim());
  return { ...h, cells };
}

test('1.3.11 renders 2/2, 100%, zero silent failures, and separate exclusions', async () => {
  const rows = [
    session(0, { outcome: null }),
    session(30, { outcome: null }),
    session(60),
    session(90),
  ];
  const original = JSON.stringify(rows);
  const h = await render(rows);
  assert.equal(h.cells.length, 13);
  assert.match(h.cells[0], /1\.3\.11.*⚠️/u);
  assert.deepEqual(h.cells.slice(1), ['8', '2', '0', '100%', '100%', '—', '0%', '0%', '0%', '0%', '0%', '0.3']);
  assert.match(h.elements['version-session-exclusions'].textContent, /2/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args.p_since, '-infinity');
  assert.equal(JSON.stringify(rows), original);
});

test('unresolved sessions outside the exclusion window remain in the denominator, not the silent bucket', async () => {
  const h = await render([session(0), session(60), session(90, { outcome: null })]);
  assert.equal(h.cells[2], '2');
  assert.equal(h.cells[4], '50%');
  assert.equal(h.cells[8], '0%');
  assert.equal(h.cells[9], '50%');
});

test('confirmed technical failures are retained, not filtered to improve the success rate', async () => {
  const h = await render([
    session(0), session(60),
    session(90, {
      outcome: 'app_killed', ended_at: '2026-10-25T01:40:00Z',
      props: { distance_km: 2 },
    }),
  ]);
  assert.equal(h.cells[4], '50%');
  assert.equal(h.cells[8], '50%');
  assert.equal(h.cells[9], '0%');
});

test('release anchors stay global across date, country, OS and version filters', async () => {
  const h = harness([
    session(0, { country_code: 'US', device_id_anon: 'ios' }),
    session(59), session(60),
    session(90, { app_version: 'other' }),
    session(0, { app_version: 'other' }),
  ], {
    ACTIVE_VERSION_FILTER: '1.3.11', ACTIVE_COUNTRY_FILTER: 'IL',
    ACTIVE_OS_FILTER: 'android', FILTERED_DEVICE_IDS: new Set(['fixture-device']),
  });
  const filtered = await vm.runInContext("rpcAlarmSessions(null, '2026-10-25T00:30:00Z')", h.context);
  assert.equal(filtered.data.length, 1);
  assert.equal(filtered.excludedCount, 1);
  const comparison = await vm.runInContext("rpcAlarmSessions(null, '2026-10-25T00:30:00Z', 100000, { appVersion: null })", h.context);
  assert.equal(comparison.data.length, 2);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args.p_country_code, null);
  assert.equal(h.calls[0].args.p_app_version, null);
});

test('refresh reloads history and a later date window does not move the release anchor', async () => {
  const h = harness([session(0), session(90)]);
  await vm.runInContext("rpcAlarmSessions(null, '2026-10-25T01:00:00Z')", h.context);
  const cached = await vm.runInContext("rpcAlarmSessions(null, '2026-10-25T01:00:00Z')", h.context);
  assert.equal(cached.data.length, 1);
  assert.equal(cached.excludedCount, 0);
  assert.equal(h.calls.length, 1);
  vm.runInContext('resetAlarmSessionHistory()', h.context);
  await vm.runInContext("rpcAlarmSessions(null, '2026-10-25T01:00:00Z')", h.context);
  assert.equal(h.calls.length, 2);
});

test('version chart separates unverified sessions without counting them twice', async () => {
  const h = await render([
    session(0),
    ...Array.from({ length: 9 }, (_, i) => session(60 + i)),
    session(90, { outcome: null }),
  ]);
  const breakdown = h.charts.find(chart => chart.id === 'chart-version-breakdown');
  const datasets = breakdown.config.data.datasets;
  assert.deepEqual(Array.from(datasets, dataset => dataset.data[0]), [90, 0, 0, 10, 0]);
});

test('history cap and query errors fail visibly instead of returning partial statistics', async () => {
  for (const response of [
    { data: Array(200000).fill(session(0)), error: null },
    { data: null, error: { message: 'fixture error' } },
  ]) {
    const h = harness([], { createBaseClient: () => ({ rpc: async () => response }) });
    await assert.rejects(vm.runInContext("rpcAlarmSessions(null, '2026-05-25')", h.context));
  }
});

test('every session reader uses the shared release exclusion, including weighted exploration', () => {
  for (const file of fs.readdirSync(path.join(dashboard, 'js'))) {
    if (!file.endsWith('.js') || file === 'helpers.js') continue;
    assert.doesNotMatch(read(`js/${file}`), /\.rpc\(['"]dashboard_alarm_sessions_read['"]/);
    assert.doesNotMatch(read(`js/${file}`), /\.from\(['"]alarm_sessions['"]/);
  }
});

test('load failure resets metrics and keeps exports disabled', async () => {
  const updates = [];
  const h = harness([], {
    getDateRange: () => ({ sinceDate: '2026-10-25', endDate: null }),
    setDashboardExportBusy: busy => updates.push(busy),
    refreshVersionFilters: async () => {}, refreshCountryFilters: async () => {},
    renderDateFilterTabs: () => {}, renderOSFilterTabs: () => {},
    updateFeatureEventScopeWarnings: () => {}, createScopedClient: client => client,
    getScopeLabel: () => 'all', loadDAU: async () => 8,
    loadAlarmSessions: async () => { throw new Error('fixture history failure'); },
  });
  vm.runInContext(read('js/loaders.js').split('// ─── Map helpers')[0], h.context);
  await assert.rejects(vm.runInContext('loadAll()', h.context), /fixture history failure/);
  assert.equal(vm.runInContext('ALARM_SESSION_METRICS', h.context), null);
  assert.equal(updates.at(-1), true);
  assert.equal(h.elements['session-exclusion-summary'].textContent, 'fixture history failure');
});

test('exclusion counts are present in both export formats', () => {
  const source = read('js/export.js');
  for (const fn of ['buildDashboardExportMarkdown', 'buildDashboardExportForLLM']) {
    const body = source.slice(source.indexOf(`function ${fn}()`)).split('\nfunction ')[0];
    assert.match(body, /session-exclusion-summary/);
    assert.match(body, /version-session-exclusions/);
  }
});
