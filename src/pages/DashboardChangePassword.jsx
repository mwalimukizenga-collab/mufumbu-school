import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { KeyRound, Eye, EyeOff, Loader, Check } from 'lucide-react'

export default function DashboardChangePassword() {
  const toast = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      toast.warning('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.warning('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)

    if (error) {
      if (error.message?.toLowerCase().includes('session')) {
        toast.error('Session expired. Please sign out and log in again, then retry.')
      } else {
        toast.error(error.message)
      }
      return
    }

    setDone(true)
    toast.success('Password changed successfully.')
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password Changed</h2>
        <p className="text-sm text-gray-500">Your password has been updated successfully.</p>
        <button onClick={() => { setDone(false); setNewPassword(''); setConfirmPassword('') }}
          className="text-sm text-green-700 font-medium hover:underline">
          Change again
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <KeyRound size={20} className="text-green-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
            <p className="text-sm text-gray-500">Set a new password for your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                placeholder="Min. 6 characters"
              />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              placeholder="Repeat new password"
            />
          </div>

          <button type="submit" disabled={loading || !newPassword || !confirmPassword}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2">
            {loading ? <Loader size={15} className="animate-spin" /> : null}
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center">
          You will need to use the new password next time you log in.
        </p>
      </div>
    </div>
  )
}
