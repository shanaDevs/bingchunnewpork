'use strict';

/**
 * Page hooks:
 * 1) Direct sticker print (no agent)
 * 2) Keep page "visible" so React Query + Socket.IO stay live in Electron
 */
const FETCH_HOOK = `(() => {
  if (window.__bcCashierHooks) return;
  if (!window.bingchunCashier || !window.bingchunCashier.printsDirect) return;
  window.__bcCashierHooks = true;

  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'visible'; } });
  } catch (e) { /* ignore */ }

  const origFetch = window.fetch.bind(window);

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    try { return String(input); } catch (e) { return ''; }
  }

  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function isCupStickerStatus(url) {
    return /\\/admin\\/cup-sticker-agent\\/status(\\?|$)/.test(url);
  }

  function isCupStickerJobCreate(url, method) {
    if (method !== 'POST') return false;
    // Exact create endpoint only — never hijack /orders or other admin APIs
    return /\\/admin\\/cup-sticker-jobs\\/?(\\?|$)/.test(url)
      && !/\\/admin\\/cup-sticker-jobs\\/[^/?]+/.test(url);
  }

  function isCupStickerJobPoll(url, method) {
    return method === 'GET' && /\\/admin\\/cup-sticker-jobs\\/[^/?]+/.test(url);
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (proto && proto.set) proto.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Prefill staff login from desktop saved credentials
  window.bingchunCashier.getSavedLogin().then(function (saved) {
    if (!saved || !saved.remember || !saved.email) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var email = document.querySelector('input[type="email"]');
      var password = document.querySelector('input[type="password"]');
      if (email || password) {
        if (email && !email.value) setNativeValue(email, saved.email);
        if (password && !password.value && saved.password) setNativeValue(password, saved.password);
        clearInterval(timer);
      }
      if (tries > 40) clearInterval(timer);
    }, 250);
  }).catch(function () {});

  window.fetch = async function (input, init) {
    const url = urlOf(input);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    // Remember login credentials after successful staff sign-in
    if (method === 'POST' && /\\/auth\\/admin\\/login(\\?|$)/.test(url)) {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
      const res = await origFetch(input, init);
      if (res.ok && body.email) {
        try {
          await window.bingchunCashier.saveLogin({
            remember: true,
            email: body.email,
            password: body.password || '',
          });
        } catch (e) { /* ignore */ }
      }
      return res;
    }

    if (!isCupStickerStatus(url) && !isCupStickerJobCreate(url, method) && !isCupStickerJobPoll(url, method)) {
      return origFetch(input, init);
    }

    try {
      if (isCupStickerStatus(url)) {
        const cfg = await window.bingchunCashier.getConfig();
        const printer = (cfg && cfg.printerName) || 'Windows default';
        return jsonResponse({
          online: true,
          lastSeenAt: Date.now(),
          printerName: printer,
          printerHint: 'Electron direct print (no agent)',
        });
      }

      if (isCupStickerJobCreate(url, method)) {
        let body = {};
        try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
        const stickers = Array.isArray(body.stickers) ? body.stickers : [];
        const result = await window.bingchunCashier.printStickers(stickers);
        const id = 'electron-' + Date.now();
        window.__bcLastElectronPrint = { id, printed: (result && result.printed) || stickers.length };
        return jsonResponse({ id });
      }

      if (isCupStickerJobPoll(url, method)) {
        const last = window.__bcLastElectronPrint || { id: 'electron', printed: 0 };
        return jsonResponse({ id: last.id, status: 'done', printed: last.printed || 0 });
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (isCupStickerJobCreate(url, method)) {
        return jsonResponse({ error: msg }, 500);
      }
      // Never break unrelated APIs
      return origFetch(input, init);
    }

    return origFetch(input, init);
  };
})();`;

module.exports = { FETCH_HOOK };
