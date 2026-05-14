import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import {
  Search, X, Users, Lock, Check, BookOpen,
} from 'lucide-react'

const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition bg-white`

// ── Fetchers ──────────────────────────────────────────────────────────────────
const fetchStudents = async () => {
  const { data, error } = await supabase
    .from('students')
    .select('*, classes(id,name,level), combinations(id,code,full_name)')
    .order('full_name')
  if (error) throw error
  return data
}

const fetchSubjects = async () => {
  const { data, error } = await supabase
    .from('subjects').select('*').order('name')
  if (error) throw error
  return data
}

const fetchStudentSubjectIds = async (studentId) => {
  const { data, error } = await supabase
    .from('student_subjects')
    .select('subject_id')
    .eq('student_id', studentId)
  if (error) throw error
  return new Set(data.map(r => r.subject_id))
}

const fetchCombinationSubjects = async (combinationId) => {
  if (!combinationId) return []
  const { data, error } = await supabase
    .from('combination_subjects')
    .select('subject_id, is_principal, subjects(id, name, code)')
    .eq('combination_id', combinationId)
  if (error) throw error
  return data
}

const fetchAllSubjectCounts = async () => {
  const { data, error } = await supabase
    .from('student_subjects').select('student_id')
  if (error) throw error
  const counts = {}
  for (const r of data) {
    counts[r.student_id] = (counts[r.student_id] ?? 0) + 1
  }
  return counts
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          <button onClick={onClose} className="ml-3 shrink-0 text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Subject assign modal ──────────────────────────────────────────────────────
function SubjectAssignModal({ student, allSubjects, onClose }) {
  const qc    = useQueryClient()
  const toast = useToast()
  const isALevel = student.classes?.level === 'a_level'

  const { data: assignedIds, isLoading: loadingAssigned } = useQuery({
    queryKey: ['student_subject_ids', student.id],
    queryFn:  () => fetchStudentSubjectIds(student.id),
  })

  const { data: comboSubjects = [], isLoading: loadingCombo } = useQuery({
    queryKey: ['combo_subjects_detail', student.combination_id],
    queryFn:  () => fetchCombinationSubjects(student.combination_id),
    enabled:  isALevel && !!student.combination_id,
  })

  const [selected, setSelected]     = useState(new Set())
  const [initialized, setInit]      = useState(false)

  useEffect(() => {
    if (assignedIds && !initialized) {
      setSelected(new Set(assignedIds))
      setInit(true)
    }
  }, [assignedIds, initialized])

  const toggle = (id) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAll = () => setSelected(new Set(oLevelSubjects.map(s => s.id)))
  const clearAll  = () => setSelected(new Set())

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase
        .from('student_subjects').delete().eq('student_id', student.id)
      if (delErr) throw delErr

      if (selected.size > 0) {
        const rows = [...selected].map(subject_id => ({ student_id: student.id, subject_id }))
        const { error: insErr } = await supabase.from('student_subjects').insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student_subject_ids', student.id] })
      qc.invalidateQueries({ queryKey: ['subject_counts'] })
      toast.success(`Subjects updated for ${student.full_name}.`)
      onClose()
    },
    onError: e => toast.error(e.message),
  })

  const oLevelSubjects = allSubjects.filter(s => s.level === 'o_level')
  const loading = loadingAssigned || (isALevel && student.combination_id && loadingCombo) || !initialized

  return (
    <Modal title={`Assign subjects — ${student.full_name}`} onClose={onClose}>
      {/* Student info pill */}
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{student.full_name}</p>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {student.registration_number ?? '—'}
            {student.classes && ` · ${student.classes.name}`}
            {student.combinations && ` · ${student.combinations.code}`}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
          isALevel ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {isALevel ? 'A-Level' : 'O-Level'}
        </span>
      </div>

      {/* ── A-Level: read-only view ── */}
      {isALevel ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
            <Lock size={13} className="shrink-0" />
            Subjects are auto-assigned from the combination. Edit the student's combination to change subjects.
          </div>

          {loadingCombo ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : comboSubjects.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              No combination assigned to this student.
            </div>
          ) : (
            <div className="space-y-1.5">
              {comboSubjects.map(cs => (
                <div key={cs.subject_id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg">
                  <BookOpen size={14} className="shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{cs.subjects.name}</span>
                    <span className="ml-2 text-xs font-mono text-gray-400">{cs.subjects.code}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    cs.is_principal
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {cs.is_principal ? 'Principal' : 'Subsidiary'}
                  </span>
                </div>
              ))}
              {/* GS is auto-added by trigger */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg">
                <BookOpen size={14} className="shrink-0 text-gray-400" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">General Studies</span>
                  <span className="ml-2 text-xs font-mono text-gray-400">GS</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Auto</span>
              </div>
            </div>
          )}

          <button onClick={onClose}
            className="w-full mt-2 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
            Close
          </button>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading subjects…</div>
      ) : (
        /* ── O-Level: checkbox selection ── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {selected.size} of {oLevelSubjects.length} subjects selected
            </span>
            <div className="flex gap-3">
              <button onClick={selectAll}
                className="text-xs text-green-700 font-medium hover:underline">
                Select all
              </button>
              <span className="text-gray-300 text-xs">|</span>
              <button onClick={clearAll}
                className="text-xs text-gray-500 font-medium hover:underline">
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {oLevelSubjects.map(sub => {
              const checked = selected.has(sub.id)
              return (
                <button key={sub.id} onClick={() => toggle(sub.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition ${
                    checked
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                    checked ? 'bg-green-600 border-green-600' : 'border-gray-300'
                  }`}>
                    {checked && <Check size={11} className="text-white" />}
                  </div>
                  <span className="flex-1 text-sm text-gray-800">{sub.name}</span>
                  {sub.has_practical && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Practical</span>
                  )}
                  <span className="text-xs font-mono text-gray-400">{sub.code}</span>
                </button>
              )
            })}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-60">
              {save.isPending ? 'Saving…' : 'Save subjects'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardStudentSubjects() {
  const [search, setSearch]       = useState('')
  const [levelFilter, setLevel]   = useState('all')
  const [classFilter, setClass]   = useState('all')
  const [managing, setManaging]   = useState(null)

  const { data: students = [],    isLoading: loadingS } = useQuery({ queryKey: ['students'],      queryFn: fetchStudents })
  const { data: allSubjects = [] }                      = useQuery({ queryKey: ['subjects'],      queryFn: fetchSubjects })
  const { data: subjectCounts = {} }                    = useQuery({ queryKey: ['subject_counts'], queryFn: fetchAllSubjectCounts })

  const classes = useMemo(() => {
    const seen = {}
    students.forEach(s => { if (s.classes) seen[s.class_id] = s.classes })
    return Object.values(seen)
  }, [students])

  const filtered = useMemo(() => students.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.full_name.toLowerCase().includes(q) || s.registration_number?.toLowerCase().includes(q)
    const matchLevel  = levelFilter === 'all' || s.classes?.level === levelFilter
    const matchClass  = classFilter === 'all' || String(s.class_id) === classFilter
    return matchSearch && matchLevel && matchClass
  }), [students, search, levelFilter, classFilter])

  const noSubjectsCount = students.filter(s => !subjectCounts[s.id]).length

  return (
    <div className="space-y-5">

      {managing && (
        <SubjectAssignModal
          student={managing}
          allSubjects={allSubjects}
          onClose={() => setManaging(null)}
        />
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Subject Assignment</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          O-Level: assign manually · A-Level: auto-assigned from combination
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total students',   value: students.length,                 color: 'text-gray-800' },
          { label: 'Assigned',         value: students.length - noSubjectsCount, color: 'text-green-700' },
          { label: 'Not yet assigned', value: noSubjectsCount,                 color: noSubjectsCount > 0 ? 'text-red-600' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            placeholder="Search by name or reg. number…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          value={levelFilter} onChange={e => { setLevel(e.target.value); setClass('all') }}>
          <option value="all">All levels</option>
          <option value="o_level">O-Level</option>
          <option value="a_level">A-Level</option>
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          value={classFilter} onChange={e => setClass(e.target.value)}>
          <option value="all">All classes</option>
          {classes
            .filter(c => levelFilter === 'all' || c.level === levelFilter)
            .map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loadingS ? (
          <div className="py-20 text-center text-gray-400 text-sm">Loading students…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Users size={36} className="mx-auto text-gray-300" />
            <p className="text-gray-400 text-sm">No students match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left font-semibold text-gray-600 px-4 py-3">Student</th>
                  <th className="text-left font-semibold text-gray-600 px-4 py-3">Class</th>
                  <th className="text-left font-semibold text-gray-600 px-4 py-3">Combination</th>
                  <th className="text-left font-semibold text-gray-600 px-4 py-3">Subjects</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(s => {
                  const count    = subjectCounts[s.id] ?? 0
                  const isALevel = s.classes?.level === 'a_level'
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.full_name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{s.registration_number ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          isALevel ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {s.classes?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {s.combinations?.code ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {count > 0 ? (
                          <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            {count} subject{count !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            None assigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setManaging(s)}
                          className={`text-xs font-semibold transition hover:underline ${
                            isALevel ? 'text-purple-600 hover:text-purple-800' : 'text-green-700 hover:text-green-900'
                          }`}>
                          {isALevel ? 'View' : count > 0 ? 'Edit' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {students.length} students
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
