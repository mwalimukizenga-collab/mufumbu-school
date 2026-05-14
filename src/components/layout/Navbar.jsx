import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { GraduationCap, LogOut, Menu, X, LayoutDashboard } from 'lucide-react'
import { useState } from 'react'

export default function Navbar() {
  const { user, profile, isStaff, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const close = () => setMenuOpen(false)

  return (
    <nav className="bg-green-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <GraduationCap size={28} />
            <span>Mufumbu SS</span>
          </Link>

          <div className="hidden md:flex items-center gap-5 text-sm font-medium">
            <Link to="/" className="hover:text-green-200 transition">Home</Link>
            <Link to="/results" className="hover:text-green-200 transition">Results</Link>
            <Link to="/students" className="hover:text-green-200 transition">Students</Link>
            <Link to="/teachers" className="hover:text-green-200 transition">Teachers</Link>
            {isStaff && (
              <Link to="/syllabus" className="hover:text-green-200 transition">Syllabus</Link>
            )}

            {user ? (
              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-green-600">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-1 hover:text-green-200 transition"
                >
                  <LayoutDashboard size={15} />
                  {profile?.full_name?.split(' ')[0] ?? 'Dashboard'}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1 hover:text-red-300 transition"
                >
                  <LogOut size={15} /> Sign Out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded-lg transition"
              >
                Sign In
              </Link>
            )}
          </div>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-green-900 px-4 pb-4 flex flex-col gap-3 text-sm font-medium">
          <Link to="/"          onClick={close}>Home</Link>
          <Link to="/results"   onClick={close}>Results</Link>
          <Link to="/students"  onClick={close}>Students</Link>
          <Link to="/teachers"  onClick={close}>Teachers</Link>
          {isStaff && <Link to="/syllabus" onClick={close}>Syllabus</Link>}
          {user ? (
            <>
              <Link to="/dashboard" onClick={close}>Dashboard</Link>
              <button onClick={handleSignOut} className="text-left text-red-300">Sign Out</button>
            </>
          ) : (
            <Link to="/login" onClick={close}>Sign In</Link>
          )}
        </div>
      )}
    </nav>
  )
}
