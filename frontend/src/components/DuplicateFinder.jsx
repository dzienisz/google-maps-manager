import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDuplicates, bulkUpdate, updatePlace } from '../api.js'
import { Search, ExternalLink, CheckSquare, Square, AlertTriangle, Info } from 'lucide-react'

const STATUS_CONFIG = {
  active: { label: 'Aktywne', className: 'bg-green-100 text-green-800' },
  outdated: { label: 'Nieaktualne', className: 'bg-yellow-100 text-yellow-800' },
  deleted: { label: 'Usunięte', className: 'bg-red-100 text-red-800' },
}

const REASON_LABELS = {
  same_title: 'Ta sama nazwa',
  proximity: 'Bliska lokalizacja (< 100m)',
  same_title_and_proximity: 'Ta sama nazwa i bliska lokalizacja',
}

export default function DuplicateFinder() {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const queryClient = useQueryClient()

  const { data: groups = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['duplicates'],
    queryFn: fetchDuplicates,
    enabled: false, // Manual fetch
    staleTime: 0,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['places'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['duplicates'] })
  }

  const handleBulkOutdated = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Oznaczysz ${ids.length} miejsc jako nieaktualne. Kontynuować?`)) return
    await bulkUpdate(ids, { status: 'outdated' })
    setSelectedIds(new Set())
    invalidate()
    refetch()
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Usuniesz ${ids.length} miejsc. Tej operacji nie można cofnąć. Kontynuować?`)) return
    await bulkUpdate(ids, { status: 'deleted' })
    setSelectedIds(new Set())
    invalidate()
    refetch()
  }

  const handleStatusChange = async (id, status) => {
    await updatePlace(id, { status })
    invalidate()
    refetch()
  }

  const toggleId = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalDuplicates = groups.reduce((sum, g) => sum + g.places.length, 0)

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Wyszukiwarka duplikatów</h2>
            <p className="text-sm text-gray-600 mt-1">
              Znajdź miejsca o tej samej nazwie lub oddalone o mniej niż 100m
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Search size={18} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Szukanie...' : 'Szukaj duplikatów'}
          </button>
        </div>

        {/* Algorithm info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex gap-3">
          <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-blue-800">
            <strong>Algorytm:</strong> Duplikaty to miejsca o tej samej nazwie lub oddalone o mniej niż 100m.
            Zaznacz miejsca, które chcesz oznaczyć lub usunąć, następnie użyj akcji masowych.
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Analizowanie miejsc...</p>
          </div>
        )}

        {/* No results yet */}
        {!isLoading && groups.length === 0 && !isFetching && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Search className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 text-lg font-medium">
              Kliknij "Szukaj duplikatów" aby rozpocząć analizę
            </p>
          </div>
        )}

        {/* Results */}
        {groups.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-yellow-500" size={20} />
                <p className="text-gray-700 font-medium">
                  Znaleziono <strong>{groups.length}</strong> grup duplikatów ({totalDuplicates} miejsc)
                </p>
              </div>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Zaznaczono: {selectedIds.size}</span>
                  <button
                    onClick={handleBulkOutdated}
                    className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Oznacz jako nieaktualne
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Usuń zaznaczone
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {groups.map((group, groupIdx) => (
                <div key={groupIdx} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <AlertTriangle className="text-yellow-500" size={16} />
                    <span className="text-sm font-medium text-gray-700">
                      {group.reasons.map(r => REASON_LABELS[r] || r).join(', ')}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {group.places.length} miejsca
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                    {group.places.map(place => (
                      <DuplicateCard
                        key={place.id}
                        place={place}
                        selected={selectedIds.has(place.id)}
                        onToggle={() => toggleId(place.id)}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DuplicateCard({ place, selected, onToggle, onStatusChange }) {
  const statusConfig = STATUS_CONFIG[place.status] || STATUS_CONFIG.active

  return (
    <div
      className={`p-4 cursor-pointer transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {selected
            ? <CheckSquare className="text-blue-600" size={18} />
            : <Square className="text-gray-300" size={18} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm line-clamp-2">{place.title}</div>

          {place.address && (
            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{place.address}</div>
          )}

          {place.lat && place.lng && (
            <div className="text-xs text-gray-400 mt-1">
              {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
            </div>
          )}

          {place.published_at && (
            <div className="text-xs text-gray-400 mt-1">
              Dodano: {new Date(place.published_at).toLocaleDateString('pl-PL')}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
            <select
              value={place.status}
              onChange={e => onStatusChange(place.id, e.target.value)}
              className={`text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none ${statusConfig.className} cursor-pointer`}
            >
              <option value="active">Aktywne</option>
              <option value="outdated">Nieaktualne</option>
              <option value="deleted">Usunięte</option>
            </select>

            {place.google_maps_url && (
              <a
                href={place.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
                title="Otwórz w Google Maps"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
