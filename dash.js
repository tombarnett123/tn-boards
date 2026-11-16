// Stand-in for the Claude Dashboard runtime, so the original TN dashboard pages run unchanged on a plain web host.
// Data files are AES-256-GCM encrypted (gzip inside). The key is in the page link after #k= and never reaches the server.
(function () {
  const cfg = window.DASH_CONFIG;            // {page, datasets: {id: 'data/x.bin'}, defaults: {...}}
  const store = {};                           // id -> {status, data}
  const calcs = [];                           // [{id, inputs, fn}]
  const draws = [];                           // [{name, fn}]
  const dataCbs = [];
  const LS = 'tn-dash-' + cfg.page;
  let params = Object.assign({}, cfg.defaults || {});
  try { Object.assign(params, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  Object.keys(cfg.datasets).forEach((id) => (store[id] = {status: 'loading', data: []}));

  const runCalcs = () => calcs.forEach((c) => {
    const ins = c.inputs.map((i) => store[i]);
    if (ins.every((x) => x && x.status === 'ok')) {
      try { store[c.id] = {status: 'ok', data: c.fn(...ins.map((x) => x.data))}; }
      catch (e) { console.error(e); store[c.id] = {status: 'error', data: []}; }
    } else store[c.id] = {status: ins.some((x) => x && x.status === 'error') ? 'error' : 'loading', data: []};
  });

  const render = () => {
    dataCbs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    draws.forEach((d) => document.querySelectorAll('[data-draw="' + d.name + '"]').forEach((el) => {
      try { d.fn(el); } catch (e) { console.error(e); }
    }));
  };
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } };

  window.dash = {
    data: (id) => store[id] || {status: 'missing', data: []},
    params: () => params,
    setParams: (p) => {
      params = Object.assign({}, params, p);
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
      try { localStorage.setItem(LS, JSON.stringify({person: params.person, cs: params.cs})); } catch (e) {}
      schedule();
    },
    calc: (id, def) => { calcs.push({id, inputs: def.inputs, fn: def.fn}); store[id] = {status: 'loading', data: []}; },
    draw: (name, fn) => { draws.push({name, fn}); schedule(); },
    onData: (fn) => { dataCbs.push(fn); schedule(); },
  };

  const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const keyText = (location.hash.match(/k=([A-Za-z0-9_-]+)/) || [])[1];
  const fail = (msg) => {
    Object.keys(cfg.datasets).forEach((id) => (store[id] = {status: 'error', data: []}));
    runCalcs(); schedule();
    const n = document.createElement('p');
    n.className = 'tn-banner'; n.textContent = msg;
    const put = () => (document.querySelector('.tn-band') || document.body).after(n);
    document.body ? put() : document.addEventListener('DOMContentLoaded', put);
  };
  if (!keyText) { fail('Open this dashboard from its Notion page.'); return; }

  crypto.subtle.importKey('raw', b64(keyText), 'AES-GCM', false, ['decrypt']).then((key) =>
    Promise.all(Object.entries(cfg.datasets).map(([id, path]) =>
      fetch(path + '?t=' + Math.floor(Date.now() / 300000), {cache: 'no-store'})
        .then((r) => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.arrayBuffer(); })
        .then((buf) => crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12)}, key, new Uint8Array(buf, 12)))
        .then((plain) => new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).json())
        .then((rows) => { store[id] = {status: 'ok', data: rows}; runCalcs(); schedule(); })
    ))
  ).catch((e) => { console.error(e); fail('This dashboard link is out of date. Open it again from its Notion page.'); });
})();

// Inside Notion (an embed), add a Full screen button that opens this same board in its own tab, edge to edge.
(function () {
  let framed = true; try { framed = window.top !== window.self; } catch (e) {}
  if (!framed) return;
  const add = () => {
    const band = document.querySelector('.tn-band'); if (!band) return;
    band.style.position = 'relative';
    const a = document.createElement('a');
    a.href = location.href; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Full screen ↗';
    a.style.cssText = 'position:absolute;top:22px;right:max(16px,3vw);font-family:var(--tn-head);font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:14px;color:var(--tn-black);background:var(--tn-orange);border-radius:6px;padding:10px 14px;text-decoration:none;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center';
    band.appendChild(a);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
})();
