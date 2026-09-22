const TAB_EXPORT_SOURCES = {
  overview: [
    'Tables: device_daily_active, public_locations',
    'RPCs: dashboard_alarm_sessions_read, dashboard_revenue_events_read, dashboard_location_grid_read',
    'Aggregates: feature_events או dashboard_device_feature_events_read כאשר פעיל פילוח פר-מכשיר',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS'
  ],
  users: [
    'Tables: device_daily_active, public_locations',
    'RPCs: dashboard_alarm_sessions_read, dashboard_location_grid_read',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS'
  ],
  alarms: [
    'Tables: device_daily_active, feature_events',
    'RPCs: dashboard_alarm_sessions_read, dashboard_device_feature_events_read',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS'
  ],
  revenue: [
    'Tables: device_daily_active, feature_events',
    'RPCs: dashboard_revenue_events_read',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS על נתוני מכשירים'
  ],
  features: [
    'Tables: device_daily_active, feature_events',
    'RPCs: dashboard_alarm_sessions_read, dashboard_device_feature_events_read',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS'
  ],
  versions: [
    'Tables: device_daily_active',
    'RPCs: dashboard_alarm_sessions_read',
    'Filters: מדינה/תאריך/מערכת; טבלת ההשוואה עצמה מתעלמת מפילוח גרסה כדי להשוות בין builds'
  ],
  weekdays: [
    'Tables: device_daily_active',
    'RPCs: dashboard_alarm_sessions_read',
    'Filters: גרסה/מדינה/תאריך/מערכת פעילים גם בטאב זה'
  ],
  behavior: [
    'Tables: device_daily_active',
    'RPCs: dashboard_device_feature_events_read',
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS'
  ],
  stores: [
    'Table: store_metrics',
    'RPC: dashboard_store_metrics_read',
    'Filters: הטאב גלובלי ואינו מושפע מפילוח גרסה/מדינה/מערכת'
  ]
};

function initDashboardExport() {
  const menu = document.getElementById('export-menu');
  const toggle = document.getElementById('export-toggle-btn');
  const panel = document.getElementById('export-menu-panel');
  if (!menu || !toggle || !panel) return;

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  panel.querySelectorAll('[data-export-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await exportDashboard(button.getAttribute('data-export-action'));
    });
  });

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) closeDashboardExportMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDashboardExportMenu();
  });
}

function closeDashboardExportMenu() {
  const menu = document.getElementById('export-menu');
  const toggle = document.getElementById('export-toggle-btn');
  if (!menu || !toggle) return;
  menu.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
}

function setDashboardExportBusy(isBusy) {
  const toggle = document.getElementById('export-toggle-btn');
  if (!toggle) return;
  toggle.disabled = !!isBusy;
  toggle.textContent = isBusy ? 'מכין יצוא...' : 'ייצא ▾';
  if (isBusy) closeDashboardExportMenu();
}

async function exportDashboard(action) {
  closeDashboardExportMenu();
  setDashboardExportBusy(true);
  try {
    let content = buildDashboardExportMarkdown();
    if (action === 'clipboard') {
      content = buildDashboardExportForLLM();
    } else if (action === 'llm-prompt') {
      content = buildDashboardPromptForLLM();
    }
    if (action === 'clipboard' || action === 'llm-prompt') {
      await copyTextToClipboard(content);
    } else {
      downloadDashboardExport(content);
    }
  } catch (error) {
    console.error('dashboard export failed:', error);
    alert(`הייצוא נכשל: ${error.message || 'שגיאה לא ידועה'}`);
  } finally {
    setDashboardExportBusy(false);
  }
}

function buildDashboardExportMarkdown() {
  const parts = [];
  const now = new Date();
  parts.push('# יצוא דאשבורד מי-קום');
  parts.push(`נוצר: ${now.toLocaleString('he-IL')}`);
  parts.push(`Scope: ${getScopeLabel()}`);
  parts.push(`Last updated label: ${normalizeExportText(document.getElementById('last-updated')?.textContent || '—')}`);

  const tabs = Array.from(document.querySelectorAll('.tab-content'));
  tabs.forEach((tab) => {
    parts.push(renderTabExportSection(tab));
  });

  return parts.join('\n\n');
}

function buildDashboardExportForLLM() {
  const parts = [];
  const now = new Date();
  parts.push('# Me-Kum Dashboard Snapshot for LLM');
  parts.push('Use this snapshot as the single source of truth. If a metric is missing, state that it is unavailable instead of guessing. Respond in Hebrew unless the user asked otherwise.');
  parts.push('Preferred response structure: 1. summary 2. anomalies or risks 3. recommended actions 4. open questions.');
  parts.push(`Generated at: ${now.toLocaleString('he-IL')}`);
  parts.push(`Active scope: ${getScopeLabel()}`);
  parts.push(`Last updated label: ${normalizeExportText(document.getElementById('last-updated')?.textContent || '—')}`);

  const tabs = Array.from(document.querySelectorAll('.tab-content'));
  tabs.forEach((tab) => {
    parts.push(renderTabExportSectionForLLM(tab));
  });

  return parts.join('\n\n');
}

function buildDashboardPromptForLLM() {
  const snapshot = buildDashboardExportForLLM();
  return [
    '# Prompt for LLM',
    'נתון לך snapshot של dashboard מוצר/אנליטיקה. נתח אותו רק לפי המידע שמופיע בהמשך, בלי להמציא נתונים חסרים.',
    'ענה בעברית ובמבנה הבא בדיוק:',
    '1. Summary: 3-6 משפטים עם תמונת מצב כללית.',
    '2. Key insights: עד 7 נקודות עם הממצאים הכי חשובים.',
    '3. Risks or anomalies: רק בעיות, רגרסיות, חוסרים במדידה, או מגמות חריגות.',
    '4. Recommended actions: 3-5 צעדים פרקטיים לפי עדיפות.',
    '5. Open questions: רק שאלות שהנתונים עצמם לא סוגרים.',
    'כללים:',
    '- אל תחזור על כל המספרים. בחר רק את המספרים החשובים.',
    '- אם יש סתירה בין dashboards, ציין אותה במפורש.',
    '- אם מידע חסר או לא זמין, כתוב זאת במקום לנחש.',
    '- תעדף תובנות עסקיות/מוצריות/אמינות מערכת על פני תיאור גרפים.',
    '- אם אתה מזהה מדד בעייתי במיוחד, ציין למה הוא חשוב ומה סביר שגורם לו.',
    '',
    '--- DASHBOARD SNAPSHOT START ---',
    snapshot,
    '--- DASHBOARD SNAPSHOT END ---',
  ].join('\n');
}

function renderTabExportSection(tab) {
  const tabKey = String(tab.id || '').replace(/^tab-/, '');
  const title = getTabLabel(tabKey);
  const query = getTabQuerySummary(tabKey);
  const explanation = getTabExplanation(tab);
  const result = getTabResult(tabKey, tab);
  return [
    `## ${title}`,
    'שאילתה:',
    query,
    'טקסט מסביר:',
    explanation,
    'תוצאה:',
    result,
  ].join('\n\n');
}

function renderTabExportSectionForLLM(tab) {
  const tabKey = String(tab.id || '').replace(/^tab-/, '');
  const title = getTabLabel(tabKey);
  const query = getTabQuerySummaryForLLM(tabKey);
  const explanation = getTabExplanation(tab);
  const result = getTabResultForLLM(tabKey, tab);
  return [
    `## Dashboard: ${title}`,
    'QUERY_CONTEXT',
    query,
    'EXPLANATION_TEXT',
    explanation,
    'RESULT_DATA',
    result,
  ].join('\n\n');
}

function getTabLabel(tabKey) {
  const button = document.querySelector(`.tab-btn[data-tab="${tabKey}"]`);
  return normalizeExportText(button?.textContent || tabKey || 'טאב');
}

function getTabQuerySummary(tabKey) {
  if (tabKey === 'explorer') return getExplorerQuerySummary();
  const sources = TAB_EXPORT_SOURCES[tabKey] || ['No query metadata registered for this tab.'];
  return ['```text', ...sources, '```'].join('\n');
}

function getTabQuerySummaryForLLM(tabKey) {
  if (tabKey === 'explorer') return getExplorerQuerySummaryForLLM();
  const sources = TAB_EXPORT_SOURCES[tabKey] || ['No query metadata registered for this tab.'];
  return sources.map((line) => `- ${line}`).join('\n');
}

function getExplorerQuerySummary() {
  const metric = document.getElementById('exp-metric')?.value || 'alarm_count';
  const dim = document.getElementById('exp-dim')?.value || 'dow';
  const period = document.getElementById('exp-period')?.value || '30';
  let source = 'feature_events';
  if (metric === 'alarm_count' || metric === 'alarm_success') source = 'dashboard_alarm_sessions_read';
  else if (metric === 'dau' || metric === 'new_users') source = 'device_daily_active';
  else if (metric === 'revenue') source = 'dashboard_revenue_events_read';
  else if (isPerDeviceScopeActive()) source = 'dashboard_device_feature_events_read';
  return [
    '```text',
    `Metric: ${metric}`,
    `Dimension: ${dim}`,
    `Period days: ${period}`,
    `Primary source: ${source}`,
    'Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS כאשר המקור פר-מכשיר',
    '```'
  ].join('\n');
}

function getExplorerQuerySummaryForLLM() {
  const metric = document.getElementById('exp-metric')?.value || 'alarm_count';
  const dim = document.getElementById('exp-dim')?.value || 'dow';
  const period = document.getElementById('exp-period')?.value || '30';
  let source = 'feature_events';
  if (metric === 'alarm_count' || metric === 'alarm_success') source = 'dashboard_alarm_sessions_read';
  else if (metric === 'dau' || metric === 'new_users') source = 'device_daily_active';
  else if (metric === 'revenue') source = 'dashboard_revenue_events_read';
  else if (isPerDeviceScopeActive()) source = 'dashboard_device_feature_events_read';
  return [
    `- Metric key: ${metric}`,
    `- Metric label: ${document.getElementById('exp-metric')?.selectedOptions?.[0]?.textContent || '—'}`,
    `- Dimension key: ${dim}`,
    `- Dimension label: ${document.getElementById('exp-dim')?.selectedOptions?.[0]?.textContent || '—'}`,
    `- Period days: ${period}`,
    `- Primary source: ${source}`,
    '- Filters: גרסה/מדינה/תאריך דרך createScopedClient, מערכת דרך FILTERED_DEVICE_IDS כאשר המקור פר-מכשיר',
  ].join('\n');
}

function getTabExplanation(tab) {
  const sections = [];
  const introNodes = tab.querySelectorAll('.tab-intro p, .explorer-intro');
  introNodes.forEach((node) => {
    const text = normalizeExportText(node.textContent);
    if (text) sections.push(`- ${text}`);
  });

  tab.querySelectorAll('.card').forEach((card) => {
    const title = normalizeExportText(card.querySelector('h2')?.textContent || '');
    const desc = normalizeExportText(card.querySelector('.chart-desc')?.textContent || '');
    if (title && desc) sections.push(`- ${title}: ${desc}`);
  });

  return sections.length ? sections.join('\n') : 'אין טקסט הסבר זמין.';
}

function getTabResult(tabKey, tab) {
  if (tabKey === 'explorer') return getExplorerResult(tab);
  const cards = Array.from(tab.querySelectorAll('.card'));
  if (!cards.length) return 'אין כרטיסי תוצאה בטאב זה.';
  return cards.map((card) => renderCardResult(card)).join('\n\n');
}

function getTabResultForLLM(tabKey, tab) {
  if (tabKey === 'explorer') return getExplorerResultForLLM();
  const cards = Array.from(tab.querySelectorAll('.card'));
  if (!cards.length) return 'No result cards in this dashboard.';
  return cards.map((card) => renderCardResultForLLM(card)).join('\n\n');
}

function getExplorerResult(tab) {
  const desc = normalizeExportText(document.getElementById('exp-desc')?.textContent || '');
  const chart = serializeChartCanvas(document.getElementById('chart-explorer'));
  const empty = normalizeExportText(document.getElementById('exp-empty')?.textContent || '');
  const selections = [
    `מדד: ${document.getElementById('exp-metric')?.selectedOptions?.[0]?.textContent || '—'}`,
    `פילוח: ${document.getElementById('exp-dim')?.selectedOptions?.[0]?.textContent || '—'}`,
    `תקופה: ${document.getElementById('exp-period')?.selectedOptions?.[0]?.textContent || '—'}`,
  ].join('\n');
  const blocks = ['### בחירה נוכחית', selections];
  if (desc) blocks.push('### הסבר גרף', desc);
  blocks.push('### תוצאה', chart || empty || 'אין תוצאה זמינה כרגע.');
  return blocks.join('\n\n');
}

function getExplorerResultForLLM() {
  const desc = normalizeExportText(document.getElementById('exp-desc')?.textContent || '');
  const chart = serializeChartCanvasForLLM(document.getElementById('chart-explorer'));
  const empty = normalizeExportText(document.getElementById('exp-empty')?.textContent || '');
  const selections = [
    `- Metric: ${document.getElementById('exp-metric')?.selectedOptions?.[0]?.textContent || '—'}`,
    `- Dimension: ${document.getElementById('exp-dim')?.selectedOptions?.[0]?.textContent || '—'}`,
    `- Period: ${document.getElementById('exp-period')?.selectedOptions?.[0]?.textContent || '—'}`,
  ].join('\n');
  const blocks = ['### Current selection', selections];
  if (desc) blocks.push('### Chart explanation', desc);
  blocks.push('### Result', chart || empty || 'No result currently available.');
  return blocks.join('\n\n');
}

function renderCardResult(card) {
  const title = normalizeExportText(card.querySelector('h2')?.textContent || 'כרטיס ללא כותרת');
  const blocks = [`### ${title}`];
  const kpis = serializeCardKpis(card);
  if (kpis) blocks.push(kpis);
  const tables = serializeCardTables(card);
  if (tables) blocks.push(tables);
  const charts = serializeCardCharts(card);
  if (charts) blocks.push(charts);
  const text = serializeResidualCardText(card);
  if (text) blocks.push(text);
  if (blocks.length === 1) blocks.push('אין תוצאה זמינה כרגע.');
  return blocks.join('\n\n');
}

function renderCardResultForLLM(card) {
  const title = normalizeExportText(card.querySelector('h2')?.textContent || 'Untitled card');
  const blocks = [`### Card: ${title}`];
  const kpis = serializeCardKpis(card);
  if (kpis) blocks.push(kpis);
  const tables = serializeCardTablesForLLM(card);
  if (tables) blocks.push(tables);
  const charts = serializeCardChartsForLLM(card);
  if (charts) blocks.push(charts);
  const text = serializeResidualCardText(card);
  if (text) blocks.push(text);
  if (blocks.length === 1) blocks.push('No result currently available.');
  return blocks.join('\n\n');
}

function serializeCardKpis(card) {
  const items = Array.from(card.querySelectorAll('.kpi'));
  if (!items.length) return '';
  const lines = items.map((item) => {
    const label = normalizeExportText(item.querySelector('.label')?.textContent || 'מדד');
    const value = normalizeExportText(item.querySelector('.value')?.textContent || '—');
    const sub = normalizeExportText(item.querySelector('.sub')?.textContent || '');
    return sub ? `- ${label}: ${value} (${sub})` : `- ${label}: ${value}`;
  });
  return ['KPIs:', ...lines].join('\n');
}

function serializeCardTables(card) {
  const tables = Array.from(card.querySelectorAll('table'));
  if (!tables.length) return '';
  return tables.map((table, index) => {
    const rows = [];
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => normalizeExportText(th.textContent));
    if (headers.length) rows.push(`Headers: ${headers.join(' | ')}`);
    Array.from(table.querySelectorAll('tbody tr')).forEach((tr) => {
      const values = Array.from(tr.querySelectorAll('td')).map((td) => normalizeExportText(td.textContent));
      if (values.length) rows.push(values.join(' | '));
    });
    return [`Table ${index + 1}:`, ...rows].join('\n');
  }).join('\n\n');
}

function serializeCardCharts(card) {
  const canvases = Array.from(card.querySelectorAll('canvas'));
  if (!canvases.length) return '';
  const chartBlocks = canvases.map((canvas) => serializeChartCanvas(canvas)).filter(Boolean);
  return chartBlocks.join('\n\n');
}

function serializeCardChartsForLLM(card) {
  const canvases = Array.from(card.querySelectorAll('canvas'));
  if (!canvases.length) return '';
  const chartBlocks = canvases.map((canvas) => serializeChartCanvasForLLM(canvas)).filter(Boolean);
  return chartBlocks.join('\n\n');
}

function serializeChartCanvas(canvas) {
  if (!canvas?.id) return '';
  const emptyState = document.getElementById(`${canvas.id}-empty`);
  if (emptyState && emptyState.style.display !== 'none') {
    return normalizeExportText(emptyState.textContent || 'אין נתונים עדיין');
  }
  const chart = CHARTS[canvas.id];
  if (!chart) return '';
  const payload = {
    chartId: canvas.id,
    labels: Array.isArray(chart.data?.labels) ? chart.data.labels : [],
    datasets: Array.isArray(chart.data?.datasets)
      ? chart.data.datasets.map((dataset) => ({
          label: dataset.label || '',
          data: Array.isArray(dataset.data) ? dataset.data : [],
        }))
      : [],
  };
  return ['Chart data:', '```json', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function serializeChartCanvasForLLM(canvas) {
  if (!canvas?.id) return '';
  const emptyState = document.getElementById(`${canvas.id}-empty`);
  if (emptyState && emptyState.style.display !== 'none') {
    return `Chart summary:\n- Empty state: ${normalizeExportText(emptyState.textContent || 'אין נתונים עדיין')}`;
  }
  const chart = CHARTS[canvas.id];
  if (!chart) return '';
  const labels = Array.isArray(chart.data?.labels) ? chart.data.labels.map(labelToText) : [];
  const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
  const header = [`Chart summary:`, `- chartId: ${canvas.id}`, `- labelsCount: ${labels.length}`];
  if (labels.length) {
    header.push(`- labelsSample: ${JSON.stringify(compressSequence(labels))}`);
  }
  const datasetLines = datasets.map((dataset, index) => summarizeDatasetForLLM(dataset, index));
  return [...header, ...datasetLines].join('\n');
}

function summarizeDatasetForLLM(dataset, index) {
  const values = Array.isArray(dataset?.data) ? dataset.data.map(normalizePointValue) : [];
  const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  const points = values.map((value, idx) => ({
    label: idx,
    value,
  }));
  const sample = compressSequence(values);
  const latest = values.length ? values[values.length - 1] : null;
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const avg = numericValues.length ? roundForExport(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) : null;
  return [
    `- dataset[${index}] label: ${normalizeExportText(dataset?.label || `dataset_${index + 1}`)}`,
    `  pointsCount: ${values.length}`,
    `  latestValue: ${formatExportValue(latest)}`,
    `  min: ${formatExportValue(min)}`,
    `  max: ${formatExportValue(max)}`,
    `  avg: ${formatExportValue(avg)}`,
    `  valuesSample: ${JSON.stringify(sample)}`,
  ].join('\n');
}

function normalizePointValue(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? roundForExport(value) : null;
  if (typeof value === 'object') {
    if (typeof value.y === 'number') return roundForExport(value.y);
    if (typeof value.x === 'number') return roundForExport(value.x);
    return normalizeExportText(JSON.stringify(value));
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return roundForExport(asNumber);
  return normalizeExportText(String(value));
}

function roundForExport(value) {
  return Math.round(value * 100) / 100;
}

function formatExportValue(value) {
  return value == null ? 'n/a' : String(value);
}

function compressSequence(values, edgeCount = 6) {
  if (!Array.isArray(values)) return [];
  if (values.length <= edgeCount * 2) return values;
  return [
    ...values.slice(0, edgeCount),
    `... (${values.length - edgeCount * 2} omitted) ...`,
    ...values.slice(-edgeCount),
  ];
}

function labelToText(value) {
  return normalizeExportText(typeof value === 'string' ? value : JSON.stringify(value));
}

function serializeResidualCardText(card) {
  const clone = card.cloneNode(true);
  clone.querySelectorAll('h2, .chart-desc, canvas, table, .kpi, .loading').forEach((node) => node.remove());
  const text = normalizeExportText(clone.textContent || '');
  if (!text) return '';
  return ['Text result:', text].join('\n');
}

function serializeCardTablesForLLM(card) {
  const tables = Array.from(card.querySelectorAll('table'));
  if (!tables.length) return '';
  return tables.map((table, index) => summarizeTableForLLM(table, index)).join('\n\n');
}

function summarizeTableForLLM(table, index) {
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => normalizeExportText(th.textContent));
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => normalizeExportText(td.textContent))
  ).filter((row) => row.length);
  const sampleRows = rows.slice(0, 8).map((row) => `- ${row.join(' | ')}`);
  const extraCount = Math.max(rows.length - sampleRows.length, 0);
  const lines = [`Table summary ${index + 1}:`, `- rows: ${rows.length}`];
  if (headers.length) lines.push(`- headers: ${headers.join(' | ')}`);
  if (sampleRows.length) lines.push('- sampleRows:', ...sampleRows);
  if (extraCount > 0) lines.push(`- additionalRowsOmitted: ${extraCount}`);
  return lines.join('\n');
}

function normalizeExportText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('הדפדפן לא איפשר העתקה לקליפבורד');
}

function downloadDashboardExport(content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  anchor.href = url;
  anchor.download = `me-kum-dashboard-export-${stamp}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}