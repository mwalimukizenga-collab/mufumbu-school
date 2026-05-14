import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createTeacher, updateTeacher, deleteTeacher } from '../lib/teacherService'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  Plus, X, Pencil, Trash2, Search, Eye, EyeOff, Users, BookOpen,
  School, GraduationCap, Loader, ChevronDown, Check, Copy,
} from 'lucide-react'

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchTeachers() {
  const { data, error } = await supabase
    .from('teachers').select('*').order('full_name')
  if (error) throw error
  return data
}

async function fetchSubjects() {
  const { data, error } = await supabase
    .from('subjects').select('*').order('name')
  if (error) throw error
  return data
}

async function fetchClasses() {
  const { data, error } = await supabase
    .from('classes').select('*').order('name')
  if (error) throw error
  return data
}

async function fetchAssignments() {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('*, subjects(name, code), classes(name)')
    .order('id')
  if (error) throw error
  return data
}

// ── Teacher Form Modal ────────────────────────────────────────────────────────

function TeacherForm({ teacher, onClose }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [showPwd, setShowPwd] = useState(false)
  const [generatedPwd, setGeneratedPwd] = useState('')
  const [form, setForm] = useState({
    full_name: teacher?.full_name ?? '',
    employee_number: teacher?.employee_number ?? '',
    gender: teacher?.gender ?? '',
    phone: teacher?.phone ?? '',
    email: teacher?.email ?? '',
  })

  const createMutation = useMutation({
    mutationFn: () => createTeacher({ ...form }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['teachers'] })
      setGeneratedPwd(result.password)
      toast.success(`Teacher account created. Password shown below.`)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateTeacher(teacher.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teachers'] })
      toast.success('Teacher updated.')
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  const handleSubmit = () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.warning('Full name and email are required.')
      return
    }
    if (teacher) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-gray-900">{teacher ? 'Edit Teacher' : 'Add Teacher'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Success + password reveal for new teachers */}
          {!teacher && generatedPwd && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                <Check size={16} /> Teacher account created!
              </p>
              <p className="text-xs text-green-700">Share this password with the teacher:</p>
              <div className="flex items-center gap-2 bg-white border border-green-300 rounded-lg px-3 py-2">
                <code className="text-sm font-mono font-bold text-gray-800 flex-1 select-all">{generatedPwd}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedPwd); toast.success('Password copied.') }}
                  className="text-green-600 hover:text-green-800 transition" title="Copy password"
                >
                  <Copy size={16} />
                </button>
              </div>
              <button onClick={onClose}
                className="w-full mt-1 bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 rounded-lg transition">
                Done
              </button>
            </div>
          )}

          {/* Form — hidden after successful creation */}
          {(!generatedPwd || teacher) && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee No.</label>
                  <input type="text" value={form.employee_number}
                    onChange={e => setForm({ ...form, employee_number: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white">
                    <option value="">Select...</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    readOnly={!!teacher}
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none transition ${
                      teacher
                        ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                        : 'border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                    }`} />
                  {teacher && <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>}
                </div>
              </div>
              {!teacher && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-700">
                    A secure password will be generated automatically. The teacher can login immediately after creation.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons — hidden after creation */}
        {(!generatedPwd || teacher) && (
          <div className="flex gap-3 px-6 pb-6">
            <button onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={!form.full_name || !form.email || isPending}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2">
              {isPending ? <Loader size={15} className="animate-spin" /> : teacher ? 'Update' : 'Add Teacher'}
            </button>
          </div>
        )}

        {createMutation.isError && (
          <div className="px-6 pb-5">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              <span>{createMutation.error.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function XCircle(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

// ── Assignment Panel ──────────────────────────────────────────────────────────

function AssignmentsPanel({ teacher }) {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedClasses, setSelectedClasses] = useState(new Set())

  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: fetchSubjects })
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: allAssignments, isLoading } = useQuery({
    queryKey: ['teacher_assignments'],
    queryFn: fetchAssignments,
  })

  const teacherAssignments = useMemo(() =>
    allAssignments?.filter(a => a.teacher_id === teacher.id) || [],
    [allAssignments, teacher.id]
  )

  const toggleClass = (id) => setSelectedClasses(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const academicYear = '2024-2025'

  const addMutation = useMutation({
    mutationFn: async () => {
      const rows = [...selectedClasses].map(classId => ({
        teacher_id: teacher.id,
        subject_id: Number(selectedSubject),
        class_id: classId,
        academic_year: academicYear,
      }))
      const { error } = await supabase.from('teacher_assignments').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher_assignments'] })
      toast.success(`Assigned ${subjects?.find(s => s.id === Number(selectedSubject))?.name} to ${selectedClasses.size} class(es).`)
      setSelectedSubject('')
      setSelectedClasses(new Set())
    },
    onError: (err) => toast.error(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('teacher_assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher_assignments'] })
      toast.success('Assignment removed.')
    },
    onError: (err) => toast.error(err.message),
  })

  const handleRemove = async (a) => {
    const ok = await confirm({
      title: 'Remove assignment?',
      message: `${a.subjects?.name} from ${a.classes?.name} will be removed from ${teacher.full_name}.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (ok) removeMutation.mutate(a.id)
  }

  const grouped = useMemo(() => {
    const g = {}
    teacherAssignments.forEach(a => {
      const key = a.subject_id
      if (!g[key]) g[key] = { subject: a.subjects, classes: [] }
      g[key].classes.push(a.classes)
    })
    return Object.values(g)
  }, [teacherAssignments])

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <BookOpen size={15} /> Subject Assignments
      </h4>

      {teacherAssignments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {grouped.map(g => (
            <div key={g.subject?.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <span className="font-medium text-gray-800">{g.subject?.name}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {g.classes.map(cls => {
                  const a = teacherAssignments.find(x => x.subject_id === g.subject?.id && x.class_id === cls?.id)
                  return (
                    <span key={a?.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium">
                      {cls?.name}
                      <button onClick={() => handleRemove(a)} className="text-blue-400 hover:text-red-500 transition" title="Remove"><X size={11} /></button>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {teacherAssignments.length === 0 && !isLoading && (
        <p className="text-sm text-gray-400 italic">No subjects assigned yet.</p>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Assignment</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="relative">
            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
              <option value="">Select subject...</option>
              {subjects?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value="" onChange={e => {
              if (e.target.value === '__all__') {
                setSelectedClasses(new Set(classes?.map(c => c.id)))
              }
            }}
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
              <option value="">Quick-add class...</option>
              <option value="__all__">All classes</option>
              {classes?.map(c => <option key={c.id} value={c.id} onClick={() => toggleClass(c.id)}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {classes && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Select classes:</p>
            <div className="flex flex-wrap gap-1.5">
              {classes?.map(c => {
                const isSel = selectedClasses.has(c.id)
                return (
                  <button key={c.id} onClick={() => toggleClass(c.id)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                      isSel ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                    {isSel && <Check size={11} className="inline mr-0.5" />}
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={() => addMutation.mutate()}
          disabled={!selectedSubject || selectedClasses.size === 0 || addMutation.isPending}
          className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          {addMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
          Assign to {selectedClasses.size} class(es)
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardTeachers() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const { data: teachers, isLoading } = useQuery({ queryKey: ['teachers'], queryFn: fetchTeachers })

  const filtered = useMemo(() => {
    if (!teachers) return []
    if (!search) return teachers
    const q = search.toLowerCase()
    return teachers.filter(t =>
      t.full_name.toLowerCase().includes(q) ||
      t.employee_number?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q)
    )
  }, [teachers, search])

  const deleteMutation = useMutation({
    mutationFn: (t) => deleteTeacher(t.id, t.profile_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teachers'] })
      toast.success('Teacher and account removed.')
    },
    onError: (err) => toast.error(err.message),
  })

  const handleDelete = async (teacher) => {
    if (!teacher.profile_id) {
      toast.warning('Cannot remove: no linked account.')
      return
    }
    const ok = await confirm({
      title: 'Delete teacher?',
      message: `${teacher.full_name} and their login account will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (ok) deleteMutation.mutate(teacher)
  }

  return (
    <div className="space-y-5">
      {formOpen && <TeacherForm teacher={editing} onClose={() => { setFormOpen(false); setEditing(null) }} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Teachers</h2>
          <p className="text-sm text-gray-500">Register, manage accounts, and assign subjects</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
          <Plus size={16} /> Add Teacher
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">No teachers found</p>
          </div>
        )}

        {!isLoading && filtered.map(t => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm shrink-0">
                {t.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{t.full_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.employee_number && <span className="font-mono">{t.employee_number} · </span>}
                  {t.gender === 'M' ? 'Male' : t.gender === 'F' ? 'Female' : '—'}
                  {t.email && <span> · {t.email}</span>}
                  {t.phone && <span> · {t.phone}</span>}
                  {t.profile_id && <span className="ml-2 text-green-600 font-medium">✓ Account active</span>}
                  {!t.profile_id && <span className="ml-2 text-amber-600 font-medium">⚠ No login</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="text-xs text-green-700 font-medium hover:underline px-2 py-1">
                  {expanded === t.id ? 'Hide Assignments' : 'Assign Subjects'}
                </button>
                <button onClick={() => { setEditing(t); setFormOpen(true) }}
                  className="p-1.5 text-gray-400 hover:text-green-600 transition" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(t)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition disabled:opacity-30" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {expanded === t.id && (
              <div className="px-5 pb-5 pt-2 border-t border-gray-100">
                <AssignmentsPanel teacher={t} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
