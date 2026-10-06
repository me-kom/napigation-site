function getPublicSupabaseKey() {
  const candidates = [
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ].filter(Boolean);

  for (const key of candidates) {
    if (key.startsWith('sb_publishable_')) return key;

    const payload = key.split('.')[1];
    if (!payload) continue;

    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (claims.role === 'anon') return key;
    } catch {
      // Ignore malformed values and fail closed below.
    }
  }

  return null;
}

module.exports = function dashboardConfig(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('window.DASHBOARD_CONFIG_ERROR = true;');
  }

  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = getPublicSupabaseKey();
  const validUrl = typeof url === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);

  if (!validUrl || !key) {
    return res.status(503).send('window.DASHBOARD_CONFIG_ERROR = true;');
  }

  const config = { supabaseUrl: url, supabaseAnonKey: key };
  return res.status(200).send(`window.DASHBOARD_RUNTIME_CONFIG = ${JSON.stringify(config)};`);
};