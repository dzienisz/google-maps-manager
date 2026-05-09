// background.js — Service Worker
// Manages: storage, message routing, side panel

'use strict';

// ── Install handler ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // Initialise storage if empty
  chrome.storage.local.get(['places', 'lists', 'stats'], (result) => {
    const defaults = {};
    if (!result.places) defaults.places = {};
    if (!result.lists) defaults.lists = {};
    if (!result.stats) defaults.stats = { total: 0, lastScan: null };
    if (Object.keys(defaults).length) {
      chrome.storage.local.set(defaults);
    }
  });
});

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    // ── Panel / button open ──────────────────────────────────────────────────
    case 'OPEN_PANEL':
      if (sender.tab && sender.tab.id) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        });
      }
      sendResponse({ ok: true });
      break;

    // ── Data capture ─────────────────────────────────────────────────────────
    case 'PLACES_CAPTURED':
      handlePlacesCaptured(msg.places, sendResponse);
      return true; // async

    // ── CRUD ─────────────────────────────────────────────────────────────────
    case 'GET_PLACES':
      getStoredPlaces(sendResponse);
      return true;

    case 'UPDATE_PLACE':
      updatePlace(msg.id, msg.data, sendResponse);
      return true;

    case 'DELETE_PLACE':
      deletePlaceFromStorage(msg.id, sendResponse);
      return true;

    case 'CLEAR_ALL_PLACES':
      chrome.storage.local.set({ places: {}, stats: { total: 0, lastScan: null } }, () => {
        sendResponse({ ok: true });
      });
      return true;

    // ── Lists ─────────────────────────────────────────────────────────────────
    case 'GET_LISTS':
      getLists(sendResponse);
      return true;

    case 'SAVE_LIST':
      saveList(msg.list, sendResponse);
      return true;

    case 'DELETE_LIST':
      deleteList(msg.listId, sendResponse);
      return true;

    case 'ADD_TO_LIST':
      addToList(msg.placeId, msg.listId, sendResponse);
      return true;

    case 'REMOVE_FROM_LIST':
      removeFromList(msg.placeId, msg.listId, sendResponse);
      return true;

    // ── Stats ─────────────────────────────────────────────────────────────────
    case 'GET_STATS':
      getStats(sendResponse);
      return true;

    // ── Trigger scan on active tab ────────────────────────────────────────────
    case 'SCAN_PAGE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_PAGE' }, (resp) => {
            sendResponse(resp || { count: 0 });
          });
        } else {
          sendResponse({ count: 0 });
        }
      });
      return true;

    // ── DOM actions forwarded to content script ───────────────────────────────
    case 'TRIGGER_DOM_ACTION':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, msg, () => {});
        }
      });
      sendResponse({ ok: true });
      break;

    // ── Navigate tab to a place ───────────────────────────────────────────────
    case 'OPEN_PLACE_IN_MAPS':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const url = msg.googleMapsUrl ||
            `https://www.google.com/maps/search/${encodeURIComponent(msg.title || '')}`;
          chrome.tabs.update(tabs[0].id, { url });
        }
      });
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type: ' + msg.type });
  }
});

// ── Storage helpers ───────────────────────────────────────────────────────────

async function handlePlacesCaptured(newPlaces, sendResponse) {
  if (!Array.isArray(newPlaces) || newPlaces.length === 0) {
    sendResponse({ inserted: 0, skipped: 0, total: 0 });
    return;
  }

  const { places = {} } = await chrome.storage.local.get(['places']);
  let inserted = 0,
    skipped = 0;
  const now = Date.now();

  for (const place of newPlaces) {
    if (!place.title) continue;
    const key = place.id || generateId(place);
    if (!places[key]) {
      places[key] = {
        ...place,
        id: key,
        status: 'active',
        lists: [],
        notes: '',
        capturedAt: now,
        updatedAt: now,
      };
      inserted++;
    } else {
      // Update coords/address if we now have better data
      const existing = places[key];
      let changed = false;
      if (!existing.lat && place.lat) { existing.lat = place.lat; changed = true; }
      if (!existing.lng && place.lng) { existing.lng = place.lng; changed = true; }
      if (!existing.address && place.address) { existing.address = place.address; changed = true; }
      if (!existing.googleMapsUrl && place.googleMapsUrl) { existing.googleMapsUrl = place.googleMapsUrl; changed = true; }
      if (changed) existing.updatedAt = now;
      skipped++;
    }
  }

  const total = Object.keys(places).length;
  await chrome.storage.local.set({
    places,
    stats: { total, lastScan: now },
  });
  sendResponse({ inserted, skipped, total });
}

function getStoredPlaces(sendResponse) {
  chrome.storage.local.get(['places'], ({ places = {} }) => {
    sendResponse({ places });
  });
}

function updatePlace(id, data, sendResponse) {
  chrome.storage.local.get(['places'], ({ places = {} }) => {
    if (!places[id]) {
      sendResponse({ error: 'Place not found' });
      return;
    }
    places[id] = { ...places[id], ...data, id, updatedAt: Date.now() };
    chrome.storage.local.set({ places }, () => sendResponse({ ok: true, place: places[id] }));
  });
}

function deletePlaceFromStorage(id, sendResponse) {
  chrome.storage.local.get(['places', 'lists'], ({ places = {}, lists = {} }) => {
    delete places[id];
    // Remove from all lists
    for (const list of Object.values(lists)) {
      if (list.placeIds) {
        list.placeIds = list.placeIds.filter((pid) => pid !== id);
      }
    }
    const total = Object.keys(places).length;
    chrome.storage.local.set({ places, lists, stats: { total, lastScan: Date.now() } }, () => {
      sendResponse({ ok: true, total });
    });
  });
}

function getLists(sendResponse) {
  chrome.storage.local.get(['lists'], ({ lists = {} }) => {
    sendResponse({ lists });
  });
}

function saveList(list, sendResponse) {
  chrome.storage.local.get(['lists'], ({ lists = {} }) => {
    const id = list.id || 'list_' + Date.now();
    lists[id] = { ...list, id, updatedAt: Date.now() };
    if (!lists[id].placeIds) lists[id].placeIds = [];
    if (!lists[id].createdAt) lists[id].createdAt = Date.now();
    chrome.storage.local.set({ lists }, () => sendResponse({ ok: true, list: lists[id] }));
  });
}

function deleteList(listId, sendResponse) {
  chrome.storage.local.get(['lists', 'places'], ({ lists = {}, places = {} }) => {
    delete lists[listId];
    // Remove list reference from all places
    for (const place of Object.values(places)) {
      if (place.lists) place.lists = place.lists.filter((lid) => lid !== listId);
    }
    chrome.storage.local.set({ lists, places }, () => sendResponse({ ok: true }));
  });
}

function addToList(placeId, listId, sendResponse) {
  chrome.storage.local.get(['places', 'lists'], ({ places = {}, lists = {} }) => {
    if (places[placeId]) {
      if (!places[placeId].lists) places[placeId].lists = [];
      if (!places[placeId].lists.includes(listId)) places[placeId].lists.push(listId);
    }
    if (lists[listId]) {
      if (!lists[listId].placeIds) lists[listId].placeIds = [];
      if (!lists[listId].placeIds.includes(placeId)) lists[listId].placeIds.push(placeId);
    }
    chrome.storage.local.set({ places, lists }, () => sendResponse({ ok: true }));
  });
}

function removeFromList(placeId, listId, sendResponse) {
  chrome.storage.local.get(['places', 'lists'], ({ places = {}, lists = {} }) => {
    if (places[placeId] && places[placeId].lists) {
      places[placeId].lists = places[placeId].lists.filter((lid) => lid !== listId);
    }
    if (lists[listId] && lists[listId].placeIds) {
      lists[listId].placeIds = lists[listId].placeIds.filter((pid) => pid !== placeId);
    }
    chrome.storage.local.set({ places, lists }, () => sendResponse({ ok: true }));
  });
}

function getStats(sendResponse) {
  chrome.storage.local.get(['stats', 'places'], ({ stats = {}, places = {} }) => {
    const total = Object.keys(places).length;
    sendResponse({ ...stats, total });
  });
}

// ── ID generation ─────────────────────────────────────────────────────────────
function generateId(place) {
  const str = (
    (place.title || '') +
    (place.lat || '') +
    (place.lng || '') +
    (place.googleMapsUrl || '')
  ).toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'p_' + Math.abs(hash).toString(36);
}
