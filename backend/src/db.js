import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '../data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'maps.db');
const db = new Database(dbPath);

export function initDB() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      title TEXT NOT NULL,
      address TEXT,
      business_name TEXT,
      lat REAL,
      lng REAL,
      google_maps_url TEXT,
      comment TEXT,
      star_type TEXT DEFAULT 'star',
      published_at TEXT,
      updated_at TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      source_file TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#4285F4',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS place_lists (
      place_id INTEGER NOT NULL,
      list_id INTEGER NOT NULL,
      PRIMARY KEY (place_id, list_id),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    );
  `);

  console.log(`Database initialized at ${dbPath}`);
}

export default db;
