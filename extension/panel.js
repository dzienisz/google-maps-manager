// panel.js — Side panel app (vanilla JS, no dependencies)
// Communicates with background.js via Storage helpers (utils/storage.js)

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  places: [],       // all places (array)
  lists: [],        // all lists (array)
  filter: 'all',    // 'all' | 'active' | 'outdated'
  listFilter: '',   // list id or ''
  search: '',
  selected: new Set(),
  dupGroups: [],
  selectedListColor: '#4285F4',
  openMenu: null,   // place id with open dropdown
  exportScope: 'all',
  exportListId: '',
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initPlacesTab();
  initDuplicatesTab();
  initListsTab();
  initExportTab();
  await loadAll();

  // Auto-scan when panel opens
  const scanResult = await Storage.scanPage();
  if (scanResult && scanResult.count > 0) {
    showToast(`Zeskanowano ${scanResult.count} miejsc`, 'success');
    await loadAll();
  }
});

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [places, lists] = await Promise.all([
    Storage.getPlaces(),
    Storage.getLists(),
  ]);
  state.places = places;
  state.lists = lists;
  renderAll();
}

function renderAll() {
  renderPlaces();
  renderLists();
  updateBadges();
  updateListSelects();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');

      // Close any open dropdown
      closeAllMenus();
    });
  });
}

// ── Places tab ────────────────────────────────────────────────────────────────
function initPlacesTab() {
  // Search
  document.getElementById('places-search').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderPlaces();
  });

  // Status filter buttons
  document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderPlaces();
    });
  });

  // List filter dropdown
  document.getElementById('places-list-filter').addEventListener('change', (e) => {
    state.listFilter = e.target.value;
    renderPlaces();
  });

  // Select all
  document.getElementById('select-all-btn').addEventListener('click', () => {
    const visible = getFilteredPlaces();
    if (state.selected.size === visible.length) {
      state.selected.clear();
    } else {
      visible.forEach((p) => state.selected.add(p.id));
    }
    renderPlaces();
    updateBulkBar();
  });

  // Header scan button
  document.getElementById('header-scan-btn').addEventListener('click', async () => {
    const btn = document.getElementById('header-scan-btn');
    btn.classList.add('scanning');
    btn.textContent = '⏳ Skanowanie…';
    const result = await Storage.scanPage();
    await loadAll();
    btn.classList.remove('scanning');
    btn.textContent = '🔍 Skanuj';
    const msg = result
      ? `Znaleziono ${result.count || 0} miejsc (łącznie: ${state.places.length})`
      : 'Skanowanie zakończone';
    showToast(msg);
  });

  // Bulk actions
  document.getElementById('bulk-mark-outdated').addEventListener('click', bulkMarkOutdated);
  document.getElementById('bulk-add-list').addEventListener('click', bulkAddToList);
  document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
}

function getFilteredPlaces() {
  return state.places.filter((p) => {
    if (state.filter === 'active' && p.status !== 'active') return false;
    if (state.filter === 'outdated' && p.status !== 'outdated') return false;
    if (state.listFilter && !(p.lists || []).includes(state.listFilter)) return false;
    if (state.search) {
      const hay = ((p.title || '') + ' ' + (p.address || '')).toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  });
}

function renderPlaces() {
  const container = document.getElementById('place-list');
  const empty = document.getElementById('empty-places');
  const countEl = document.getElementById('places-count');

  const places = getFilteredPlaces();
  countEl.textContent = `${places.length} ${pluralMiejsc(places.length)}`;

  if (places.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = '';
  places.forEach((place) => container.appendChild(buildPlaceCard(place)));
  updateBulkBar();
}

function buildPlaceCard(place) {
  const isSelected = state.selected.has(place.id);
  const listNames = (place.lists || [])
    .map((lid) => state.lists.find((l) => l.id === lid))
    .filter(Boolean)
    .map((l) => l.name)
    .slice(0, 2);

  const card = document.createElement('div');
  card.className = `place-card${place.status === 'outdated' ? ' outdated' : ''}${isSelected ? ' selected' : ''}`;
  card.dataset.id = place.id;

  card.innerHTML = `
    <input type="checkbox" class="place-checkbox" ${isSelected ? 'checked' : ''} aria-label="Zaznacz ${escHtml(place.title)}">
    <div class="place-info">
      <div class="place-title" title="${escHtml(place.title)}">${escHtml(place.title)}</div>
      ${place.address ? `<div class="place-address" title="${escHtml(place.address)}">${escHtml(place.address)}</div>` : ''}
      <div class="place-meta">
        <span class="status-badge ${place.status || 'active'}">${place.status === 'outdated' ? 'Nieaktualne' : 'Aktywne'}</span>
        ${listNames.map((n) => `<span class="list-chip">${escHtml(n)}</span>`).join('')}
      </div>
    </div>
    <button class="place-menu-btn" aria-label="Opcje dla ${escHtml(place.title)}" data-id="${place.id}">⋮</button>
  `;

  // Checkbox
  card.querySelector('.place-checkbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      state.selected.add(place.id);
    } else {
      state.selected.delete(place.id);
    }
    card.classList.toggle('selected', e.target.checked);
    updateBulkBar();
  });

  // Menu button
  card.querySelector('.place-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlaceMenu(place, card);
  });

  return card;
}

function togglePlaceMenu(place, card) {
  closeAllMenus();
  if (state.openMenu === place.id) {
    state.openMenu = null;
    return;
  }
  state.openMenu = place.id;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.innerHTML = `
    <button class="dropdown-item" data-action="open">
      <span class="icon">🗺️</span> Otwórz w Maps
    </button>
    <button class="dropdown-item" data-action="toggle-status">
      <span class="icon">${place.status === 'outdated' ? '✅' : '⚠️'}</span>
      ${place.status === 'outdated' ? 'Oznacz jako aktywne' : 'Oznacz jako nieaktualne'}
    </button>
    <button class="dropdown-item" data-action="add-list">
      <span class="icon">📂</span> Dodaj do listy
    </button>
    <button class="dropdown-item" data-action="edit-notes">
      <span class="icon">📝</span> Notatki
    </button>
    <button class="dropdown-item danger" data-action="delete">
      <span class="icon">🗑️</span> Usuń z rozszerzenia
    </button>
  `;

  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    closeAllMenus();

    const action = btn.dataset.action;
    if (action === 'open') {
      await Storage.openPlaceInMaps(place);
    } else if (action === 'toggle-status') {
      const newStatus = place.status === 'outdated' ? 'active' : 'outdated';
      await Storage.updatePlace(place.id, { status: newStatus });
      showToast(newStatus === 'outdated' ? 'Oznaczono jako nieaktualne' : 'Oznaczono jako aktywne');
      await loadAll();
    } else if (action === 'add-list') {
      showAddToListDialog(place.id);
    } else if (action === 'edit-notes') {
      showNotesDialog(place);
    } else if (action === 'delete') {
      if (confirm(`Usunąć „${place.title}" z rozszerzenia?`)) {
        await Storage.deletePlace(place.id);
        state.selected.delete(place.id);
        showToast('Miejsce usunięte', 'success');
        await loadAll();
      }
    }
  });

  card.style.position = 'relative';
  card.appendChild(menu);
}

function closeAllMenus() {
  document.querySelectorAll('.dropdown-menu').forEach((m) => m.remove());
  state.openMenu = null;
}

document.addEventListener('click', closeAllMenus);

// ── Bulk actions ──────────────────────────────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = state.selected.size;
  document.getElementById('bulk-count').textContent = `${count} zaznaczonych`;
  bar.classList.toggle('visible', count > 0);
}

async function bulkMarkOutdated() {
  if (!state.selected.size) return;
  const ids = [...state.selected];
  await Promise.all(ids.map((id) => Storage.updatePlace(id, { status: 'outdated' })));
  state.selected.clear();
  showToast(`${ids.length} miejsc oznaczonych jako nieaktualne`);
  await loadAll();
}

async function bulkDelete() {
  if (!state.selected.size) return;
  const ids = [...state.selected];
  if (!confirm(`Usunąć ${ids.length} miejsc z rozszerzenia?`)) return;
  await Promise.all(ids.map((id) => Storage.deletePlace(id)));
  state.selected.clear();
  showToast(`Usunięto ${ids.length} miejsc`, 'success');
  await loadAll();
}

async function bulkAddToList() {
  if (!state.selected.size || !state.lists.length) {
    showToast('Najpierw utwórz listę', 'warn');
    return;
  }
  showBulkAddToListDialog([...state.selected]);
}

function showAddToListDialog(placeId) {
  if (!state.lists.length) {
    showToast('Najpierw utwórz listę w zakładce „Listy"', 'warn');
    return;
  }
  const opts = state.lists
    .map((l) => `<option value="${l.id}">${escHtml(l.name)}</option>`)
    .join('');
  const sel = window.prompt(
    'Wybierz listę:\n' + state.lists.map((l, i) => `${i + 1}. ${l.name}`).join('\n') + '\n\nWpisz numer:'
  );
  if (!sel) return;
  const idx = parseInt(sel, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= state.lists.length) return;
  Storage.addToList(placeId, state.lists[idx].id).then(() => {
    showToast('Dodano do listy', 'success');
    loadAll();
  });
}

function showBulkAddToListDialog(ids) {
  const sel = window.prompt(
    'Dodaj do listy:\n' + state.lists.map((l, i) => `${i + 1}. ${l.name}`).join('\n') + '\n\nWpisz numer:'
  );
  if (!sel) return;
  const idx = parseInt(sel, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= state.lists.length) return;
  const listId = state.lists[idx].id;
  Promise.all(ids.map((id) => Storage.addToList(id, listId))).then(() => {
    showToast(`Dodano ${ids.length} miejsc do listy`, 'success');
    state.selected.clear();
    loadAll();
  });
}

function showNotesDialog(place) {
  const notes = window.prompt('Notatki dla „' + place.title + '":', place.notes || '');
  if (notes === null) return;
  Storage.updatePlace(place.id, { notes }).then(() => {
    showToast('Notatki zapisane', 'success');
    loadAll();
  });
}

// ── Duplicates tab ────────────────────────────────────────────────────────────
function initDuplicatesTab() {
  document.getElementById('find-dups-btn').addEventListener('click', runDuplicateFinder);
}

function runDuplicateFinder() {
  const groups = Duplicates.findDuplicates(state.places);
  state.dupGroups = groups;

  const container = document.getElementById('dup-results');
  const empty = document.getElementById('empty-dups');
  const badge = document.getElementById('tab-badge-dups');

  badge.textContent = groups.length;
  badge.className = 'badge' + (groups.length > 0 ? ' warn' : ' zero');

  if (groups.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = '';

  groups.forEach((group, gi) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'dup-group';

    groupEl.innerHTML = `
      <div class="dup-group-header">
        ⚠️ Grupa ${gi + 1}: ${group.length} podobnych miejsc
      </div>
      <div class="dup-items" id="dup-group-${gi}"></div>
    `;

    const itemsContainer = groupEl.querySelector('.dup-items');

    group.forEach((place, pi) => {
      const item = document.createElement('div');
      item.className = 'dup-item';
      item.dataset.placeId = place.id;
      item.innerHTML = `
        <div class="dup-item-info">
          <div class="dup-item-title">${escHtml(place.title)}</div>
          <div class="dup-item-addr">${escHtml(place.address || (place.lat ? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}` : 'brak adresu'))}</div>
        </div>
        <button class="dup-keep-btn" data-group="${gi}" data-place="${place.id}">Zachowaj</button>
      `;
      item.querySelector('.dup-keep-btn').addEventListener('click', () => keepPlace(gi, place.id, groupEl));
      itemsContainer.appendChild(item);
    });

    container.appendChild(groupEl);
  });
}

async function keepPlace(groupIdx, keptId, groupEl) {
  const group = state.dupGroups[groupIdx];
  if (!group) return;

  const toMark = group.filter((p) => p.id !== keptId);
  await Promise.all(toMark.map((p) => Storage.updatePlace(p.id, { status: 'outdated' })));

  // Visual feedback
  groupEl.querySelectorAll('.dup-item').forEach((item) => {
    const pid = item.dataset.placeId;
    const keepBtn = item.querySelector('.dup-keep-btn');
    keepBtn.remove();
    if (pid === keptId) {
      const badge = document.createElement('span');
      badge.className = 'dup-kept';
      badge.textContent = '✓ Zachowane';
      item.appendChild(badge);
    } else {
      const badge = document.createElement('span');
      badge.className = 'dup-kept';
      badge.style.color = 'var(--grey-4)';
      badge.textContent = 'Nieaktualne';
      item.appendChild(badge);
      item.style.opacity = '0.5';
    }
  });

  showToast(`${toMark.length} miejsc oznaczonych jako nieaktualne`);
  await loadAll();
}

// ── Lists tab ─────────────────────────────────────────────────────────────────
function initListsTab() {
  // Color picker
  document.querySelectorAll('.color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
      state.selectedListColor = dot.dataset.color;
    });
  });

  // Create list
  document.getElementById('create-list-btn').addEventListener('click', createList);
  document.getElementById('new-list-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createList();
  });
}

async function createList() {
  const nameInput = document.getElementById('new-list-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  await Storage.saveList({
    name,
    color: state.selectedListColor,
    description: '',
  });
  nameInput.value = '';
  showToast(`Lista „${name}" utworzona`, 'success');
  await loadAll();
}

function renderLists() {
  const container = document.getElementById('list-cards');
  const empty = document.getElementById('empty-lists');
  const badge = document.getElementById('tab-badge-lists');

  badge.textContent = state.lists.length;
  badge.className = 'badge' + (state.lists.length === 0 ? ' zero' : '');

  if (state.lists.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = '';

  state.lists.forEach((list) => {
    const placeCount = state.places.filter((p) => (p.lists || []).includes(list.id)).length;

    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <div class="list-color-swatch" style="background:${escHtml(list.color || '#4285F4')}"></div>
      <div class="list-card-info">
        <div class="list-card-name">${escHtml(list.name)}</div>
        <div class="list-card-count">${placeCount} ${pluralMiejsc(placeCount)}</div>
      </div>
      <button class="icon-btn" title="Filtruj miejsca tej listy" data-list-filter="${list.id}">🔍</button>
      <button class="icon-btn" title="Eksportuj listę KML" data-list-export="${list.id}">📥</button>
      <button class="icon-btn danger" title="Usuń listę" data-list-delete="${list.id}">🗑️</button>
    `;

    card.querySelector('[data-list-filter]').addEventListener('click', () => {
      state.listFilter = list.id;
      document.getElementById('places-list-filter').value = list.id;
      // Switch to places tab
      document.querySelector('.tab-btn[data-tab="places"]').click();
      renderPlaces();
    });

    card.querySelector('[data-list-export]').addEventListener('click', () => {
      const places = state.places.filter((p) => (p.lists || []).includes(list.id));
      if (!places.length) { showToast('Lista jest pusta', 'warn'); return; }
      ExportUtils.downloadKML(places, `lista_${sanitizeFilename(list.name)}.kml`);
    });

    card.querySelector('[data-list-delete]').addEventListener('click', async () => {
      if (!confirm(`Usunąć listę „${list.name}"? Miejsca zostaną zachowane.`)) return;
      await Storage.deleteList(list.id);
      showToast(`Lista „${list.name}" usunięta`);
      await loadAll();
    });

    container.appendChild(card);
  });
}

// ── Export tab ────────────────────────────────────────────────────────────────
function initExportTab() {
  document.getElementById('export-scope-select').addEventListener('change', (e) => {
    state.exportScope = e.target.value;
    document.getElementById('export-list-row').style.display =
      state.exportScope === 'list' ? 'block' : 'none';
  });

  document.getElementById('export-list-select').addEventListener('change', (e) => {
    state.exportListId = e.target.value;
  });

  document.getElementById('export-kml-btn').addEventListener('click', () => doExport('kml'));
  document.getElementById('export-csv-btn').addEventListener('click', () => doExport('csv'));
  document.getElementById('export-json-btn').addEventListener('click', () => doExport('json'));

  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Usunąć WSZYSTKIE dane z rozszerzenia? Tej operacji nie można cofnąć.')) return;
    await Storage.clearAllPlaces();
    state.places = [];
    state.lists = [];
    state.selected.clear();
    showToast('Wszystkie dane usunięte');
    renderAll();
  });
}

function getScopedPlaces() {
  switch (state.exportScope) {
    case 'active':
      return state.places.filter((p) => p.status === 'active');
    case 'outdated':
      return state.places.filter((p) => p.status === 'outdated');
    case 'list':
      if (!state.exportListId) return [];
      return state.places.filter((p) => (p.lists || []).includes(state.exportListId));
    default:
      return state.places;
  }
}

function doExport(format) {
  const places = getScopedPlaces();
  if (!places.length) {
    showToast('Brak miejsc do eksportu', 'warn');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case 'kml':
      ExportUtils.downloadKML(places, `miejsca_${stamp}.kml`);
      break;
    case 'csv':
      ExportUtils.downloadCSV(places, `miejsca_${stamp}.csv`);
      break;
    case 'json':
      ExportUtils.downloadJSON(places, `miejsca_${stamp}.json`);
      break;
  }
  showToast(`Pobrano ${places.length} miejsc (${format.toUpperCase()})`, 'success');
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function updateBadges() {
  const total = state.places.length;
  const badge = document.getElementById('tab-badge-places');
  badge.textContent = total;
  badge.className = 'badge' + (total === 0 ? ' zero' : '');

  const listBadge = document.getElementById('tab-badge-lists');
  listBadge.textContent = state.lists.length;
  listBadge.className = 'badge' + (state.lists.length === 0 ? ' zero' : '');
}

function updateListSelects() {
  const opts = state.lists
    .map((l) => `<option value="${l.id}">${escHtml(l.name)}</option>`)
    .join('');

  const filterSel = document.getElementById('places-list-filter');
  filterSel.innerHTML = '<option value="">— Wszystkie listy —</option>' + opts;
  filterSel.value = state.listFilter;

  const exportSel = document.getElementById('export-list-select');
  exportSel.innerHTML = '<option value="">— wybierz listę —</option>' + opts;
  exportSel.value = state.exportListId;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// ── Misc utils ────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralMiejsc(n) {
  if (n === 1) return 'miejsce';
  if (n >= 2 && n <= 4) return 'miejsca';
  return 'miejsc';
}

function sanitizeFilename(str) {
  return String(str).replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_\- ]/g, '_').slice(0, 50);
}
