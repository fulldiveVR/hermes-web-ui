import Router from '@koa/router'

/**
 * Variant B SSO landing page. The hub-delivered link points here with a
 * single-use login token. This tiny page exchanges it for a tenant-scoped
 * web-ui JWT (POST /api/auth/sso), stores it the same way the SPA does
 * (localStorage hermes_api_key + active profile), and redirects to the app.
 * Served by the BFF so no SPA rebuild is required.
 */
export const ssoRoutes = new Router()

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing you in…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
  .card { text-align: center; }
  .err { color: #f87171; max-width: 32rem; }
</style></head>
<body>
  <div class="card">
    <h2 id="msg">Signing you in…</h2>
    <p id="detail"></p>
  </div>
  <script>
    (async () => {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');
      const msg = document.getElementById('msg');
      const detail = document.getElementById('detail');
      if (!token) { msg.textContent = 'Missing login token'; msg.className = 'err'; return; }
      try {
        const res = await fetch('/api/auth/sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || ('HTTP ' + res.status));
        }
        const data = await res.json();
        localStorage.setItem('hermes_api_key', data.token);
        if (data.profile) localStorage.setItem('hermes_active_profile_name', data.profile);
        location.replace('/');
      } catch (e) {
        msg.textContent = 'Sign-in failed';
        msg.className = 'err';
        detail.textContent = String(e && e.message || e);
        detail.className = 'err';
      }
    })();
  </script>
</body>
</html>`

ssoRoutes.get('/sso', (ctx) => {
  ctx.type = 'html'
  ctx.body = PAGE
})
