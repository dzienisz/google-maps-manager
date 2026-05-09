const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return res;
}

async function json(url, options = {}) {
  const res = await request(url, options);
  return res.json();
}

export async function fetchPlaces(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.set(k, v);
  });
  const qs = query.toString();
  return json(`/places${qs ? '?' + qs : ''}`);
}

export async function fetchStats() {
  return json('/places/stats');
}

export async function updatePlace(id, data) {
  return json(`/places/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deletePlace(id) {
  return json(`/places/${id}`, { method: 'DELETE' });
}

export async function addToList(placeId, listId) {
  return json(`/places/${placeId}/lists`, {
    method: 'POST',
    body: JSON.stringify({ listId }),
  });
}

export async function removeFromList(placeId, listId) {
  return json(`/places/${placeId}/lists/${listId}`, { method: 'DELETE' });
}

export async function fetchDuplicates() {
  return json('/places/duplicates');
}

export async function bulkUpdate(ids, data) {
  return json('/places/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ ids, ...data }),
  });
}

export async function fetchLists() {
  return json('/lists');
}

export async function createList(data) {
  return json('/lists', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateList(id, data) {
  return json(`/lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteList(id) {
  return json(`/lists/${id}`, { method: 'DELETE' });
}

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json();
}

export function exportPlacesUrl(format, listId) {
  const params = new URLSearchParams({ format });
  if (listId) params.set('listId', listId);
  return `${BASE}/places/export?${params.toString()}`;
}
