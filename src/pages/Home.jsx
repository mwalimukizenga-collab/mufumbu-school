import { GraduationCap, BookOpen, Users, Award } from 'lucide-react'
import { Link } from 'react-router-dom'

const stats = [
  { label: 'Students', value: '800+', icon: Users },
  { label: 'Teachers', value: '45+', icon: BookOpen },
  { label: 'Classes', value: 'S1 – S6', icon: GraduationCap },
  { label: 'Pass Rate', value: '92%', icon: Award },
]

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-green-800 text-white py-20 px-4 text-center">
        <GraduationCap size={64} className="mx-auto mb-4 text-green-300" />
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Mufumbu Secondary School</h1>
        <p className="text-green-200 text-lg max-w-2xl mx-auto mb-8">
          Committed to academic excellence, strong values, and the growth of every student.
          Welcome to our school management system.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            to="/results"
            className="bg-white text-green-800 font-semibold px-6 py-3 rounded-lg hover:bg-green-50 transition"
          >
            View Results
          </Link>
          <Link
            to="/students"
            className="border border-white text-white px-6 py-3 rounded-lg hover:bg-green-700 transition"
          >
            Students
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-5xl mx-auto px-4 py-16 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl shadow p-6 text-center">
            <Icon size={36} className="mx-auto text-green-700 mb-2" />
            <p className="text-3xl font-bold text-gray-800">{value}</p>
            <p className="text-gray-500 text-sm mt-1">{label}</p>
          </div>
        ))}
      </section>

      {/* Quick links */}
      <section className="bg-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-8">Quick Access</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Exam Results', desc: 'View student results by class and exam period', to: '/results' },
              { title: 'Student Directory', desc: 'Browse all enrolled students and their details', to: '/students' },
              { title: 'Teaching Staff', desc: 'View teachers and the subjects they teach', to: '/teachers' },
            ].map(({ title, desc, to }) => (
              <Link
                key={title}
                to={to}
                className="border border-gray-200 rounded-xl p-6 hover:border-green-500 hover:shadow-md transition text-left"
              >
                <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
