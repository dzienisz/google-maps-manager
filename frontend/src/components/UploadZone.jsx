import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadFile } from '../api.js'
import { Upload, FileJson, Archive, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function UploadZone({ onSuccess }) {
  const [status, setStatus] = useState('idle') // idle | uploading | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleFile = useCallback(async (file) => {
    setStatus('uploading')
    setError(null)
    setResult(null)

    try {
      const data = await uploadFile(file)
      setResult(data)
      setStatus('success')
      if (onSuccess) {
        setTimeout(() => onSuccess(data), 1500)
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [onSuccess])

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      handleFile(acceptedFiles[0])
    }
  }, [handleFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    disabled: status === 'uploading',
  })

  const reset = () => {
    setStatus('idle')
    setResult(null)
    setError(null)
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Jak uzyskać plik eksportu?</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Wejdź na <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">takeout.google.com</a></li>
          <li>Wybierz tylko <strong>Mapy (Twoje miejsca)</strong></li>
          <li>Pobierz archiwum ZIP</li>
          <li>Prześlij plik ZIP lub wypakowany plik <code className="bg-blue-100 px-1 rounded">Saved Places.json</code></li>
        </ol>
      </div>

      {/* Drop Zone */}
      {status === 'idle' || status === 'error' ? (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />

          <div className="flex justify-center gap-4 mb-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <Archive className="text-blue-600" size={28} />
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <FileJson className="text-green-600" size={28} />
            </div>
          </div>

          {isDragActive ? (
            <p className="text-blue-600 font-semibold text-lg">Upuść plik tutaj...</p>
          ) : (
            <>
              <p className="text-gray-700 font-semibold text-lg mb-2">
                Przeciągnij plik lub kliknij, aby wybrać
              </p>
              <p className="text-gray-500 text-sm">
                Obsługiwane formaty: <strong>.zip</strong> (Google Takeout) lub <strong>.json</strong> (Saved Places)
              </p>
              <p className="text-gray-400 text-xs mt-2">Maksymalny rozmiar: 50 MB</p>
            </>
          )}
        </div>
      ) : null}

      {/* Uploading state */}
      {status === 'uploading' && (
        <div className="border-2 border-blue-300 bg-blue-50 rounded-xl p-12 text-center">
          <Loader className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
          <p className="text-blue-700 font-semibold text-lg">Przetwarzanie pliku...</p>
          <p className="text-blue-500 text-sm mt-1">Może to chwilę potrwać w zależności od rozmiaru pliku</p>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && result && (
        <div className="border-2 border-green-300 bg-green-50 rounded-xl p-8 text-center">
          <CheckCircle className="text-green-500 mx-auto mb-4" size={48} />
          <p className="text-green-700 font-bold text-xl mb-2">Import zakończony!</p>
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{result.inserted}</div>
              <div className="text-sm text-green-700">Dodano miejsc</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-500">{result.skipped}</div>
              <div className="text-sm text-gray-600">Pominięto duplikatów</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{result.total}</div>
              <div className="text-sm text-blue-700">Łącznie</div>
            </div>
          </div>
          <button
            onClick={reset}
            className="mt-6 text-sm text-green-600 hover:text-green-800 underline"
          >
            Importuj kolejny plik
          </button>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && error && (
        <div className="border-2 border-red-300 bg-red-50 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <p className="text-red-700 font-semibold">Błąd importu</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              <button
                onClick={reset}
                className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
              >
                Spróbuj ponownie
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
