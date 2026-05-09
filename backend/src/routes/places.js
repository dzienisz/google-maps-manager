import { Router } from 'express';
import db from '../db.js';
import { exportKML, exportCSV, exportGeoJSON } from '../utils/exportUtils.js';

const router = Router();

// GET /api/places - list with filters
router.get('/', (req, res) => {
  try {
    const { status, listId, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clauses and params (for queries without listId join)
    let whereClauses = [];
    let filterParams = [];

    if (status && status !== 'all') {
      whereClauses.push('p.status = ?');
      filterParams.push(status);
    }

    if (search) {
      whereClauses.push('(p.title LIKE ? OR p.address LIKE ? OR p.business_name LIKE ?)');
      const searchParam = `%${search}%`;
      filterParams.push(searchParam, searchParam, searchParam);
    }

    if (listId) {
      whereClauses.push('p.id IN (SELECT place_id FROM place_lists WHERE list_id = ?)');
      filterParams.push(parseInt(listId));
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM places p ${whereStr}`;
    const countResult = db.prepare(countSql).get(...filterParams);
    const total = countResult ? countResult.total : 0;

    // Data query - get places with their lists
    const dataSql = `
      SELECT p.*,
        GROUP_CONCAT(l.id || ':' || l.name || ':' || l.color) as lists_raw
      FROM places p
      LEFT JOIN place_lists pl ON p.id = pl.place_id
      LEFT JOIN lists l ON pl.list_id = l.id
      ${whereStr}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const places = db.prepare(dataSql).all(...filterParams, parseInt(limit), offset);

    // Parse lists_raw into arrays
    const enriched = places.map(p => ({
      ...p,
      lists: p.lists_raw
        ? p.lists_raw.split(',').filter(Boolean).map(entry => {
            const parts = entry.split(':');
            return { id: parseInt(parts[0]), name: parts[1], color: parts[2] || '#4285F4' };
          })
        : [],
      lists_raw: undefined,
    }));

    res.json({
      places: enriched,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /places error:', err);
    res.status(500).json({ error: 'Błąd pobierania miejsc: ' + err.message });
  }
});

// GET /api/places/stats
router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM places').get().count;
    const active = db.prepare("SELECT COUNT(*) as count FROM places WHERE status = 'active'").get().count;
    const outdated = db.prepare("SELECT COUNT(*) as count FROM places WHERE status = 'outdated'").get().count;
    const deleted = db.prepare("SELECT COUNT(*) as count FROM places WHERE status = 'deleted'").get().count;

    const byList = db.prepare(`
      SELECT l.id, l.name, l.color, COUNT(pl.place_id) as count
      FROM lists l
      LEFT JOIN place_lists pl ON l.id = pl.list_id
      GROUP BY l.id
      ORDER BY l.name
    `).all();

    res.json({ total, active, outdated, deleted, byList });
  } catch (err) {
    console.error('GET /places/stats error:', err);
    res.status(500).json({ error: 'Błąd pobierania statystyk: ' + err.message });
  }
});

// GET /api/places/duplicates
router.get('/duplicates', (req, res) => {
  try {
    // Find duplicates by same title
    const byTitle = db.prepare(`
      SELECT p1.id as id1, p2.id as id2, 'same_title' as reason
      FROM places p1
      INNER JOIN places p2 ON p1.title = p2.title AND p1.id < p2.id
      WHERE p1.status != 'deleted' AND p2.status != 'deleted'
      LIMIT 500
    `).all();

    // Find duplicates by proximity (< ~100m = ~0.001 degrees)
    const byProximity = db.prepare(`
      SELECT p1.id as id1, p2.id as id2, 'proximity' as reason
      FROM places p1
      INNER JOIN places p2 ON
        p1.id < p2.id AND
        p1.lat IS NOT NULL AND p2.lat IS NOT NULL AND
        ABS(p1.lat - p2.lat) < 0.001 AND
        ABS(p1.lng - p2.lng) < 0.001
      WHERE p1.status != 'deleted' AND p2.status != 'deleted'
      LIMIT 500
    `).all();

    // Combine and deduplicate pairs
    const pairMap = new Map();
    const allPairs = [...byTitle, ...byProximity];

    for (const pair of allPairs) {
      const key = `${pair.id1}-${pair.id2}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, pair);
      } else {
        // Add reason if different
        const existing = pairMap.get(key);
        if (existing.reason !== pair.reason) {
          existing.reason = 'same_title_and_proximity';
        }
      }
    }

    // Group into clusters
    const pairs = Array.from(pairMap.values());
    const idToGroup = new Map();
    const groups = [];

    for (const pair of pairs) {
      const g1 = idToGroup.get(pair.id1);
      const g2 = idToGroup.get(pair.id2);

      if (g1 !== undefined && g2 !== undefined) {
        if (g1 !== g2) {
          // Merge groups
          const smaller = g1 < g2 ? g2 : g1;
          const larger = g1 < g2 ? g1 : g2;
          for (const [id, g] of idToGroup.entries()) {
            if (g === smaller) idToGroup.set(id, larger);
          }
          groups[larger].reasons = [...new Set([...groups[larger].reasons, ...groups[smaller].reasons])];
          groups[smaller] = null;
        }
      } else if (g1 !== undefined) {
        idToGroup.set(pair.id2, g1);
        groups[g1].ids.push(pair.id2);
        groups[g1].reasons = [...new Set([...groups[g1].reasons, pair.reason])];
      } else if (g2 !== undefined) {
        idToGroup.set(pair.id1, g2);
        groups[g2].ids.push(pair.id1);
        groups[g2].reasons = [...new Set([...groups[g2].reasons, pair.reason])];
      } else {
        const idx = groups.length;
        groups.push({ ids: [pair.id1, pair.id2], reasons: [pair.reason] });
        idToGroup.set(pair.id1, idx);
        idToGroup.set(pair.id2, idx);
      }
    }

    const validGroups = groups.filter(Boolean);

    // Fetch full place data for each group
    const placeCache = new Map();
    const getPlace = (id) => {
      if (!placeCache.has(id)) {
        const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
        placeCache.set(id, place);
      }
      return placeCache.get(id);
    };

    const result = validGroups.map(group => ({
      reasons: group.reasons,
      places: group.ids.map(id => getPlace(id)).filter(Boolean),
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /places/duplicates error:', err);
    res.status(500).json({ error: 'Błąd wyszukiwania duplikatów: ' + err.message });
  }
});

// GET /api/places/export
router.get('/export', (req, res) => {
  try {
    const { format = 'csv', listId } = req.query;

    let places;
    if (listId) {
      places = db.prepare(`
        SELECT p.* FROM places p
        INNER JOIN place_lists pl ON p.id = pl.place_id
        WHERE pl.list_id = ? AND p.status != 'deleted'
        ORDER BY p.title
      `).all(parseInt(listId));
    } else {
      places = db.prepare("SELECT * FROM places WHERE status != 'deleted' ORDER BY title").all();
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'kml') {
      const kml = exportKML(places);
      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="miejsca-${timestamp}.kml"`);
      res.send(kml);
    } else if (format === 'geojson') {
      const geojson = exportGeoJSON(places);
      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="miejsca-${timestamp}.geojson"`);
      res.send(geojson);
    } else {
      const csv = exportCSV(places);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="miejsca-${timestamp}.csv"`);
      res.send('﻿' + csv); // BOM for Excel
    }
  } catch (err) {
    console.error('GET /places/export error:', err);
    res.status(500).json({ error: 'Błąd eksportu: ' + err.message });
  }
});

// PATCH /api/places/:id
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(parseInt(id));
    if (!place) {
      return res.status(404).json({ error: 'Miejsce nie znalezione' });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.json(place);
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE places SET ${setClauses} WHERE id = ?`).run(...values, parseInt(id));

    const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(parseInt(id));
    res.json(updated);
  } catch (err) {
    console.error('PATCH /places/:id error:', err);
    res.status(500).json({ error: 'Błąd aktualizacji: ' + err.message });
  }
});

// DELETE /api/places/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM places WHERE id = ?').run(parseInt(id));

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Miejsce nie znalezione' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /places/:id error:', err);
    res.status(500).json({ error: 'Błąd usuwania: ' + err.message });
  }
});

// POST /api/places/:id/lists
router.post('/:id/lists', (req, res) => {
  try {
    const { id } = req.params;
    const { listId } = req.body;

    if (!listId) {
      return res.status(400).json({ error: 'Brak listId' });
    }

    const place = db.prepare('SELECT id FROM places WHERE id = ?').get(parseInt(id));
    if (!place) return res.status(404).json({ error: 'Miejsce nie znalezione' });

    const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(parseInt(listId));
    if (!list) return res.status(404).json({ error: 'Lista nie znaleziona' });

    db.prepare('INSERT OR IGNORE INTO place_lists (place_id, list_id) VALUES (?, ?)').run(parseInt(id), parseInt(listId));

    res.json({ success: true });
  } catch (err) {
    console.error('POST /places/:id/lists error:', err);
    res.status(500).json({ error: 'Błąd dodawania do listy: ' + err.message });
  }
});

// DELETE /api/places/:id/lists/:listId
router.delete('/:id/lists/:listId', (req, res) => {
  try {
    const { id, listId } = req.params;
    db.prepare('DELETE FROM place_lists WHERE place_id = ? AND list_id = ?').run(parseInt(id), parseInt(listId));
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /places/:id/lists/:listId error:', err);
    res.status(500).json({ error: 'Błąd usuwania z listy: ' + err.message });
  }
});

// POST /api/places/bulk-update
router.post('/bulk-update', (req, res) => {
  try {
    const { ids, status, listId } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Brak ID miejsc' });
    }

    const placeholders = ids.map(() => '?').join(',');

    if (status) {
      db.prepare(`UPDATE places SET status = ? WHERE id IN (${placeholders})`).run(status, ...ids);
    }

    if (listId) {
      const insertMany = db.transaction((ids, listId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO place_lists (place_id, list_id) VALUES (?, ?)');
        for (const id of ids) {
          stmt.run(id, listId);
        }
      });
      insertMany(ids, parseInt(listId));
    }

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error('POST /places/bulk-update error:', err);
    res.status(500).json({ error: 'Błąd masowej aktualizacji: ' + err.message });
  }
});

export default router;
