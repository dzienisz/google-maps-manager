import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlaces, fetchLists, updatePlace, deletePlace, bulkUpdate, addToList } from '../api.js'
import { Search, ExternalLink, Trash2, ChevronLeft, ChevronRight, Tag, X } from 'lucide-react'

const STATUS_CONFIG = {
  active: { label: 'Aktywne', className: 'bg-green-100 text-green-800' },
  outdated: { label: 'Nieaktualne', className: 'bg-yellow-100 text-yellow-800' },
  deleted: { label: 'Usunięte', className: 'bg-red-100 text-red-800' },
}

export default function PlacesList({ filters, setFilters, selectedPlaces, setSelectedPlaces }) {
  const [page, setPage] = useState(1)
  const [showBulkListModal, setShowBulkListModal] = useState(false)
  const queryClient = useQueryClient()
  const LIMIT = 50

  const { data, isLoading } = useQuery({
    queryKey: ['places', { ...filters, page, limit: LIMIT }],
    queryFn: () => fetchPlaces({ ...filters, page, limit: LIMIT }),
    keepPreviousData: true,
  })

  const { data: listsData } = useQuery({
    queryKey: ['lists'],
    queryFn: fetchLists,
  })

  const places = data?.places || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / LIMIT)
  const lists = listsData || []

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['places'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }, [queryClient])

  const handleStatusChange = useCallback(async (id, status) => {
    await updatePlace(id, { status })
    invalidate()
  }, [invalidate])

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Czy na pewno chcesz usunąć to miejsce?')) return
    await deletePlace(id)
    invalidate()
  }, [invalidate])

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedPlaces(new Set(places.map(p => p.id)))
    } else {
      setSelectedPlaces(new Set())
    }
  }

  const handleSelectOne = (id, checked) => {
    setSelectedPlaces(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleBulkStatus = async (status) => {
    const ids = Array.from(selectedPlaces)
    await bulkUpdate(ids, { status })
    setSelectedPlaces(new Set())
    invalidate()
  }

  const handleBulkAddToList = async (listId) => {
    const ids = Array.from(selectedPlaces)
    await bulkUpdate(ids, { listId })
    setSelectedPlaces(new Set())
    setShowBulkListModal(false)
    invalidate()
  }

  const handleSearch = (e) => {
    setFilters(f => ({ ...f, search: e.target.value }))
    setPage(1)
  }

  const handleStatusFilter = (status) => {
    setFilters(f => ({ ...f, status }))
    setPage(1)
  }

  const handleListFilter = (listId) => {
    setFilters(f => ({ ...f, listId }))
    setPage(1)
  }

  const selectedCount = selectedPlaces.size
  const allSelected = places.length > 0 && places.every(p => selectedPlaces.has(p.id))

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Filter bar */}
      <div className="border-b border-gray-200 px-4 py-3 space-y-3 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Szukaj miejsca..."
              value={filters.search || ''}
              onChange={handleSearch}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1">
            {[
              { value: 'all', label: 'Wszystkie' },
              { value: 'active', label: 'Aktywne' },
              { value: 'outdated', label: 'Nieaktualne' },
              { value: 'deleted', label: 'Usunięte' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleStatusFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  filters.status === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {lists.length > 0 && (
            <select
              value={filters.listId || ''}
              onChange={e => handleListFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Wszystkie listy</option>
              {lists.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Bulk actions toolbar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-blue-700">
              Zaznaczono: {selectedCount}
            </span>
            <div className="flex gap-2 ml-2">
              <button
                onClick={() => handleBulkStatus('outdated')}
                className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                Oznacz jako nieaktualne
              </button>
              <button
                onClick={() => handleBulkStatus('deleted')}
                className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                Usuń
              </button>
              {lists.length > 0 && (
                <button
                  onClick={() => setShowBulkListModal(true)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  <Tag size={12} />
                  Dodaj do listy
                </button>
              )}
            </div>
            <button
              onClick={() => setSelectedPlaces(new Set())}
              className="ml-auto p-1 hover:bg-blue-100 rounded"
            >
              <X size={16} className="text-blue-600" />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : places.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            Nie znaleziono miejsc
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => handleSelectAll(e.target.checked)}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[200px]">Nazwa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[200px]">Adres</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[120px]">Listy</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[150px]">Notatki</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {places.map(place => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  selected={selectedPlaces.has(place.id)}
                  onSelect={handleSelectOne}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onNotesChange={async (id, notes) => {
                    await updatePlace(id, { notes })
                    invalidate()
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-white flex-shrink-0">
          <span className="text-sm text-gray-600">
            Pokazuję {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} z {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk add to list modal */}
      {showBulkListModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <h3 className="font-bold text-gray-900 mb-4">Dodaj do listy</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {lists.map(list => (
                <button
                  key={list.id}
                  onClick={() => handleBulkAddToList(list.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-200 text-left transition-colors"
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color }} />
                  <span className="font-medium text-gray-800">{list.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{list.place_count} miejsc</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBulkListModal(false)}
              className="mt-4 w-full py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlaceRow({ place, selected, onSelect, onStatusChange, onDelete, onNotesChange }) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(place.notes || '')

  const handleNotesBlur = async () => {
    setEditingNotes(false)
    if (notes !== place.notes) {
      await onNotesChange(place.id, notes)
    }
  }

  const statusConfig = STATUS_CONFIG[place.status] || STATUS_CONFIG.active

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50' : ''}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelect(place.id, e.target.checked)}
          className="rounded"
        />
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 line-clamp-1">{place.title}</div>
        {place.business_name && place.business_name !== place.title && (
          <div className="text-xs text-gray-500 line-clamp-1">{place.business_name}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-gray-600 text-xs line-clamp-2">{place.address || '—'}</span>
      </td>
      <td className="px-4 py-3">
        <select
          value={place.status}
          onChange={e => onStatusChange(place.id, e.target.value)}
          className={`text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${statusConfig.className}`}
        >
          <option value="active">Aktywne</option>
          <option value="outdated">Nieaktualne</option>
          <option value="deleted">Usunięte</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(place.lists || []).map(list => (
            <span
              key={list.id}
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: list.color }}
            >
              {list.name}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        {editingNotes ? (
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            onKeyDown={e => e.key === 'Enter' && handleNotesBlur()}
            autoFocus
            className="w-full text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Dodaj notatkę..."
          />
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="text-xs text-gray-600 hover:text-gray-900 text-left w-full line-clamp-2"
            title="Kliknij aby edytować"
          >
            {notes || <span className="text-gray-400 italic">Dodaj notatkę...</span>}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {place.google_maps_url && (
            <a
              href={place.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Otwórz w Google Maps"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <button
            onClick={() => onDelete(place.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Usuń"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}
