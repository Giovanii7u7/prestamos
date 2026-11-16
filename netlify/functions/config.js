function getPublicSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') return null;
  if (key.startsWith('sb_secret_')) return null;

  const jwtParts = key.split('.');
  if (jwtParts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') return null;
    } catch {
      return null;
    }
  }

  return { supabaseUrl: parsedUrl.origin, supabaseKey: key };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
      body: 'Method Not Allowed'
    };
  }

  const config = getPublicSupabaseConfig();
  return {
    statusCode: config ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(config || { error: 'Supabase is not configured.' })
  };
};
