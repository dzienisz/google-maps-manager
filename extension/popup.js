// popup.js — Extension toolbar popup logic

'use strict';

async function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}

async function init() {
  // Check if current tab is Google Maps
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnMaps =
    tab &&
    tab.url &&
    (tab.url.startsWith('https://www.google.com/maps') ||
      tab.url.startsWith('https://maps.google.com'));

  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const scanBtn = document.getElementById('scan-btn');

  if (isOnMaps) {
    statusDot.className = 'status-dot ok';
    statusText.textContent = '✓ Jesteś na Google Maps';
    scanBtn.disabled = false;
  } else {
    statusDot.className = 'status-dot warning';
    statusText.textContent = '⚠ Otwórz google.com/maps';
    scanBtn.disabled = true;
    scanBtn.title = 'Działa tylko na Google Maps';
  }

  // Load stats
  const stats = await sendMessage({ type: 'GET_STATS' });
  const places = stats ? (stats.total || 0) : 0;

  document.getElementById('stat-places').textContent = places;

  // Quick duplicate count from storage
  const placesResp = await sendMessage({ type: 'GET_PLACES' });
  const allPlaces = placesResp ? Object.values(placesResp.places || {}) : [];
  const dupGroups = Duplicates.findDuplicates(allPlaces);
  const dupCount = dupGroups.reduce((acc, g) => acc + g.length - 1, 0);
  document.getElementById('stat-dups').textContent = dupCount;

  // Last scan
  if (stats && stats.lastScan) {
    const d = new Date(stats.lastScan);
    document.getElementById('last-scan').textContent =
      'Ostatni skan: ' + d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  // Open panel
  document.getElementById('open-panel-btn').addEventListener('click', async () => {
    if (tab && tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
    window.close();
  });

  // Scan
  document.getElementById('scan-btn').addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Skanowanie…';
    const result = await sendMessage({ type: 'SCAN_PAGE' });
    const count = result ? (result.count || 0) : 0;
    scanBtn.textContent = `✓ Znaleziono ${count} miejsc`;
    setTimeout(() => window.close(), 1200);
  });
}

document.addEventListener('DOMContentLoaded', init);
