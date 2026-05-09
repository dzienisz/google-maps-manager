import { Router } from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import db from '../db.js';
import { parseFeatureCollection } from '../utils/parser.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.json') || ext.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Akceptowane są tylko pliki .json i .zip'));
    }
  },
});

function isDuplicate(place) {
  if (place.google_maps_url) {
    const existing = db.prepare("SELECT id FROM places WHERE google_maps_url = ? AND google_maps_url != ''").get(place.google_maps_url);
    if (existing) return true;
  }
  if (place.lat && place.lng) {
    const existing = db.prepare(`
      SELECT id FROM places
      WHERE title = ? AND ABS(lat - ?) < 0.0001 AND ABS(lng - ?) < 0.0001
    `).get(place.title, place.lat, place.lng);
    if (existing) return true;
  }
  return false;
}

function insertPlaces(places) {
  const stmt = db.prepare(`
    INSERT INTO places (title, address, business_name, lat, lng, google_maps_url, comment, star_type, published_at, updated_at, status, source_file)
    VALUES (@title, @address, @business_name, @lat, @lng, @google_maps_url, @comment, @star_type, @published_at, @updated_at, @status, @source_file)
  `);

  const transaction = db.transaction((places) => {
    let inserted = 0;
    let skipped = 0;

    for (const place of places) {
      if (isDuplicate(place)) {
        skipped++;
        continue;
      }
      try {
        stmt.run(place);
        inserted++;
      } catch (err) {
        console.error('Insert error:', err.message, place.title);
        skipped++;
      }
    }

    return { inserted, skipped };
  });

  return transaction(places);
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Brak pliku' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const allPlaces = [];

    const isZip = originalname.toLowerCase().endsWith('.zip') ||
      mimetype === 'application/zip' ||
      mimetype === 'application/x-zip-compressed';

    if (isZip) {
      // Process ZIP file
      const zip = await JSZip.loadAsync(buffer);
      const jsonFiles = [];

      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.json')) {
          jsonFiles.push({ path: relativePath, entry: zipEntry });
        }
      });

      if (jsonFiles.length === 0) {
        return res.status(400).json({ error: 'Brak plików JSON w archiwum ZIP' });
      }

      for (const { path, entry } of jsonFiles) {
        try {
          const content = await entry.async('string');
          const places = parseFeatureCollection(content, path);
          allPlaces.push(...places);
        } catch (err) {
          console.error(`Error processing ${path}:`, err.message);
        }
      }
    } else {
      // Process JSON file directly
      try {
        const content = buffer.toString('utf-8');
        const places = parseFeatureCollection(content, originalname);
        allPlaces.push(...places);
      } catch (err) {
        return res.status(400).json({ error: 'Nieprawidłowy format JSON: ' + err.message });
      }
    }

    if (allPlaces.length === 0) {
      return res.status(400).json({
        error: 'Nie znaleziono żadnych miejsc w pliku. Upewnij się, że plik pochodzi z Google Takeout (Mapy → Zapisane miejsca).',
      });
    }

    const { inserted, skipped } = insertPlaces(allPlaces);
    const total = allPlaces.length;

    res.json({
      success: true,
      inserted,
      skipped,
      total,
      message: `Przetworzono ${total} miejsc: dodano ${inserted}, pominięto ${skipped} duplikatów`,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Błąd podczas przetwarzania pliku: ' + err.message });
  }
});

export default router;
