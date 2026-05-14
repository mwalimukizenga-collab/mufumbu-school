import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react'

// ── Context ───────────────────────────────────────────────────────────────────
const ToastContext = createContext(null)

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback(id => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback(({ message, type = 'success', duration = 4000 }) => {
    const id = ++nextId
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  // Shortcuts
  toast.success = (msg, opts) => toast({ message: msg, type: 'success', ...opts })
  toast.error   = (msg, opts) => toast({ message: msg, type: 'error',   duration: 6000, ...opts })
  toast.warning = (msg, opts) => toast({ message: msg, type: 'warning', ...opts })

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// ── Visual config ─────────────────────────────────────────────────────────────
const CONFIG = {
  success: {
    icon: CheckCircle,
    bar:  'bg-green-500',
    icon_cls: 'text-green-500',
    border:   'border-green-200',
    bg:       'bg-green-50',
  },
  error: {
    icon: XCircle,
    bar:  'bg-red-500',
    icon_cls: 'text-red-500',
    border:   'border-red-200',
    bg:       'bg-red-50',
  },
  warning: {
    icon: AlertTriangle,
    bar:  'bg-amber-500',
    icon_cls: 'text-amber-500',
    border:   'border-amber-200',
    bg:       'bg-amber-50',
  },
}

// ── Container + individual toast ──────────────────────────────────────────────
function ToastContainer({ toasts, dismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} dismiss={dismiss} />
      ))}
    </div>
  )
}

function ToastItem({ id, message, type, dismiss }) {
  const { icon: Icon, bar, icon_cls, border, bg } = CONFIG[type] ?? CONFIG.success
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${border} ${bg}
                  shadow-lg px-4 py-3 animate-fade-in`}
    >
      {/* Colour bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${bar}`} style={{ position: 'relative', width: 4, borderRadius: 4, alignSelf: 'stretch', flexShrink: 0, background: 'transparent' }} />
      <Icon size={18} className={`${icon_cls} shrink-0 mt-0.5`} />
      <p className="flex-1 text-sm text-gray-800 leading-snug">{message}</p>
      <button
        onClick={() => dismiss(id)}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition mt-0.5"
      >
        <X size={15} />
      </button>
    </div>
  )
}
