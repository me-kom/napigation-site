(function () {
  const STORAGE_KEY = 'napigation_dashboard_access';

  const DASHBOARD_CLIENT = window.supabase.createClient(
    window.DASHBOARD_SUPABASE_URL,
    window.DASHBOARD_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }
  );

  function setDashboardAccessGranted() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (error) {
      console.warn('dashboard localStorage write failed:', error);
    }
  }

  function clearDashboardAccess() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('dashboard localStorage clear failed:', error);
    }
  }

  function isDashboardAccessGranted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  async function ensureApprovedAccess() {
    if (isDashboardAccessGranted()) {
      return true;
    }

    window.location.href = '/dashboard/auth';
    return false;
  }

  async function renderSignedInUser() {
    const userPill = document.getElementById('dashboard-user-pill');
    if (!userPill) return;
    userPill.textContent = 'גישה מאושרת';
  }

  async function signOutDashboard() {
    clearDashboardAccess();
    window.location.href = '/dashboard/auth';
  }

  function bindAuthPage() {
    const form = document.getElementById('dashboard-login-form');
    if (!form) return;

    const passwordField = document.getElementById('dashboard-password');
    const errorBox = document.getElementById('dashboard-auth-error');
    const submitBtn = document.getElementById('dashboard-login-btn');

    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'not-approved') {
      errorBox.textContent = 'הסיסמה שגויה או שאין הרשאה. נסה שוב.';
      errorBox.style.display = 'block';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = (passwordField.value || '').trim();

      if (!password) {
        errorBox.textContent = 'יש להזין סיסמה.';
        errorBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'בודק סיסמה...';
      errorBox.style.display = 'none';

      try {
        const { data, error } = await DASHBOARD_CLIENT.rpc('dashboard_password_ok', {
          candidate_password: password,
        });

        if (error) {
          throw new Error(error.message || 'הבדיקה מול המסד נכשלה.');
        }

        if (!data) {
          clearDashboardAccess();
          throw new Error('הסיסמה שגויה.');
        }

        setDashboardAccessGranted();
        window.location.href = '/dashboard';
      } catch (error) {
        errorBox.textContent = error?.message || 'התחברות נכשלה. נסה שוב.';
        errorBox.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'התחברות';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const isAuthPage = !!document.getElementById('dashboard-login-form');

    if (isAuthPage) {
      bindAuthPage();
      return;
    }

    const signOutButton = document.getElementById('dashboard-signout');
    if (signOutButton) {
      signOutButton.addEventListener('click', signOutDashboard);
    }

    const statusBadge = document.getElementById('dashboard-status-badge');
    if (statusBadge) {
      statusBadge.style.display = 'inline-block';
      statusBadge.textContent = 'בודק הרשאה...';
    }

    const approved = await ensureApprovedAccess();
    if (!approved) return;

    if (statusBadge) {
      statusBadge.textContent = 'גישה מאושרת';
    }

    await renderSignedInUser();
  });

  window.dashboardAuth = {
    ensureApprovedAccess,
    renderSignedInUser,
    signOutDashboard,
    isDashboardAccessGranted,
    client: DASHBOARD_CLIENT,
  };
})();
