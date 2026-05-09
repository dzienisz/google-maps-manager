import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchStats } from './api.js'
import UploadZone from './components/UploadZone.jsx'
import PlacesList from './components/PlacesList.jsx'
import MapView from './components/MapView.jsx'
import DuplicateFinder from './components/DuplicateFinder.jsx'
import ListManager from './components/ListManager.jsx'
import { MapPin, List, Copy, Layers, Upload, Map, X } from 'lucide-react'

const TABS = [
  { id: 'map', label: 'Mapa', icon: Map },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'duplicates', label: 'Duplikaty', icon: Copy },
  { id: 'lists', label: 'Listy', icon: Layers },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('map')
  const [showUpload, setShowUpload] = useState(false)
  const [filters, setFilters] = useState({ status: 'all', listId: '', search: '' })
  const [selectedPlaces, setSelectedPlaces] = useState(new Set())

  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  })

  const handleUploadSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['places'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    setShowUpload(false)
  }, [queryClient])

  const hasPlaces = stats && stats.total > 0

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold text-gray-900">Google Maps Manager</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats badges */}
          {stats && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                Wszystkie: {stats.total}
              </span>
              <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
                Aktywne: {stats.active}
              </span>
              {stats.outdated > 0 && (
                <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-1 rounded-full">
                  Nieaktualne: {stats.outdated}
                </span>
              )}
              {stats.deleted > 0 && (
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded-full">
                  Usunięte: {stats.deleted}
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Importuj</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-16 sm:w-48 flex-shrink-0 flex flex-col py-4 gap-1 px-2" style={{ backgroundColor: '#1a1a2e' }}>
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium w-full ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}

          <div className="flex-1" />

          {/* Stats in sidebar */}
          {stats && (
            <div className="hidden sm:block px-3 py-3 text-xs text-gray-500">
              <div className="font-medium text-gray-400 mb-2">Statystyki</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Wszystkie</span>
                  <span className="text-white font-medium">{stats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Aktywne</span>
                  <span className="text-green-400 font-medium">{stats.active}</span>
                </div>
                <div className="flex justify-between">
                  <span>Nieaktualne</span>
                  <span className="text-yellow-400 font-medium">{stats.outdated}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {!hasPlaces && !showUpload && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="text-6xl mb-6">📍</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Witaj w Google Maps Manager
                </h2>
                <p className="text-gray-600 mb-6">
                  Zaimportuj swoje zapisane miejsca z Google Takeout, aby zacząć zarządzać kolekcją.
                </p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  <Upload size={20} />
                  Importuj miejsca
                </button>
              </div>
            </div>
          )}

          {hasPlaces && activeTab === 'map' && (
            <MapView filters={filters} setFilters={setFilters} />
          )}
          {hasPlaces && activeTab === 'list' && (
            <PlacesList
              filters={filters}
              setFilters={setFilters}
              selectedPlaces={selectedPlaces}
              setSelectedPlaces={setSelectedPlaces}
            />
          )}
          {hasPlaces && activeTab === 'duplicates' && (
            <DuplicateFinder />
          )}
          {hasPlaces && activeTab === 'lists' && (
            <ListManager
              onSelectList={(listId) => {
                setFilters(f => ({ ...f, listId: String(listId) }))
                setActiveTab('list')
              }}
            />
          )}
        </main>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Importuj miejsca</h2>
              <button
                onClick={() => setShowUpload(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <UploadZone onSuccess={handleUploadSuccess} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
