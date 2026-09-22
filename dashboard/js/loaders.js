// ─── Data loaders ─────────────────────────────────────────────────────────
let ALARM_SESSION_METRICS = null;
let FILTERED_DEVICE_IDS = null;  // Set of device_id_anon matching current OS filter

async function loadAll() {
  const baseClient = createBaseClient();
  const { sinceDate, endDate } = getDateRange();
  if (typeof setDashboardExportBusy === 'function') setDashboardExportBusy(true);
  await refreshVersionFilters(baseClient, sinceDate, endDate);
  await refreshCountryFilters(baseClient, sinceDate, endDate);
  renderDateFilterTabs();
  renderOSFilterTabs();
  
  // Build OS-filtered device set
  if (ACTIVE_OS_FILTER !== 'all') {
    const { data, error } = await fetchAllRows(() => baseClient
      .from('device_daily_active')
      .select('device_id_anon, manufacturer, android_version')
      .gte('event_date', sinceDate)
      .lte('event_date', endDate || '9999-12-31'));
    
    if (!error && data) {
      FILTERED_DEVICE_IDS = new Set(
        data
          .filter(r => {
            const platform = devicePlatform(r.manufacturer, r.android_version);
            if (ACTIVE_OS_FILTER === 'android') return platform === 'android';
            if (ACTIVE_OS_FILTER === 'ios') return platform === 'apple';
            return true;
          })
          .map(r => r.device_id_anon)
      );
    } else {
      FILTERED_DEVICE_IDS = null;
    }
  } else {
    FILTERED_DEVICE_IDS = null;
  }
  
  updateFeatureEventScopeWarnings();
  const sb = createScopedClient(baseClient);
  if (!sb) return;
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ טוען...'; }
  setText('last-updated', `מעדכן... (${getScopeLabel()})`);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const since30 = sinceDate;

    // loadDAU מחזיר את ה-mau — מועבר ישירות ל-loadRevenue
    const mau = await loadDAU(sb, since30, today);
    // Load sessions first — they are canonical for triggered/timeout metrics shared across cards/charts.
    ALARM_SESSION_METRICS = await loadAlarmSessions(sb, since30);

    await Promise.all([
      loadRevenue(sb, mau),
      loadFeatureEvents(sb, since30),
      loadVersions(sb, since30),
      loadLanguageUsage(sb, since30),
      loadManufacturers(sb, since30),
      loadPublicHeatmap(sb),
      loadGridHeatmap(sb, since30),
      loadRetention(sb),
      loadPeakHours(sb, since30),
      loadNewUsers(sb, since30),
      loadInactiveUsers(sb),
      loadWatchdog(sb, since30),
      loadSessionDuration(sb, since30),
      loadEngagementDepth(sb, since30),
      loadRouteVsLocation(sb, since30),
      loadSuccessRateTrend(sb, since30),
      loadManufacturerSuccess(sb, since30),
      loadPlatformSuccess(sb, since30),
      loadReliabilityBreakdown(sb, since30),
      loadTriggerLatency(sb, since30),
      loadGpsAccuracy(sb, since30),
      loadBackgroundSurvival(sb, since30),
      loadEarlyCancellations(sb, since30),
      loadDistanceVsRadius(sb, since30),
      loadActivationFunnel(sb, since30),
      loadTimeToFirstAlarm(sb),
      loadAppOpenFrequency(sb, since30),
      loadGrowthCharts(sb),
      loadFirstVsRepeatSuccess(sb, since30),
      loadConversionFunnel(sb, since30),
      loadVersionComparison(sb, since30),
      loadDayOfWeek(sb, since30),
      loadBehavior(sb, since30),
      loadStoreMetrics(sb, since30),
    ]);

    const now = new Date().toLocaleTimeString('he-IL');
    setText('last-updated', `עודכן: ${now} · ${getScopeLabel()}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ רענן'; }
    if (typeof setDashboardExportBusy === 'function') setDashboardExportBusy(false);
  }
}

// ─── Map helpers ────────────────────────────────────────────────────────────
const MAPS = {};
const HEAT_BOUNDS = {};
let _mapsInitialized = false;

function initMap(id) {
  if (MAPS[id]) return MAPS[id];
  const m = L.map(id, { zoomControl: true }).fitBounds([[29.4, 34.2], [33.4, 35.9]]);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abc',
    className: 'map-tiles-muted',
  }).addTo(m);
  MAPS[id] = m;
  return m;
}

function switchMapTab(tab) {
  document.querySelectorAll('.map-tab').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'public') || (i === 1 && tab === 'grid'));
  });
  document.getElementById('wrap-public').style.display = tab === 'public' ? '' : 'none';
  document.getElementById('wrap-grid').style.display   = tab === 'grid'   ? '' : 'none';
  const fromId = tab === 'public' ? 'map-grid'   : 'map-public';
  const toId   = tab === 'public' ? 'map-public' : 'map-grid';
  const fromMap = MAPS[fromId];
  const toMap   = MAPS[toId];
  if (fromMap && toMap) {
    toMap.setView(fromMap.getCenter(), fromMap.getZoom(), { animate: false });
  }
  if (toMap) setTimeout(() => toMap.invalidateSize(), 50);
}

// ─── Custom heatmap (ללא leaflet.heat) ──────────────────────────────────────
function buildGradient(stops) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [pos, color] of Object.entries(stops)) g.addColorStop(+pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
}

const HEAT_GRAD = buildGradient({ 0.0: '#3b82f6', 0.4: '#22c55e', 0.7: '#eab308', 1.0: '#ef4444' });

function makeDot(R) {
  const c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0,   'rgba(0,0,0,1)');
  g.addColorStop(0.4, 'rgba(0,0,0,0.7)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, R * 2, R * 2);
  return c;
}

function drawHeatmap(map, canvas, points) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!points.length) return;
  const R = Math.max(4, Math.round((map.getZoom() - 5) * 1.5));
  const dot = makeDot(R);
  points.forEach(([lat, lng, w]) => {
    const p = map.latLngToContainerPoint(L.latLng(lat, lng));
    ctx.globalAlpha = Math.min(Math.max(w, 0.2), 1);
    ctx.drawImage(dot, p.x - R, p.y - R);
  });
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a > 0) {
      const j = Math.min(a, 255) * 4;
      d[i - 3] = HEAT_GRAD[j];
      d[i - 2] = HEAT_GRAD[j + 1];
      d[i - 1] = HEAT_GRAD[j + 2];
      d[i]     = Math.min(a + 80, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function attachHeatmap(mapId, map, points) {
  const container = document.getElementById(mapId);
  // Canvas goes in .map-wrap (parent), OUTSIDE Leaflet's overflow:hidden container
  const wrap = container.parentElement;
  const old = wrap.querySelector('.heat-canvas');
  if (old) old.remove();
  const canvas = document.createElement('canvas');
  canvas.className = 'heat-canvas';
  canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:999;';
  wrap.appendChild(canvas);
  let rafId = null;
  function redraw() {
    const W = container.offsetWidth;
    const H = container.offsetHeight;
    if (!W || !H) { rafId = null; return; } // skip while hidden
    canvas.width  = W;
    canvas.height = H;
    drawHeatmap(map, canvas, points);
    rafId = null;
  }
  function scheduleRedraw() {
    if (!rafId) rafId = requestAnimationFrame(redraw);
  }
  redraw();
  setTimeout(scheduleRedraw, 300);
  map.on('moveend zoomend resize move zoom', scheduleRedraw);
  return canvas;
}

// ─── Heatmap: public_locations ──────────────────────────────────────────────
async function loadPublicHeatmap(sb) {
  const { data, error } = await sb
    .from('public_locations')
    .select('latitude, longitude, popularity_score')
    .eq('is_active', true)
    .limit(2000);

  if (error) { console.error('public_locations error:', error); return; }
  if (!data?.length) {
    document.getElementById('map-public').innerHTML =
      '<div style="padding:20px;color:#555">אין נתונים ב-public_locations</div>';
    return;
  }

  const hasScores = data.some(r => (r.popularity_score || 0) > 0);
  const maxScore  = hasScores ? Math.max(...data.map(r => r.popularity_score || 0)) : 1;
  const points    = data.map(r => [
    r.latitude, r.longitude,
    hasScores ? Math.max((r.popularity_score || 0) / maxScore, 0.15) : 0.7,
  ]);

  const map  = initMap('map-public');
  const lats = data.map(r => r.latitude);
  const lngs = data.map(r => r.longitude);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  HEAT_BOUNDS['map-public'] = bounds;
  map.fitBounds(bounds, { padding: [20, 20], animate: false });
  attachHeatmap('map-public', map, points);
}

// ─── Heatmap: location_grid ─────────────────────────────────────────────────
async function loadGridHeatmap(sb, since30) {
  const { data, error } = await rpcLocationGrid(sb, since30, 5000);

  if (error && error.code !== '42P01') {
    console.error('location_grid error:', error);
  }

  if (!data?.length) {
    document.getElementById('grid-badge').textContent = 'אין נתונים עדיין';
    return;
  }

  document.getElementById('grid-badge').style.display = 'none';
  const cells = {};
  data.forEach(r => {
    const key = `${r.lat_grid},${r.lng_grid}`;
    cells[key] = (cells[key] || 0) + r.count;
  });
  const maxCount = Math.max(...Object.values(cells));
  const points = Object.entries(cells).map(([key, count]) => {
    const [lat, lng] = key.split(',').map(Number);
    return [lat, lng, count / maxCount];
  });
  const map = initMap('map-grid');
  const lats = points.map(p => p[0]);
  const lngs = points.map(p => p[1]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  HEAT_BOUNDS['map-grid'] = bounds;
  map.fitBounds(bounds, { padding: [20, 20], animate: false });
  attachHeatmap('map-grid', map, points);
}

