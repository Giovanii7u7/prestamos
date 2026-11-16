const express = require('express');
const path = require('path');

const app = express();
const projectRoot = __dirname;
const supabaseBundle = path.join(
  projectRoot,
  'node_modules',
  '@supabase',
  'supabase-js',
  'dist',
  'umd',
  'supabase.js'
);

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

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(getPublicSupabaseConfig()) });
});

app.get('/config.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = getPublicSupabaseConfig();
  res.type('application/javascript').send(
    `window.APP_CONFIG = ${JSON.stringify(config || {})};`
  );
});

app.get('/vendor/supabase.js', (_req, res, next) => {
  res.sendFile(supabaseBundle, (error) => {
    if (error) next(error);
  });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'web.html'));
});

app.get('/app.js', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'app.js'));
});

app.use((_req, res) => {
  res.status(404).send('Not found');
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Prestamos web server listening on port ${port}`);
});
