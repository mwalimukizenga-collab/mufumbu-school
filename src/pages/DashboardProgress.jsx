import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  Loader, AlertTriangle, CheckCircle, Clock, BookOpen, Users, X,
  Search, ChevronDown, BarChart2, UserCheck, GraduationCap,
} from 'lucide-react'

export default function DashboardProgress() {
  const [view, setView] = useState('teacher')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTeacher, setFilterTeacher] = useState('all')
  const [filterClass, setFilterClass] = useState('all')
  const [filterSubject, setFilterSubject] = useState('all')
  const [dismissAlerts, setDismissAlerts] = useState(false)

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const { data: teachers } = useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers').select('*').order('full_name')
      if (error) throw error
      return data
    },
  })

  const { data: assignments } = useQuery({
    queryKey: ['teacher_assignments_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('*, subjects(name, code, level), classes(name, level), teachers(full_name)')
        .order('id')
      if (error) throw error
      return data
    },
  })

  const { data: allTopics } = useQuery({
    queryKey: ['all_syllabus_topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('syllabus_topics')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  // ── Computed ──────────────────────────────────────────────────────────────

  const assignmentsByTeacher = useMemo(() => {
    const map = {}
    assignments?.forEach(a => {
      const tid = a.teacher_id
      if (!map[tid]) map[tid] = []
      map[tid].push(a)
    })
    return map
  }, [assignments])

  const topicsByAssignment = useMemo(() => {
    const map = {}
    allTopics?.forEach(t => {
      if (!map[t.assignment_id]) map[t.assignment_id] = []
      map[t.assignment_id].push(t)
    })
    return map
  }, [allTopics])

  const teacherProgress = useMemo(() => {
    if (!teachers || !assignments) return []

    return teachers.map(t => {
      const tAssigns = assignmentsByTeacher[t.id] || []
      const totalAssignments = tAssigns.length
      let totalTopics = 0
      let completedTopics = 0
      const alerts = []

      tAssigns.forEach(a => {
        const topics = topicsByAssignment[a.id] || []
        totalTopics += topics.length
        completedTopics += topics.filter(topic => topic.status === 'completed').length

        if (topics.length === 0) {
          alerts.push({
            assignmentId: a.id,
            subject: a.subjects?.name,
            className: a.classes?.name,
            message: `No topics for ${a.subjects?.name} — ${a.classes?.name}`,
          })
        }
      })

      const completionPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0

      return {
        ...t,
        totalAssignments,
        totalTopics,
        completedTopics,
        completionPct,
        alerts,
        assignments: tAssigns,
      }
    })
  }, [teachers, assignments, assignmentsByTeacher, topicsByAssignment])

  const classProgress = useMemo(() => {
    const map = {}
    assignments?.forEach(a => {
      const key = a.class_id
      if (!map[key]) {
        map[key] = {
          classId: a.class_id,
          className: a.classes?.name,
          level: a.classes?.level,
          totalAssignments: 0,
          totalTopics: 0,
          completedTopics: 0,
          subjects: [],
        }
      }
      const topics = topicsByAssignment[a.id] || []
      map[key].totalAssignments++
      map[key].totalTopics += topics.length
      map[key].completedTopics += topics.filter(t => t.status === 'completed').length
      map[key].subjects.push({
        subjectId: a.subject_id,
        subjectName: a.subjects?.name,
        subjectCode: a.subjects?.code,
        teacherName: a.teachers?.full_name,
        topicCount: topics.length,
        completedCount: topics.filter(t => t.status === 'completed').length,
      })
    })
    return Object.values(map)
  }, [assignments, topicsByAssignment])

  const subjectProgress = useMemo(() => {
    const map = {}
    assignments?.forEach(a => {
      const key = a.subject_id
      if (!map[key]) {
        map[key] = {
          subjectId: a.subject_id,
          subjectName: a.subjects?.name,
          subjectCode: a.subjects?.code,
          level: a.subjects?.level,
          totalAssignments: 0,
          totalTopics: 0,
          completedTopics: 0,
          teachers: [],
          classes: [],
        }
      }
      const topics = topicsByAssignment[a.id] || []
      map[key].totalAssignments++
      map[key].totalTopics += topics.length
      map[key].completedTopics += topics.filter(t => t.status === 'completed').length
      if (a.teachers?.full_name && !map[key].teachers.includes(a.teachers.full_name)) {
        map[key].teachers.push(a.teachers.full_name)
      }
      if (a.classes?.name && !map[key].classes.includes(a.classes.name)) {
        map[key].classes.push(a.classes.name)
      }
    })
    return Object.values(map)
  }, [assignments, topicsByAssignment])

  const filteredTeachers = useMemo(() => {
    let items = teacherProgress
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      items = items.filter(t =>
        t.full_name.toLowerCase().includes(q) ||
        t.employee_number?.toLowerCase().includes(q)
      )
    }
    if (filterClass !== 'all') {
      items = items.filter(t =>
        t.assignments?.some(a => a.class_id === Number(filterClass))
      )
    }
    if (filterSubject !== 'all') {
      items = items.filter(t =>
        t.assignments?.some(a => a.subject_id === Number(filterSubject))
      )
    }
    return items
  }, [teacherProgress, searchTerm, filterClass, filterSubject])

  // ── Unique filter options ─────────────────────────────────────────────────

  const classOptions = useMemo(() => {
    const set = new Set()
    assignments?.forEach(a => set.add(JSON.stringify({ id: a.class_id, name: a.classes?.name })))
    return [...set].map(s => JSON.parse(s)).filter(c => c.id)
  }, [assignments])

  const subjectOptions = useMemo(() => {
    const set = new Set()
    assignments?.forEach(a => set.add(JSON.stringify({ id: a.subject_id, name: a.subjects?.name })))
    return [...set].map(s => JSON.parse(s)).filter(s => s.id)
  }, [assignments])

  const isLoading = !teachers || !assignments || !allTopics

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
  }

  const totalAlerts = teacherProgress.reduce((sum, t) => sum + t.alerts.length, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 size={22} /> Teaching Progress
        </h2>
        <p className="text-sm text-gray-500">Monitor topic coverage across teachers, classes, and subjects</p>
      </div>

      {/* Alerts summary */}
      {!dismissAlerts && totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 relative">
          <button onClick={() => setDismissAlerts(true)}
            className="absolute top-3 right-3 text-amber-400 hover:text-amber-600 transition">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
            <AlertTriangle size={16} />
            {totalAlerts} assignment(s) without topics
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {teacherProgress.filter(t => t.alerts.length > 0).map(t =>
              t.alerts.map((a, i) => (
                <p key={`${t.id}-${i}`} className="text-xs text-amber-700 ml-5">
                  {t.full_name}: {a.message}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
          <p className="text-xs text-gray-500 mt-1">Teachers</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
          <p className="text-xs text-gray-500 mt-1">Assignments</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{allTopics.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Topics</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-600">
            {allTopics.filter(t => t.status === 'completed').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Completed</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        {[
          { id: 'teacher', label: 'By Teacher', icon: UserCheck },
          { id: 'class', label: 'By Class', icon: Users },
          { id: 'subject', label: 'By Subject', icon: BookOpen },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              view === v.id ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <v.icon size={15} />
            {v.label}
          </button>
        ))}
      </div>

      {/* ── BY TEACHER VIEW ── */}
      {view === 'teacher' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search teacher..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
            <div className="relative">
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="all">All Classes</option>
                {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="all">All Subjects</option>
                {subjectOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Teacher cards */}
          <div className="space-y-3">
            {filteredTeachers.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <UserCheck size={40} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">No teachers match filters</p>
              </div>
            )}
            {filteredTeachers.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {t.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{t.full_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.totalAssignments} subject(s) · {t.totalTopics} topic(s) · {t.completedTopics} completed
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-lg font-bold ${t.completionPct >= 75 ? 'text-green-600' : t.completionPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {t.completionPct}%
                      </span>
                      <p className="text-xs text-gray-400">completion</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${t.completionPct >= 75 ? 'bg-green-500' : t.completionPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${t.completionPct}%` }}
                    />
                  </div>

                  {/* Alerts */}
                  {t.alerts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {t.alerts.map((a, i) => (
                        <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <AlertTriangle size={10} />
                          {a.subject} — {a.className}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assignment breakdown */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {t.assignments.map(a => {
                      const at = topicsByAssignment[a.id] || []
                      const ac = at.filter(t => t.status === 'completed').length
                      return (
                        <div key={a.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                          <span className="font-medium text-gray-700">{a.subjects?.name}</span>
                          <span className="text-gray-400"> — {a.classes?.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-500">{at.length} topic(s)</span>
                            {ac > 0 && <span className="text-green-600 font-medium">{ac} done</span>}
                            {at.length === 0 && <span className="text-amber-600 flex items-center gap-0.5"><AlertTriangle size={10} /> No topics</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BY CLASS VIEW ── */}
      {view === 'class' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classProgress.map(c => {
            const pct = c.totalTopics > 0 ? Math.round((c.completedTopics / c.totalTopics) * 100) : 0
            return (
              <div key={c.classId} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap size={18} className="text-gray-400" />
                    <h3 className="font-semibold text-gray-900">{c.className}</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{c.level?.replace('_', '-')}</span>
                  </div>
                  <span className={`text-sm font-bold ${pct >= 75 ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500">
                  {c.totalTopics} topics · {c.completedTopics} completed · {c.totalAssignments} subjects
                </p>
                <div className="space-y-1">
                  {c.subjects.map(s => (
                    <div key={s.subjectId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{s.subjectName}</span>
                      <span className="text-gray-500">{s.completedCount}/{s.topicCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {classProgress.length === 0 && (
            <div className="col-span-2 text-center py-16 text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No class data available</p>
            </div>
          )}
        </div>
      )}

      {/* ── BY SUBJECT VIEW ── */}
      {view === 'subject' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subjectProgress.map(s => {
            const pct = s.totalTopics > 0 ? Math.round((s.completedTopics / s.totalTopics) * 100) : 0
            return (
              <div key={s.subjectId} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-gray-400" />
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.subjectName}</h3>
                      <p className="text-xs text-gray-400">{s.subjectCode}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${pct >= 75 ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500">
                  {s.totalTopics} topics · {s.completedTopics} completed · {s.teachers.length} teacher(s) · {s.classes.join(', ')}
                </p>
              </div>
            )
          })}
          {subjectProgress.length === 0 && (
            <div className="col-span-2 text-center py-16 text-gray-400">
              <BookOpen size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No subject data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
