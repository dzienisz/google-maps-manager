// content.js — Content script running on google.com/maps
// Responsibilities:
//   1. Inject inject.js into page context
//   2. Forward API intercept messages to background
//   3. DOM observer for saved places
//   4. Floating toolbar button
//   5. Handle DOM-action commands from background/panel

(function () {
  'use strict';

  // ── 1. Inject inject.js into page context ────────────────────────────────
  function injectScript() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  injectScript();

  // ── 2. Listen for messages from inject.js ────────────────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'gmm-inject') return;

    const msg = event.data;

    if (msg.type === 'API_RESPONSE') {
      // Try to extract places from the API response data
      const places = parseApiResponse(msg.url, msg.data);
      if (places.length > 0) {
        chrome.runtime.sendMessage({ type: 'PLACES_CAPTURED', places });
      }
      // Also forward raw data in case panel wants it
      chrome.runtime.sendMessage({ type: 'RAW_API_RESPONSE', url: msg.url }).catch(() => {});
    }

    if (msg.type === 'URL_CHANGED') {
      // Slight delay to let DOM settle after SPA navigation
      setTimeout(() => {
        if (msg.url && (msg.url.includes('/saved') || msg.url.includes('saved/'))) {
          scanCurrentPage();
        }
      }, 1200);
    }
  });

  // ── 3. DOM Observer ───────────────────────────────────────────────────────
  let lastUrl = location.href;
  let scanDebounce = null;

  const observer = new MutationObserver(() => {
    // Detect URL changes in this SPA
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (lastUrl.includes('/saved') || lastUrl.includes('saved/')) {
        clearTimeout(scanDebounce);
        scanDebounce = setTimeout(scanCurrentPage, 1500);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── 4. Floating toolbar button ────────────────────────────────────────────
  function addToolbarButton() {
    if (document.getElementById('gmm-open-panel')) return;

    const btn = document.createElement('button');
    btn.id = 'gmm-open-panel';
    btn.title = 'Google Maps Manager – zarządzaj miejscami';
    btn.innerHTML = '📍 Zarządzaj miejscami';
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:9999',
      'background:#4285F4',
      'color:white',
      'border:none',
      'border-radius:50px',
      'padding:12px 20px',
      'font-size:14px',
      'font-family:Google Sans,Roboto,sans-serif',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'transition:background 0.2s',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#1a73e8';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#4285F4';
    });

    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_PANEL' });
    });

    document.body.appendChild(btn);
  }

  // Wait for Maps to render before adding button
  function tryAddButton(attempts) {
    if (document.body) {
      addToolbarButton();
    } else if (attempts > 0) {
      setTimeout(() => tryAddButton(attempts - 1), 500);
    }
  }
  tryAddButton(10);

  // ── 5. Handle commands from background/panel ──────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCAN_PAGE') {
      const places = scanCurrentPage();
      sendResponse({ places, count: places.length });
      return true;
    }

    if (msg.type === 'TRIGGER_DOM_ACTION') {
      handleDomAction(msg);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'OPEN_PLACE') {
      if (msg.googleMapsUrl) {
        window.location.href = msg.googleMapsUrl;
      } else if (msg.title) {
        window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(msg.title)}`;
      }
      sendResponse({ ok: true });
      return true;
    }
  });

  // ── Scan current page DOM for saved places ─────────────────────────────────
  function scanCurrentPage() {
    const places = [];
    const seen = new Set();

    // Strategy 1: role="article" or role="listitem" with headings
    const articles = document.querySelectorAll(
      '[role="article"], [role="listitem"], [role="row"]'
    );
    articles.forEach((el) => {
      const place = extractPlaceFromElement(el);
      if (place && place.title && !seen.has(place.title)) {
        seen.add(place.title);
        places.push(place);
      }
    });

    // Strategy 2: anchor elements with /maps/place/ href
    document.querySelectorAll('a[href*="/maps/place/"]').forEach((anchor) => {
      const href = anchor.href;
      const place = extractPlaceFromAnchor(anchor, href);
      if (place && place.title && !seen.has(place.title)) {
        seen.add(place.title);
        places.push(place);
      }
    });

    // Strategy 3: aria-label attributes that look like place names
    document
      .querySelectorAll('[aria-label][data-hveid], [aria-label][jsaction]')
      .forEach((el) => {
        const label = el.getAttribute('aria-label');
        if (label && label.length > 2 && label.length < 100) {
          const place = {
            title: label,
            address: '',
            lat: null,
            lng: null,
            googleMapsUrl: '',
            category: '',
          };
          if (!seen.has(place.title)) {
            seen.add(place.title);
            places.push(place);
          }
        }
      });

    if (places.length > 0) {
      chrome.runtime.sendMessage({ type: 'PLACES_CAPTURED', places });
    }

    return places;
  }

  // Extract place data from a list-item / article element
  function extractPlaceFromElement(el) {
    // Look for a heading: h1-h4 or element with role="heading"
    const headingEl =
      el.querySelector('[role="heading"]') ||
      el.querySelector('h1,h2,h3,h4') ||
      el.querySelector('[aria-level]');

    const title = headingEl
      ? headingEl.textContent.trim()
      : el.getAttribute('aria-label') || '';
    if (!title) return null;

    // Look for address text (typically a span/div below heading)
    let address = '';
    const spans = el.querySelectorAll('span, div');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (
        text &&
        text !== title &&
        text.length > 5 &&
        text.length < 150 &&
        /\d/.test(text)
      ) {
        address = text;
        break;
      }
    }

    // Look for coords in data attributes or URL
    let lat = null,
      lng = null,
      googleMapsUrl = '';
    const anchor = el.querySelector('a[href*="/maps/"]');
    if (anchor) {
      googleMapsUrl = anchor.href;
      const coords = extractCoordsFromUrl(anchor.href);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    // data-lat / data-lng attributes (used by some Maps versions)
    if (el.dataset.lat) lat = parseFloat(el.dataset.lat);
    if (el.dataset.lng) lng = parseFloat(el.dataset.lng);

    return { title, address, lat, lng, googleMapsUrl, category: '' };
  }

  function extractPlaceFromAnchor(anchor, href) {
    const title =
      anchor.getAttribute('aria-label') ||
      anchor.title ||
      anchor.textContent.trim();
    if (!title) return null;

    const coords = extractCoordsFromUrl(href);
    return {
      title,
      address: '',
      lat: coords ? coords.lat : null,
      lng: coords ? coords.lng : null,
      googleMapsUrl: href,
      category: '',
    };
  }

  function extractCoordsFromUrl(url) {
    if (!url) return null;
    // @lat,lng or !3dlat!4dlng patterns
    let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    return null;
  }

  // ── Parse API response for places ─────────────────────────────────────────
  function parseApiResponse(url, data) {
    const places = [];
    if (!data || typeof data !== 'object') return places;

    // Google Maps internal API responses are deeply nested arrays
    // We do a recursive search for structures that look like saved places
    traverseForPlaces(data, places, new Set(), 0);
    return places;
  }

  function traverseForPlaces(node, places, seen, depth) {
    if (depth > 12 || !node) return;

    if (Array.isArray(node)) {
      // A "place" array entry typically has: [name, ..., address, ..., [lat, lng]]
      // Look for arrays containing a string (title) + coordinate sub-array
      if (node.length >= 2 && typeof node[0] === 'string' && node[0].length > 1) {
        const candidate = tryExtractPlace(node);
        if (candidate) {
          const key = candidate.title + (candidate.lat || '') + (candidate.lng || '');
          if (!seen.has(key)) {
            seen.add(key);
            places.push(candidate);
          }
          return;
        }
      }
      node.forEach((child) => traverseForPlaces(child, places, seen, depth + 1));
    } else if (typeof node === 'object') {
      Object.values(node).forEach((val) =>
        traverseForPlaces(val, places, seen, depth + 1)
      );
    }
  }

  function tryExtractPlace(arr) {
    // Heuristic: first element is title string, somewhere has lat/lng pair
    const title = typeof arr[0] === 'string' ? arr[0].trim() : null;
    if (!title || title.length < 2 || title.length > 200) return null;

    let lat = null,
      lng = null,
      address = '',
      url = '';

    // Scan all elements in arr for coordinates (numbers in plausible range)
    const flatNums = [];
    JSON.stringify(arr, (_, v) => {
      if (typeof v === 'number') flatNums.push(v);
      return v;
    });

    for (let i = 0; i < flatNums.length - 1; i++) {
      const a = flatNums[i],
        b = flatNums[i + 1];
      if (
        a >= -90 && a <= 90 && Math.abs(a) > 0.001 &&
        b >= -180 && b <= 180 && Math.abs(b) > 0.001
      ) {
        lat = a;
        lng = b;
        break;
      }
    }

    // Look for address string and URL
    JSON.stringify(arr, (_, v) => {
      if (typeof v === 'string') {
        if (!address && v.length > 5 && v.length < 200 && v !== title && /\d/.test(v)) {
          address = v;
        }
        if (!url && v.includes('/maps/place/')) url = v;
      }
      return v;
    });

    if (!lat && !address) return null; // Not enough data
    return { title, address, lat, lng, googleMapsUrl: url, category: '' };
  }

  // ── DOM action handler ─────────────────────────────────────────────────────
  function handleDomAction(msg) {
    if (msg.action === 'DELETE_PLACE') {
      findAndClickDelete(msg.placeTitle);
    } else if (msg.action === 'MARK_OUTDATED') {
      // Can't directly interact with Google Maps state for this
      // Just show a toast — actual marking is done in extension storage
    }
  }

  function findAndClickDelete(title) {
    if (!title) return;
    const allElements = document.querySelectorAll(
      '[role="article"], [role="listitem"], [data-hveid]'
    );

    for (const el of allElements) {
      const text = el.textContent || '';
      if (text.includes(title)) {
        // Look for a "more options" / kebab menu button
        const moreBtn = el.querySelector(
          '[aria-label*="More"], [aria-label*="Więcej"], [aria-label*="Options"], button[jsaction*="pane"]'
        );
        if (moreBtn) {
          moreBtn.click();
          // After menu opens, look for Delete/Remove option
          setTimeout(() => {
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            for (const item of menuItems) {
              const t = item.textContent.toLowerCase();
              if (t.includes('remove') || t.includes('delete') || t.includes('usuń')) {
                item.click();
                return;
              }
            }
          }, 400);
          return;
        }
      }
    }
  }
})();
