// ─── Init ──────────────────────────────────────────────────────────────────
(async () => {
  if (window.dashboardAuth && typeof window.dashboardAuth.ensureApprovedAccess === 'function') {
    const isApproved = await window.dashboardAuth.ensureApprovedAccess();
    if (!isApproved) return;
  }

  initDashboardExport();
  loadAll();
})();
