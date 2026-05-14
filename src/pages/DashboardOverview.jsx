import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Users, GraduationCap, ClipboardList, BarChart2, BookOpen,
  UserCheck, ListChecks, FileCheck, BarChart3, ArrowRight,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Award, Zap,
  CalendarDays, BookMarked,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts'

// ─── colour palette helpers ───────────────────────────────────────────────────
const COLOR_MAP = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   border: 'border-blue-100'   },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-100' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-100' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-700',  border: 'border-green-100'  },
  teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600',   border: 'border-teal-100'   },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100' },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  border: 'border-amber-100'  },
}

const STAT_COLORS = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600'   },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-700'  },
}

const EXAM_TYPE_LABEL = { midterm: 'Midterm', terminal: 'Terminal', annual: 'Annual', mock: 'Mock' }

const initials = (name) =>
  (name ?? '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const formatDate = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, onClick }) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.blue
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-left
                 hover:shadow-md hover:border-gray-300 transition-all w-full group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1.5 tabular-nums">
            {(value ?? 0).toLocaleString()}
          </p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`shrink-0 p-2.5 rounded-xl ${c.bg} group-hover:scale-105 transition-transform`}>
          <Icon size={22} className={c.icon} />
        </div>
      </div>
    </button>
  )
}

// ─── SectionCard wrapper ──────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, iconColor, iconBg, onViewAll, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${iconBg}`}>
            <Icon size={15} className={iconColor} />
          </div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-xs text-green-700 font-medium hover:underline"
          >
            View all <ArrowRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardOverview({ onNavigate }) {
  const { profile } = useAuth()
  const role     = profile?.role ?? 'teacher'
  const isAdmin  = role === 'admin'

  // ── Queries ──
  const { data: studentsCount = 0 } = useQuery({
    queryKey: ['ov', 'students'],
    queryFn: async () => {
      const { count } = await supabase
        .from('students').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: teachersCount = 0 } = useQuery({
    queryKey: ['ov', 'teachers'],
    queryFn: async () => {
      const { count } = await supabase
        .from('teachers').select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: examsStats = { total: 0, published: 0 } } = useQuery({
    queryKey: ['ov', 'exams'],
    queryFn: async () => {
      const { data } = await supabase.from('exams').select('is_published')
      if (!data) return { total: 0, published: 0 }
      return {
        total:     data.length,
        published: data.filter((e) => e.is_published).length,
      }
    },
  })

  const { data: rawTopics = [] } = useQuery({
    queryKey: ['ov', 'in_progress'],
    queryFn: async () => {
      const { data } = await supabase
        .from('syllabus_topics')
        .select(`
          id, title, created_at, status,
          teacher_assignments (
            teachers ( id, full_name ),
            subjects  ( name, code ),
            classes   ( name )
          )
        `)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(60)
      return data ?? []
    },
  })

  const { data: recentExams = [] } = useQuery({
    queryKey: ['ov', 'recent_exams'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exams')
        .select('id, name, type, level, is_published, academic_year, exam_classes(classes(name))')
        .order('created_at', { ascending: false })
        .limit(5)
      return data ?? []
    },
  })

  const { data: topicStats = { completed: 0, in_progress: 0, not_started: 0, total: 0 } } = useQuery({
    queryKey: ['ov', 'topic_stats'],
    queryFn: async () => {
      const { data } = await supabase.from('syllabus_topics').select('status')
      if (!data) return { completed: 0, in_progress: 0, not_started: 0, total: 0 }
      return {
        completed:   data.filter((t) => t.status === 'completed').length,
        in_progress: data.filter((t) => t.status === 'in_progress').length,
        not_started: data.filter((t) => t.status === 'not_started').length,
        total:       data.length,
      }
    },
  })

  // ── Derived ──
  const teacherTopics = useMemo(() => {
    const map = new Map()
    for (const topic of rawTopics) {
      const ta      = topic.teacher_assignments
      const teacher = ta?.teachers
      if (!teacher) continue
      if (!map.has(teacher.id)) {
        map.set(teacher.id, {
          teacher,
          subject:   ta.subjects,
          classInfo: ta.classes,
          topics:    [],
        })
      }
      const entry = map.get(teacher.id)
      if (entry.topics.length < 3) entry.topics.push(topic)
    }
    return [...map.values()].slice(0, 3)
  }, [rawTopics])

  const completionPct = topicStats.total > 0
    ? Math.round((topicStats.completed / topicStats.total) * 100)
    : 0

  const chartData = [
    { name: 'Completed',   value: topicStats.completed,   color: '#16a34a' },
    { name: 'In Progress', value: topicStats.in_progress,  color: '#f59e0b' },
    { name: 'Not Started', value: topicStats.not_started,  color: '#d1d5db' },
  ].filter((d) => d.value > 0)

  // ── Quick links ──
  const quickLinks = isAdmin
    ? [
        { id: 'students',         label: 'Students',          icon: Users,         color: 'blue'   },
        { id: 'teachers',         label: 'Teachers',          icon: UserCheck,     color: 'purple' },
        { id: 'exams',            label: 'Exams',             icon: ClipboardList, color: 'orange' },
        { id: 'results',          label: 'Results',           icon: BarChart2,     color: 'green'  },
        { id: 'progress',         label: 'Teaching Progress', icon: BarChart3,     color: 'teal'   },
        { id: 'student_subjects', label: 'Bulk Assignment',   icon: ListChecks,    color: 'indigo' },
      ]
    : [
        { id: 'subjects',  label: 'Subjects',          icon: BookOpen,      color: 'blue'   },
        { id: 'exams',     label: 'Exams',             icon: ClipboardList, color: 'orange' },
        { id: 'results',   label: 'Results',           icon: BarChart2,     color: 'green'  },
        { id: 'progress',  label: 'Teaching Progress', icon: BarChart3,     color: 'teal'   },
        { id: 'syllabus',  label: 'Syllabus',          icon: FileCheck,     color: 'purple' },
      ]

  // ── Render ──
  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting()}, {profile?.full_name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{formatDate()}</p>
        </div>
        <span className="self-start sm:self-center inline-flex items-center gap-2
                         px-3 py-1.5 rounded-full bg-green-100 text-green-800
                         text-xs font-semibold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
          {role.replace('_', ' ')}
        </span>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value={studentsCount}
          icon={Users}
          color="blue"
          onClick={() => onNavigate(isAdmin ? 'students' : 'overview')}
        />
        <StatCard
          label="Total Teachers"
          value={teachersCount}
          icon={UserCheck}
          color="purple"
          onClick={() => onNavigate(isAdmin ? 'teachers' : 'overview')}
        />
        <StatCard
          label="Exams Created"
          value={examsStats.total}
          sub={`${examsStats.published} published`}
          icon={ClipboardList}
          color="orange"
          onClick={() => onNavigate('exams')}
        />
        <StatCard
          label="Results Published"
          value={examsStats.published}
          sub={`of ${examsStats.total} total`}
          icon={Award}
          color="green"
          onClick={() => onNavigate('results')}
        />
      </div>

      {/* ── Middle row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* In-progress topics (2 cols) */}
        <SectionCard
          title="Topics Currently In Progress"
          icon={Clock}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          onViewAll={() => onNavigate('progress')}
        >
          <div className="p-5 space-y-5">
            {teacherTopics.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No topics currently in progress
              </p>
            ) : (
              teacherTopics.map(({ teacher, subject, classInfo, topics }) => (
                <div key={teacher.id} className="flex gap-3.5">
                  {/* Avatar */}
                  <div className="shrink-0 w-9 h-9 rounded-full bg-green-700 text-white
                                  flex items-center justify-center text-xs font-bold shadow-sm">
                    {initials(teacher.full_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Teacher meta */}
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">
                        {teacher.full_name}
                      </span>
                      {subject && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700
                                         rounded font-medium">
                          {subject.code ?? subject.name}
                        </span>
                      )}
                      {classInfo && (
                        <span className="text-xs text-gray-400">{classInfo.name}</span>
                      )}
                    </div>

                    {/* Topics list */}
                    <ul className="mt-2 space-y-1.5">
                      {topics.map((t) => (
                        <li key={t.id} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="leading-snug">{t.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* Quick links (1 col) */}
        <SectionCard
          title="Quick Links"
          icon={Zap}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        >
          <div className="p-4 grid grid-cols-2 gap-2.5">
            {quickLinks.map((link) => {
              const c    = COLOR_MAP[link.color]
              const Icon = link.icon
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate(link.id)}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border
                              ${c.bg} ${c.border}
                              hover:shadow-sm hover:scale-[1.03] transition-all text-center`}
                >
                  <Icon size={18} className={c.icon} />
                  <span className="text-xs font-medium text-gray-700 leading-tight">
                    {link.label}
                  </span>
                </button>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent exams */}
        <SectionCard
          title="Recent Exams"
          icon={CalendarDays}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          onViewAll={() => onNavigate('exams')}
        >
          {recentExams.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No exams created yet</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentExams.map((exam) => {
                const classes = exam.exam_classes
                  ?.map((ec) => ec.classes?.name)
                  .filter(Boolean)
                  .join(', ')

                return (
                  <li key={exam.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className={`shrink-0 p-2 rounded-lg ${
                      exam.is_published ? 'bg-green-50' : 'bg-gray-100'
                    }`}>
                      {exam.is_published
                        ? <CheckCircle2 size={14} className="text-green-600" />
                        : <AlertCircle  size={14} className="text-gray-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{exam.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {EXAM_TYPE_LABEL[exam.type] ?? exam.type}
                        {' · '}
                        {exam.level?.replace('_', '-')}
                        {classes ? ` · ${classes}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                      exam.is_published
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100  text-gray-500'
                    }`}>
                      {exam.is_published ? 'Published' : 'Draft'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        {/* Syllabus coverage donut */}
        <SectionCard
          title="Syllabus Coverage"
          icon={BookMarked}
          iconBg="bg-green-50"
          iconColor="text-green-700"
          onViewAll={() => onNavigate('progress')}
        >
          <div className="p-5">
            {topicStats.total === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No topics recorded yet</p>
            ) : (
              <>
                {/* Completion headline */}
                <div className="flex items-baseline justify-center gap-2 mb-1">
                  <span className="text-4xl font-bold text-gray-900 tabular-nums">
                    {completionPct}%
                  </span>
                  <span className="text-sm text-gray-500">overall complete</span>
                </div>
                <p className="text-center text-xs text-gray-400 mb-4">
                  {topicStats.completed} of {topicStats.total} topics finished
                </p>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-600 transition-all duration-700"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>

                {/* Donut chart */}
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [`${v} topics`, name]}
                      contentStyle={{
                        borderRadius: 8, border: 'none',
                        boxShadow: '0 2px 8px rgba(0,0,0,.12)',
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {[
                    { label: 'Completed',   value: topicStats.completed,   color: '#16a34a' },
                    { label: 'In Progress', value: topicStats.in_progress,  color: '#f59e0b' },
                    { label: 'Not Started', value: topicStats.not_started,  color: '#d1d5db' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
