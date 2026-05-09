/**
 * Parse Google Takeout GeoJSON format for saved places.
 * Feature format:
 * {
 *   "geometry": { "coordinates": [lng, lat], "type": "Point" },
 *   "properties": {
 *     "Google Maps URL": "...",
 *     "Location": {
 *       "Address": "...",
 *       "Business Name": "...",
 *       "Geo Coordinates": { "Latitude": "52.2", "Longitude": "21.0" }
 *     },
 *     "Published": "2023-01-01T00:00:00Z",
 *     "Title": "Place Name",
 *     "Updated": "2023-01-01T00:00:00Z",
 *     "URL": "...",
 *     "Comment": "..."
 *   }
 * }
 */
export function parseFeatureCollection(json, sourceFile = '') {
  let data;

  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      return [];
    }
  } else {
    data = json;
  }

  // Support both FeatureCollection and array of features
  let features = [];
  if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    features = data.features;
  } else if (Array.isArray(data)) {
    features = data;
  } else if (data && data.type === 'Feature') {
    features = [data];
  } else {
    console.warn('Unknown JSON format, attempting to extract features...');
    // Try to find features array somewhere in the object
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      for (const key of keys) {
        if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].type === 'Feature') {
          features = data[key];
          break;
        }
      }
    }
  }

  const places = [];

  for (const feature of features) {
    if (!feature || feature.type !== 'Feature') continue;

    const props = feature.properties || {};
    const geometry = feature.geometry || {};

    let lat = null;
    let lng = null;

    // Try geometry coordinates first
    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
      lng = parseFloat(geometry.coordinates[0]);
      lat = parseFloat(geometry.coordinates[1]);
    }

    // Try Location.Geo Coordinates
    const location = props.Location || {};
    if ((!lat || !lng) && location['Geo Coordinates']) {
      const geoCoords = location['Geo Coordinates'];
      lat = parseFloat(geoCoords.Latitude || geoCoords.latitude || 0);
      lng = parseFloat(geoCoords.Longitude || geoCoords.longitude || 0);
    }

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng)) {
      lat = null;
      lng = null;
    }

    const title = props.Title || props.title || location['Business Name'] || '';
    if (!title) continue; // skip entries without title

    const place = {
      title: title.trim(),
      address: (location.Address || props.Address || '').trim(),
      business_name: (location['Business Name'] || '').trim(),
      lat,
      lng,
      google_maps_url: props['Google Maps URL'] || props.url || props.URL || '',
      comment: props.Comment || props.comment || '',
      star_type: props['Star Type'] || props.star_type || 'star',
      published_at: props.Published || props.published || null,
      updated_at: props.Updated || props.updated || null,
      source_file: sourceFile,
      status: 'active',
    };

    places.push(place);
  }

  return places;
}
