/**
 * Export utilities for KML, CSV, and GeoJSON formats.
 */

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportKML(places) {
  const placemarks = places
    .filter(p => p.lat && p.lng)
    .map(p => {
      const description = [
        p.address ? `Adres: ${p.address}` : '',
        p.status !== 'active' ? `Status: ${p.status}` : '',
        p.notes ? `Notatki: ${p.notes}` : '',
        p.google_maps_url ? `Link: ${p.google_maps_url}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return `    <Placemark>
      <name>${escapeXml(p.title)}</name>
      <description>${escapeXml(description)}</description>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Moje Miejsca</name>
    <description>Eksport z Google Maps Manager</description>
${placemarks}
  </Document>
</kml>`;
}

export function exportCSV(places) {
  const headers = ['id', 'title', 'address', 'business_name', 'lat', 'lng', 'google_maps_url', 'status', 'notes', 'comment', 'published_at', 'updated_at', 'source_file'];

  const rows = places.map(p =>
    headers.map(h => escapeCsv(p[h])).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function exportGeoJSON(places) {
  const features = places
    .filter(p => p.lat && p.lng)
    .map(p => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
      properties: {
        id: p.id,
        title: p.title,
        address: p.address,
        business_name: p.business_name,
        google_maps_url: p.google_maps_url,
        status: p.status,
        notes: p.notes,
        comment: p.comment,
        published_at: p.published_at,
        updated_at: p.updated_at,
      },
    }));

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features,
    },
    null,
    2
  );
}
