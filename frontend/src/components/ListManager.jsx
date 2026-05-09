import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchLists, createList, updateList, deleteList } from '../api.js'
import { exportPlacesUrl } from '../api.js'
import { Plus, Edit2, Trash2, Download, FileText, Map, X, Check } from 'lucide-react'

const PRESET_COLORS = [
  '#4285F4', // Google Blue
  '#34A853', // Google Green
  '#FBBC05', // Google Yellow
  '#EA4335', // Google Red
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#EC4899', // Pink
]

export default function ListManager({ onSelectList }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const queryClient = useQueryClient()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists'],
    queryFn: fetchLists,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lists'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const handleCreate = async (data) => {
    await createList(data)
    invalidate()
    setShowCreate(false)
  }

  const handleUpdate = async (id, data) => {
    await updateList(id, data)
    invalidate()
    setEditingId(null)
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Usunąć listę "${name}"? Miejsca nie zostaną usunięte.`)) return
    await deleteList(id)
    invalidate()
  }

  const handleExport = (format, listId) => {
    const url = exportPlacesUrl(format, listId)
    const a = document.createElement('a')
    a.href = url
    a.click()
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Zarządzanie listami</h2>
            <p className="text-sm text-gray-600 mt-1">Organizuj miejsca w tematyczne listy</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={18} />
            Nowa lista
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-6">
            <ListForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              title="Utwórz nową listę"
            />
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && lists.length === 0 && !showCreate && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-700 font-medium text-lg mb-2">Brak list</p>
            <p className="text-gray-500 text-sm mb-6">Utwórz pierwszą listę, aby organizować swoje miejsca</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
            >
              <Plus size={18} />
              Utwórz listę
            </button>
          </div>
        )}

        {/* Lists */}
        <div className="space-y-3">
          {lists.map(list => (
            <div key={list.id}>
              {editingId === list.id ? (
                <ListForm
                  initialData={list}
                  onSave={(data) => handleUpdate(list.id, data)}
                  onCancel={() => setEditingId(null)}
                  title="Edytuj listę"
                />
              ) : (
                <ListCard
                  list={list}
                  onEdit={() => setEditingId(list.id)}
                  onDelete={() => handleDelete(list.id, list.name)}
                  onSelect={() => onSelectList && onSelectList(list.id)}
                  onExport={handleExport}
                />
              )}
            </div>
          ))}
        </div>

        {/* Global export */}
        {lists.length > 0 && (
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Eksport wszystkich miejsc</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExport('kml', null)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-sm font-medium transition-colors"
              >
                <Map size={16} />
                KML
              </button>
              <button
                onClick={() => handleExport('csv', null)}
                className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-medium transition-colors"
              >
                <FileText size={16} />
                CSV
              </button>
              <button
                onClick={() => handleExport('geojson', null)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium transition-colors"
              >
                <Download size={16} />
                GeoJSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ListCard({ list, onEdit, onDelete, onSelect, onExport }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: list.color }}
          />
          <div className="flex-1 min-w-0">
            <button
              onClick={onSelect}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left block"
            >
              {list.name}
            </button>
            {list.description && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{list.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                {list.place_count} {list.place_count === 1 ? 'miejsce' : 'miejsc'}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(list.created_at).toLocaleDateString('pl-PL')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edytuj"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Usuń listę"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => onExport('kml', list.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-medium transition-colors"
        >
          <Map size={12} />
          KML
        </button>
        <button
          onClick={() => onExport('csv', list.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-medium transition-colors"
        >
          <FileText size={12} />
          CSV
        </button>
        <button
          onClick={() => onExport('geojson', list.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium transition-colors"
        >
          <Download size={12} />
          GeoJSON
        </button>
        <button
          onClick={onSelect}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium transition-colors ml-auto"
        >
          Pokaż miejsca →
        </button>
      </div>
    </div>
  )
}

function ListForm({ initialData, onSave, onCancel, title }) {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [color, setColor] = useState(initialData?.color || '#4285F4')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Nazwa listy jest wymagana')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), description, color })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nazwa <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Np. Restauracje, Hotele..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opis (opcjonalny)</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Krótki opis listy..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Kolor</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? '#1a1a2e' : 'transparent',
                }}
              >
                {color === c && <Check className="text-white" size={14} strokeWidth={3} />}
              </button>
            ))}
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-gray-200"
              title="Własny kolor"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Check size={16} />
            )}
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
            Anuluj
          </button>
        </div>
      </form>
    </div>
  )
}
