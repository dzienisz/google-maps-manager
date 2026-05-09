// inject.js — Runs in PAGE context (not extension context)
// Injected by content.js via <script> tag to access window.fetch and XHR

(function () {
  if (window.__gmm_injected) return;
  window.__gmm_injected = true;

  // ── Fetch interceptor ──────────────────────────────────────────────────────
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const response = await _fetch(input, init);
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
          ? input.url
          : '';

      const isMapsData =
        url.includes('/maps/') &&
        (url.includes('save') ||
          url.includes('preview') ||
          url.includes('place') ||
          url.includes('listugc') ||
          url.includes('getmapsentities'));

      if (isMapsData) {
        const clone = response.clone();
        clone
          .text()
          .then((text) => {
            const cleaned = text.startsWith(")]}'\n") ? text.slice(5) : text;
            try {
              const json = JSON.parse(cleaned);
              window.postMessage(
                { source: 'gmm-inject', type: 'API_RESPONSE', url, data: json },
                '*'
              );
            } catch (_) {
              // Not JSON — ignore
            }
          })
          .catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // ── XHR interceptor ───────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._gmmUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        if (this._gmmUrl && this._gmmUrl.includes('/maps/')) {
          const text = this.responseText;
          const cleaned =
            text && text.startsWith(")]}'\n") ? text.slice(5) : text;
          try {
            const json = JSON.parse(cleaned);
            window.postMessage(
              {
                source: 'gmm-inject',
                type: 'API_RESPONSE',
                url: this._gmmUrl,
                data: json,
              },
              '*'
            );
          } catch (_) {}
        }
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };

  // ── URL change detector ───────────────────────────────────────────────────
  // Google Maps is a SPA — detect navigation via pushState/replaceState
  const _pushState = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _pushState(...args);
    window.postMessage({ source: 'gmm-inject', type: 'URL_CHANGED', url: location.href }, '*');
  };

  history.replaceState = function (...args) {
    _replaceState(...args);
    window.postMessage({ source: 'gmm-inject', type: 'URL_CHANGED', url: location.href }, '*');
  };

  window.addEventListener('popstate', () => {
    window.postMessage({ source: 'gmm-inject', type: 'URL_CHANGED', url: location.href }, '*');
  });
})();
