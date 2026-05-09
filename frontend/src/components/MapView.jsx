import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps'
import { fetchPlaces, fetchLists, updatePlace } from '../api.js'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, AlertCircle } from 'lucide-react'

const STATUS_COLORS = {
  active: '#2563eb',
  outdated: '#d97706',
  deleted: '#dc2626',
}

const STATUS_LABELS = {
  active: 'Aktywne',
  outdated: 'Nieaktualne',
  deleted: 'Usunięte',
}

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function MarkerDot({ color }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        backgroundColor: color,
        border: '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        cursor: 'pointer',
      }}
    />
  )
}

export default function MapView({ filters, setFilters }) {
  const [selectedPlace, setSelectedPlace] = useState(null)
  const queryClient = useQueryClient()

  const { data: listsData } = useQuery({
    queryKey: ['lists'],
    queryFn: fetchLists,
  })
  const lists = listsData || []

  const { data, isLoading, error } = useQuery({
    queryKey: ['places', { ...filters, limit: 2000, page: 1 }],
    queryFn: () => fetchPlaces({ ...filters, limit: 2000, page: 1 }),
    keepPreviousData: true,
  })

  const places = data?.places || []
  const placesWithCoords = places.filter(p => p.lat && p.lng)

  const handleStatusChange = useCallback(async (placeId, newStatus) => {
    try {
      await updatePlace(placeId, { status: newStatus })
      queryClient.invalidateQueries({ queryKey: ['places'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setSelectedPlace(prev => prev?.id === placeId ? { ...prev, status: newStatus } : prev)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }, [queryClient])

  if (!API_KEY) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center px-6">
          <AlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-3">Brak klucza Google Maps API</h3>
          <p className="text-gray-600 mb-4">
            Aby wyświetlić mapę, dodaj klucz API do pliku <code className="bg-gray-100 px-1 rounded">frontend/.env</code>:
          </p>
          <pre className="bg-gray-900 text-green-400 text-sm p-4 rounded-lg text-left">
            VITE_GOOGLE_MAPS_API_KEY=twój_klucz_api
          </pre>
          <p className="text-sm text-gray-500 mt-4">
            Klucz API uzyskasz na <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filter bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1">
          {['all', 'active', 'outdated', 'deleted'].map(s => (
            <button
              key={s}
              onClick={() => setFilters(f => ({ ...f, status: s }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filters.status === s
                  ? s === 'all' ? 'bg-blue-600 text-white'
                    : s === 'active' ? 'bg-green-600 text-white'
                    : s === 'outdated' ? 'bg-yellow-500 text-white'
                    : 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'Wszystkie' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {lists.length > 0 && (
          <select
            value={filters.listId || ''}
            onChange={e => setFilters(f => ({ ...f, listId: e.target.value }))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Wszystkie listy</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-gray-500 ml-auto">
          {isLoading ? 'Ładowanie...' : `${placesWithCoords.length} miejsc na mapie`}
        </span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          defaultCenter={{ lat: 52.0, lng: 19.0 }}
          defaultZoom={6}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          onClick={() => setSelectedPlace(null)}
          style={{ width: '100%', height: '100%' }}
        >
          {placesWithCoords.map(place => (
            <AdvancedMarker
              key={place.id}
              position={{ lat: place.lat, lng: place.lng }}
              onClick={() => setSelectedPlace(place)}
              title={place.title}
            >
              <MarkerDot color={STATUS_COLORS[place.status] || STATUS_COLORS.active} />
            </AdvancedMarker>
          ))}

          {selectedPlace && (
            <InfoWindow
              position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
              onCloseClick={() => setSelectedPlace(null)}
              headerContent={
                <div className="font-bold text-gray-900 text-sm pr-4">{selectedPlace.title}</div>
              }
            >
              <div className="min-w-[220px] max-w-[300px] text-sm">
                {selectedPlace.address && (
                  <p className="text-gray-600 text-xs mb-2">{selectedPlace.address}</p>
                )}

                {selectedPlace.comment && (
                  <p className="text-gray-700 italic text-xs mb-2">"{selectedPlace.comment}"</p>
                )}

                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-500 block mb-1">Status:</label>
                  <select
                    value={selectedPlace.status}
                    onChange={e => handleStatusChange(selectedPlace.id, e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="active">Aktywne</option>
                    <option value="outdated">Nieaktualne</option>
                    <option value="deleted">Usunięte</option>
                  </select>
                </div>

                {selectedPlace.lists && selectedPlace.lists.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Listy:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedPlace.lists.map(l => (
                        <span
                          key={l.id}
                          className="text-xs px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: l.color }}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlace.google_maps_url && (
                  <a
                    href={selectedPlace.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    <ExternalLink size={12} />
                    Otwórz w Google Maps
                  </a>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-3 text-xs">
          <div className="font-medium text-gray-700 mb-2">Legenda</div>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
              <span className="text-gray-600">{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
