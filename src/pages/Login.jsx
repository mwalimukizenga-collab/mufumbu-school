import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GraduationCap, Lock, Mail, Eye, EyeOff, Users, BookOpen, Award } from 'lucide-react'
import ResultsTicker from '../components/ui/ResultsTicker'

// TEST MARKER v3

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('Invalid email or password.')
    else navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* Ticker */}
      <ResultsTicker />

      {/* Body */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">

        {/* ── Left: branding ── */}
        <div className="lg:w-[55%] bg-green-800 text-white flex flex-col p-8 lg:p-14 gap-10">

          {/* Logo row */}
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-2.5">
              <GraduationCap size={30} className="text-green-300" />
            </div>
            <div className="leading-tight">
              <p className="font-bold text-lg">Mufumbu Secondary School</p>
              <p className="text-green-400 text-xs">Academic Management System</p>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-3xl lg:text-4xl font-bold leading-snug">
              One platform for<br />
              <span className="text-green-300">results & teaching</span>
            </h1>
            <p className="text-green-200 text-sm leading-relaxed max-w-sm">
              Track syllabus coverage, publish exam results, manage student
              performance and monitor teaching progress — all in one place.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Users,         value: '800+', label: 'Students'  },
              { icon: BookOpen,      value: '45+',  label: 'Teachers'  },
              { icon: Award,         value: '92%',  label: 'Pass rate' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label}
                className="bg-white/10 rounded-xl p-4 flex flex-col gap-2">
                <Icon size={18} className="text-green-300" />
                <p className="text-xl font-bold">{value}</p>
                <p className="text-green-300 text-xs">{label}</p>
              </div>
            ))}
          </div>

          {/* Levels badge */}
          <div className="flex flex-wrap gap-2">
            {['O-Level · S1–S4', 'A-Level · S5–S6'].map(b => (
              <span key={b}
                className="bg-white/10 border border-white/20 text-green-200
                           text-xs font-medium px-3 py-1.5 rounded-full">
                {b}
              </span>
            ))}
          </div>

          {/* Bottom contact */}
          <div className="mt-auto pt-6 border-t border-white/10">
            <p className="text-green-400 text-xs">
              mufumbu.ss@edu.cd &nbsp;·&nbsp; +243 000 000 000
            </p>
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="lg:w-[45%] flex items-center justify-center
                        bg-gray-50 p-8 lg:p-14">
          <div className="w-full max-w-sm">

            <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
            <p className="text-gray-500 text-sm mb-8">
              Use your school account credentials.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600
                                rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@mufumbu.ac"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                               text-sm bg-white focus:outline-none focus:ring-2
                               focus:ring-green-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <Lock size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg
                               text-sm bg-white focus:outline-none focus:ring-2
                               focus:ring-green-500 focus:border-transparent transition"
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2
                               text-gray-400 hover:text-gray-600 transition">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-700 hover:bg-green-600 active:scale-[0.99]
                           text-white font-semibold py-2.5 rounded-lg text-sm transition
                           disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Signing in…
                  </>
                ) : 'Sign In'}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Public results */}
            <Link
              to="/results"
              className="block text-center text-sm text-green-700 hover:text-green-600
                         font-medium border border-green-200 hover:border-green-400
                         rounded-lg py-2.5 transition"
            >
              View public results — no login required
            </Link>

            <p className="text-xs text-gray-400 text-center mt-6">
              For account issues, contact the school administration.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
