(function () {
  const SUPABASE_URL = window.DASHBOARD_SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.DASHBOARD_SUPABASE_ANON_KEY;

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { session: null, error };
    }
    return { session: data.session, error: null };
  }

  async function isApprovedUser() {
    try {
      const { data: isAllowed, error: accessError } = await supabase.rpc('dashboard_access_allowed');
      return !accessError && !!isAllowed;
    } catch (e) {
      console.error('Dashboard approval check failed:', e);
      return false;
    }
  }

  async function ensureApprovedAccess() {
    const { session, error } = await getSession();
    if (error || !session?.user) {
      window.location.href = '/dashboard/auth';
      return false;
    }

    const isAllowed = await isApprovedUser();
    if (!isAllowed) {
      await supabase.auth.signOut();
      window.location.href = '/dashboard/auth?error=not-approved';
      return false;
    }

    return true;
  }

  async function maybeRedirectApprovedUser() {
    const { session, error } = await getSession();
    if (error || !session?.user) return false;

    const isAllowed = await isApprovedUser();
    if (isAllowed) {
      window.location.replace('/dashboard');
      return true;
    }

    await supabase.auth.signOut();
    return false;
  }

  async function renderSignedInUser() {
    const userPill = document.getElementById('dashboard-user-pill');
    if (!userPill) return;

    const { session } = await getSession();
    if (!session?.user?.email) {
      userPill.textContent = 'לא מחובר';
      return;
    }

    userPill.textContent = `מחובר: ${session.user.email}`;
  }

  async function signOutDashboard() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out failed:', error.message);
      return;
    }
    window.location.href = '/dashboard/auth';
  }

  function bindAuthPage() {
    const form = document.getElementById('dashboard-login-form');
    if (!form) return;

    const emailField = document.getElementById('dashboard-email');
    const passwordField = document.getElementById('dashboard-password');
    const errorBox = document.getElementById('dashboard-auth-error');
    const submitBtn = document.getElementById('dashboard-login-btn');

    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'not-approved') {
      errorBox.textContent = 'החשבון לא אושר לגישה לדשבורד. בקש הרשאה ממנהל המערכת.';
      errorBox.style.display = 'block';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = (emailField.value || '').trim();
      const password = passwordField.value || '';

      if (!email || !password) {
        errorBox.textContent = 'יש להזין אימייל וסיסמה.';
        errorBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'מתחבר...';
      errorBox.style.display = 'none';

      try {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password,
        });

        if (signInError || !data.user) {
          throw signInError || new Error('התחברות נכשלה.');
        }

        const isAllowed = await isApprovedUser();
        if (!isAllowed) {
          await supabase.auth.signOut();
          throw new Error('החשבון לא אושר לגישה לדשבורד.');
        }

        window.location.href = '/dashboard';
      } catch (error) {
        errorBox.textContent = error?.message || 'התחברות נכשלה. בדוק את הפרטים ונסה שוב.';
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
      const alreadyApproved = await maybeRedirectApprovedUser();
      if (alreadyApproved) return;
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
    supabase,
  };
})();
