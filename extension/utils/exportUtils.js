// utils/exportUtils.js — Export helpers (browser-only, no Node.js imports)
// KML, CSV, JSON export + file download trigger

'use strict';

const ExportUtils = (() => {
  // ── Escape helpers ─────────────────────────────────────────────────────────
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

  // ── KML export ─────────────────────────────────────────────────────────────
  function exportKML(places) {
    const placemarks = places
      .filter((p) => p.lat && p.lng)
      .map((p) => {
        const description = [
          p.address ? `Adres: ${p.address}` : '',
          p.status && p.status !== 'active' ? `Status: ${p.status}` : '',
          p.notes ? `Notatki: ${p.notes}` : '',
          p.googleMapsUrl ? `Link: ${p.googleMapsUrl}` : '',
          p.capturedAt ? `Zapisano: ${new Date(p.capturedAt).toLocaleDateString('pl-PL')}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        // Pin color by status
        const styleUrl = p.status === 'outdated' ? '#style-outdated' : '#style-active';

        return `    <Placemark>
      <name>${escapeXml(p.title)}</name>
      <description>${escapeXml(description)}</description>
      <styleUrl>${escapeXml(styleUrl)}</styleUrl>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Moje Miejsca – Google Maps Manager</name>
    <description>Eksport z Google Maps Manager (${new Date().toLocaleDateString('pl-PL')})</description>
    <Style id="style-active">
      <IconStyle>
        <color>ff0000ff</color>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="style-outdated">
      <IconStyle>
        <color>ff888888</color>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>
      </IconStyle>
    </Style>
${placemarks}
  </Document>
</kml>`;
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCSV(places) {
    const headers = [
      'id',
      'title',
      'address',
      'lat',
      'lng',
      'googleMapsUrl',
      'status',
      'notes',
      'lists',
      'capturedAt',
      'updatedAt',
    ];

    const rows = places.map((p) => {
      const capturedDate = p.capturedAt
        ? new Date(p.capturedAt).toISOString()
        : '';
      const updatedDate = p.updatedAt
        ? new Date(p.updatedAt).toISOString()
        : '';
      const listsStr = Array.isArray(p.lists) ? p.lists.join(';') : '';

      return [
        p.id,
        p.title,
        p.address,
        p.lat,
        p.lng,
        p.googleMapsUrl,
        p.status,
        p.notes,
        listsStr,
        capturedDate,
        updatedDate,
      ]
        .map(escapeCsv)
        .join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  // ── JSON export ────────────────────────────────────────────────────────────
  function exportJSON(places) {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: places.length,
        places,
      },
      null,
      2
    );
  }

  // ── Download trigger ───────────────────────────────────────────────────────
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ── Convenience wrappers ───────────────────────────────────────────────────
  function downloadKML(places, filename) {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(exportKML(places), filename || `miejsca_${stamp}.kml`, 'application/vnd.google-earth.kml+xml');
  }

  function downloadCSV(places, filename) {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(exportCSV(places), filename || `miejsca_${stamp}.csv`, 'text/csv;charset=utf-8;');
  }

  function downloadJSON(places, filename) {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(exportJSON(places), filename || `miejsca_${stamp}.json`, 'application/json');
  }

  return {
    exportKML,
    exportCSV,
    exportJSON,
    downloadFile,
    downloadKML,
    downloadCSV,
    downloadJSON,
  };
})();
