// utils/duplicates.js — Duplicate detection for saved places
// Exported function: findDuplicates(places) → Array of groups [[place, place, ...], ...]

'use strict';

const Duplicates = (() => {
  // ── Haversine distance (km) ──────────────────────────────────────────────
  function haversineKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // ── Levenshtein distance ──────────────────────────────────────────────────
  function levenshtein(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  // ── Duplicate rules ───────────────────────────────────────────────────────
  //  Rule 1: identical title AND within 200 m
  //  Rule 2: same googleMapsUrl (non-empty)
  //  Rule 3: title Levenshtein distance < 3 AND within 500 m
  function areDuplicates(a, b) {
    // Rule 2
    if (
      a.googleMapsUrl &&
      b.googleMapsUrl &&
      a.googleMapsUrl === b.googleMapsUrl
    ) {
      return true;
    }

    const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);

    // Rule 1
    if (
      a.title.toLowerCase().trim() === b.title.toLowerCase().trim() &&
      distKm <= 0.2
    ) {
      return true;
    }

    // Rule 3
    const titleDist = levenshtein(a.title, b.title);
    if (titleDist < 3 && distKm <= 0.5) {
      return true;
    }

    return false;
  }

  // ── Union-Find for grouping ───────────────────────────────────────────────
  function findDuplicates(places) {
    if (!Array.isArray(places) || places.length === 0) return [];

    const n = places.length;
    const parent = Array.from({ length: n }, (_, i) => i);

    function find(x) {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    }

    function union(x, y) {
      parent[find(x)] = find(y);
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (areDuplicates(places[i], places[j])) {
          union(i, j);
        }
      }
    }

    // Group by root
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(places[i]);
    }

    // Only return groups with 2+ members
    return Array.from(groups.values()).filter((g) => g.length >= 2);
  }

  return { findDuplicates, haversineKm, levenshtein };
})();
