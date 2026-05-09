// utils/storage.js — Chrome storage helpers used by panel.js
// All reads/writes go through background.js via chrome.runtime.sendMessage

'use strict';

const Storage = (() => {
  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[GMM] sendMessage error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Places ──────────────────────────────────────────────────────────────────
  async function getPlaces() {
    const resp = await send({ type: 'GET_PLACES' });
    return resp ? Object.values(resp.places || {}) : [];
  }

  async function updatePlace(id, data) {
    return send({ type: 'UPDATE_PLACE', id, data });
  }

  async function deletePlace(id) {
    return send({ type: 'DELETE_PLACE', id });
  }

  async function clearAllPlaces() {
    return send({ type: 'CLEAR_ALL_PLACES' });
  }

  // ── Lists ───────────────────────────────────────────────────────────────────
  async function getLists() {
    const resp = await send({ type: 'GET_LISTS' });
    return resp ? Object.values(resp.lists || {}) : [];
  }

  async function saveList(list) {
    return send({ type: 'SAVE_LIST', list });
  }

  async function deleteList(listId) {
    return send({ type: 'DELETE_LIST', listId });
  }

  async function addToList(placeId, listId) {
    return send({ type: 'ADD_TO_LIST', placeId, listId });
  }

  async function removeFromList(placeId, listId) {
    return send({ type: 'REMOVE_FROM_LIST', placeId, listId });
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  async function getStats() {
    return send({ type: 'GET_STATS' });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function scanPage() {
    return send({ type: 'SCAN_PAGE' });
  }

  async function openSidePanel() {
    return send({ type: 'OPEN_PANEL' });
  }

  async function triggerDomAction(action, placeTitle) {
    return send({ type: 'TRIGGER_DOM_ACTION', action, placeTitle });
  }

  async function openPlaceInMaps(place) {
    return send({
      type: 'OPEN_PLACE_IN_MAPS',
      googleMapsUrl: place.googleMapsUrl,
      title: place.title,
    });
  }

  return {
    getPlaces,
    updatePlace,
    deletePlace,
    clearAllPlaces,
    getLists,
    saveList,
    deleteList,
    addToList,
    removeFromList,
    getStats,
    scanPage,
    openSidePanel,
    triggerDomAction,
    openPlaceInMaps,
  };
})();
