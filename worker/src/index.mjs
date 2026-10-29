// Keep the existing Apps Script RPC contract; never accept a client-supplied upstream.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    };
    if (origin === env.ALLOWED_ORIGIN) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    const error = (status, message) => new Response(
      JSON.stringify({ success: false, error: message }), { status, headers });
    if (origin && origin !== env.ALLOWED_ORIGIN) return error(403, 'Origin not allowed.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return error(405, 'Use GET for the current RPC bridge.');
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/') return error(404, 'Unknown API path.');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(env.APPS_SCRIPT_URL || '')) {
      return error(503, 'API upstream is not configured.');
    }
    const upstream = new URL(env.APPS_SCRIPT_URL);
    if (incoming.searchParams.get('api') === 'ping') {
      upstream.searchParams.set('api', 'ping');
    } else {
      if (incoming.searchParams.get('action') !== 'rpc' ||
          !/^web[A-Za-z0-9_]+$/.test(incoming.searchParams.get('fn') || '')) {
        return error(400, 'Invalid RPC request.');
      }
      const args = incoming.searchParams.get('args') || '[]';
      try { if (!Array.isArray(JSON.parse(args))) throw new Error(); }
      catch { return error(400, 'RPC args must be a JSON array.'); }
      for (const [key, value] of [['action', 'rpc'], ['fn', incoming.searchParams.get('fn')], ['args', args]]) {
        upstream.searchParams.set(key, value);
      }
    }
    if (upstream.href.length > 7500) return error(414, 'RPC request is too large.');
    try {
      const response = await fetch(upstream, {
        method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(60000),
        headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      if (!response.ok) return error(502, 'Apps Script returned HTTP ' + response.status + '.');
      const payload = await response.json();
      if (!payload || typeof payload.success !== 'boolean') return error(502, 'Invalid Apps Script response.');
      return new Response(JSON.stringify(payload), { headers });
    } catch {
      // Never retry writes: a timed-out request may already have changed Sheets.
      return error(502, 'Could not read the Apps Script response. Check the app before retrying a change.');
    }
  }
};
