import { createContext, useContext, useState, useCallback } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)

  const confirm = useCallback((opts) =>
    new Promise(resolve => setDialog({ ...opts, resolve }))
  , [])

  const handle = (result) => {
    dialog?.resolve(result)
    setDialog(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && <ConfirmModal dialog={dialog} onConfirm={() => handle(true)} onCancel={() => handle(false)} />}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

// ── Modal ─────────────────────────────────────────────────────────────────────
function ConfirmModal({ dialog, onConfirm, onCancel }) {
  const { title = 'Are you sure?', message, confirmLabel = 'Delete', variant = 'danger' } = dialog

  const btnCls = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-green-700 hover:bg-green-600 text-white'

  const iconCls = variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'
  const Icon    = variant === 'danger' ? Trash2 : AlertTriangle
  const iconColor = variant === 'danger' ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm animate-fade-in">
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${iconCls}`}>
            <Icon size={22} className={iconColor} />
          </div>

          {/* Text */}
          <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
          {message && <p className="text-sm text-gray-500 leading-relaxed">{message}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5
                       text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${btnCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
