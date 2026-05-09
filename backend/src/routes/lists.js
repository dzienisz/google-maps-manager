import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/lists - all lists with place count
router.get('/', (req, res) => {
  try {
    const lists = db.prepare(`
      SELECT l.*, COUNT(pl.place_id) as place_count
      FROM lists l
      LEFT JOIN place_lists pl ON l.id = pl.list_id
      GROUP BY l.id
      ORDER BY l.name
    `).all();

    res.json(lists);
  } catch (err) {
    console.error('GET /lists error:', err);
    res.status(500).json({ error: 'Błąd pobierania list: ' + err.message });
  }
});

// POST /api/lists - create list
router.post('/', (req, res) => {
  try {
    const { name, description = '', color = '#4285F4' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nazwa listy jest wymagana' });
    }

    const result = db.prepare(`
      INSERT INTO lists (name, description, color)
      VALUES (?, ?, ?)
    `).run(name.trim(), description, color);

    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(list);
  } catch (err) {
    console.error('POST /lists error:', err);
    res.status(500).json({ error: 'Błąd tworzenia listy: ' + err.message });
  }
});

// PATCH /api/lists/:id - update list
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(parseInt(id));
    if (!list) {
      return res.status(404).json({ error: 'Lista nie znaleziona' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;

    if (Object.keys(updates).length === 0) {
      return res.json(list);
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE lists SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), parseInt(id));

    const updated = db.prepare('SELECT * FROM lists WHERE id = ?').get(parseInt(id));
    res.json(updated);
  } catch (err) {
    console.error('PATCH /lists/:id error:', err);
    res.status(500).json({ error: 'Błąd aktualizacji listy: ' + err.message });
  }
});

// DELETE /api/lists/:id - delete list (not places)
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(parseInt(id));
    if (!list) {
      return res.status(404).json({ error: 'Lista nie znaleziona' });
    }

    // place_lists entries will cascade due to FK
    db.prepare('DELETE FROM lists WHERE id = ?').run(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /lists/:id error:', err);
    res.status(500).json({ error: 'Błąd usuwania listy: ' + err.message });
  }
});

export default router;
