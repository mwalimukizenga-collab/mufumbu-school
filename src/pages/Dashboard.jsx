import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  GraduationCap, BookOpen, Users, UserCheck, LayoutDashboard,
  ClipboardList, BarChart2, LogOut, Menu, X, ChevronRight, ListChecks,
  KeyRound, BarChart3, FileCheck, FileText,
} from 'lucide-react'
import DashboardOverview from './DashboardOverview'
import DashboardSubjects from './DashboardSubjects'
import DashboardStudents from './DashboardStudents'
import DashboardAssignment from './DashboardAssignment'
import DashboardTeachers from './DashboardTeachers'
import DashboardTopics from './DashboardTopics'
import DashboardProgress from './DashboardProgress'
import DashboardExams from './DashboardExams'
import DashboardExamMarks from './DashboardExamMarks'
import DashboardResults from './DashboardResults'
import DashboardChangePassword from './DashboardChangePassword'

// Sections available per role
const SECTIONS = {
  admin: [
    { id: 'overview',          label: 'Overview',               icon: LayoutDashboard },
    { id: 'subjects',          label: 'Subject Registration',    icon: BookOpen },
    { id: 'students',          label: 'Students',                icon: Users },
    { id: 'student_subjects',  label: 'Bulk Subject Assignment', icon: ListChecks },
    { id: 'teachers',          label: 'Teachers',                icon: UserCheck },
    { id: 'progress',          label: 'Teaching Progress',       icon: BarChart3 },
    { id: 'exams',             label: 'Exams',                   icon: ClipboardList },
    { id: 'results',           label: 'Results',                 icon: BarChart2 },
    { id: 'password',          label: 'Change Password',         icon: KeyRound },
  ],
  academic_master: [
    { id: 'overview',  label: 'Overview',             icon: LayoutDashboard },
    { id: 'subjects',  label: 'Subject Registration',  icon: BookOpen },
    { id: 'exams',     label: 'Exams',                 icon: ClipboardList },
    { id: 'progress',  label: 'Teaching Progress',     icon: BarChart3 },
    { id: 'results',   label: 'Results',               icon: BarChart2 },
    { id: 'syllabus',  label: 'Syllabus Progress',     icon: ClipboardList },
    { id: 'password',  label: 'Change Password',       icon: KeyRound },
  ],
  teacher: [
    { id: 'overview',  label: 'Overview',        icon: LayoutDashboard },
    { id: 'topics',    label: 'My Topics',        icon: FileCheck },
    { id: 'marks',     label: 'Enter Marks',      icon: FileText },
    { id: 'syllabus',  label: 'My Syllabus',      icon: ClipboardList },
    { id: 'password',  label: 'Change Password',  icon: KeyRound },
  ],
}

function SectionContent({ id, setActive }) {
  switch (id) {
    case 'overview':         return <DashboardOverview onNavigate={setActive} />
    case 'subjects':         return <DashboardSubjects />
    case 'students':         return <DashboardStudents />
    case 'student_subjects': return <DashboardAssignment />
    case 'teachers':         return <DashboardTeachers />
    case 'topics':           return <DashboardTopics />
    case 'progress':         return <DashboardProgress />
    case 'exams':            return <DashboardExams />
    case 'marks':            return <DashboardExamMarks />
    case 'results':          return <DashboardResults />
    case 'password':         return <DashboardChangePassword />
    default:
      return (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 capitalize">{id}</h2>
          <p className="text-gray-500 text-sm">This section is under construction.</p>
        </div>
      )
  }
}

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [active, setActive] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const role = profile?.role ?? 'teacher'
  const sections = SECTIONS[role] ?? SECTIONS.teacher
  const currentSection = sections.find(s => s.id === active) ?? sections[0]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const NavItem = ({ section }) => (
    <button
      onClick={() => { setActive(section.id); setSidebarOpen(false) }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition group ${
        active === section.id
          ? 'bg-green-700 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <section.icon size={18} className={active === section.id ? 'text-green-200' : 'text-gray-400 group-hover:text-gray-600'} />
      <span className="flex-1 text-left">{section.label}</span>
      {active === section.id && <ChevronRight size={14} className="text-green-300" />}
    </button>
  )

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
        <div className="bg-green-700 rounded-xl p-2">
          <GraduationCap size={20} className="text-white" />
        </div>
        <div className="leading-tight min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">Mufumbu SS</p>
          <p className="text-xs text-gray-400 truncate">Academic System</p>
        </div>
      </div>

      {/* User card */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-800 truncate">{profile?.full_name ?? user?.email}</p>
          <p className="text-xs text-green-700 font-medium mt-0.5 capitalize">
            {role.replace('_', ' ')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {sections.map(s => <NavItem key={s.id} section={s} />)}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                     text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64
        transform transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar />
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GraduationCap size={20} className="text-green-700 shrink-0" />
            <span className="font-bold text-gray-900 text-sm truncate">Mufumbu SS</span>
          </div>
          <span className="text-sm font-medium text-gray-700 truncate">
            {currentSection.label}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-6 lg:px-8">
            <SectionContent id={active} setActive={setActive} />
          </div>
        </main>
      </div>
    </div>
  )
}
