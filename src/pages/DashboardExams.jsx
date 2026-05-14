import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  Plus, X, Pencil, Trash2, Loader, ChevronDown, Search,
  ClipboardList, Calendar, School, Users, Check,
} from 'lucide-react'

const EXAM_TYPES = [
  { value: 'midterm', label: 'Midterm' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'annual', label: 'Annual' },
  { value: 'mock', label: 'Mock' },
]

export default function DashboardExams() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const { data: exams, isLoading } = useQuery({
    queryKey: ['exams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*, exam_classes(id, class_id, classes(name, level))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })

  const filtered = useMemo(() => {
    if (!exams) return []
    if (!search) return exams
    const q = search.toLowerCase()
    return exams.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.type?.toLowerCase().includes(q) ||
      e.academic_year?.toLowerCase().includes(q)
    )
  }, [exams, search])

  const createMutation = useMutation({
    mutationFn: async (form) => {
      if (!form.name?.trim()) throw new Error('Exam name is required.')
      if (!form.type) throw new Error('Exam type is required.')
      if (!form.classIds?.length) throw new Error('Select at least one class.')

      const { data: exam, error: examErr } = await supabase
        .from('exams')
        .insert({
          name: form.name.trim(),
          type: form.type,
          scope: form.classIds.length === classes.length ? 'school' : 'class',
          level: form.level,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          has_practical: form.has_practical,
          academic_year: form.academic_year || '2024-2025',
        })
        .select('id')
        .single()
      if (examErr) throw examErr

      const rows = form.classIds.map(cid => ({ exam_id: exam.id, class_id: cid }))
      const { error: ceErr } = await supabase.from('exam_classes').insert(rows)
      if (ceErr) throw ceErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast.success('Exam created.')
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (form) => {
      const { error: examErr } = await supabase
        .from('exams')
        .update({
          name: form.name.trim(),
          type: form.type,
          level: form.level,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          has_practical: form.has_practical,
          academic_year: form.academic_year || '2024-2025',
        })
        .eq('id', editing.id)
      if (examErr) throw examErr

      // Replace exam_classes
      const { error: delErr } = await supabase.from('exam_classes').delete().eq('exam_id', editing.id)
      if (delErr) throw delErr

      if (form.classIds?.length) {
        const rows = form.classIds.map(cid => ({ exam_id: editing.id, class_id: cid }))
        const { error: insErr } = await supabase.from('exam_classes').insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast.success('Exam updated.')
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('exams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast.success('Exam deleted.')
    },
    onError: (err) => toast.error(err.message),
  })

  const handleDelete = async (exam) => {
    const ok = await confirm({
      title: 'Delete exam?',
      message: `"${exam.name}" and all its results will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (ok) deleteMutation.mutate(exam.id)
  }

  const openEdit = (exam) => {
    setEditing(exam)
    setFormOpen(true)
  }

  const getTypeBadge = (type) => {
    const colors = {
      midterm: 'bg-blue-100 text-blue-700',
      terminal: 'bg-purple-100 text-purple-700',
      annual: 'bg-green-100 text-green-700',
      mock: 'bg-amber-100 text-amber-700',
    }
    return colors[type] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-5">
      {formOpen && (
        <ExamFormModal
          exam={editing}
          classes={classes}
          onSave={(form) => editing ? updateMutation.mutate(form) : createMutation.mutate(form)}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Exams</h2>
          <p className="text-sm text-gray-500">Register and manage examinations</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
          <Plus size={16} /> New Exam
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No exams registered</p>
        </div>
      )}

      {!isLoading && filtered.map(exam => (
        <div key={exam.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getTypeBadge(exam.type)}`}>{exam.type}</span>
                  {exam.is_published && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Published</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 space-x-3">
                  <span>{exam.academic_year}</span>
                  <span className="capitalize">{exam.level?.replace('_', '-')}</span>
                  <span className="capitalize">{exam.scope}</span>
                  {exam.start_date && <span>{exam.start_date}{exam.end_date ? ` — ${exam.end_date}` : ''}</span>}
                </p>
                {exam.exam_classes?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {exam.exam_classes.map(ec => (
                      <span key={ec.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {ec.classes?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(exam)}
                  className="p-1.5 text-gray-400 hover:text-green-600 transition" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(exam)}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExamFormModal({ exam, classes, onSave, onClose, isPending }) {
  const [form, setForm] = useState({
    name: exam?.name || '',
    type: exam?.type || '',
    level: exam?.level || 'o_level',
    academic_year: exam?.academic_year || '2024-2025',
    start_date: exam?.start_date || '',
    end_date: exam?.end_date || '',
    has_practical: exam?.has_practical ?? true,
    classIds: exam?.exam_classes?.map(ec => ec.class_id) || [],
  })

  const [selectAll, setSelectAll] = useState(form.classIds.length === classes?.length)

  const handleSelectAll = () => {
    if (selectAll) {
      setForm({ ...form, classIds: [] })
      setSelectAll(false)
    } else {
      setForm({ ...form, classIds: classes?.map(c => c.id) || [] })
      setSelectAll(true)
    }
  }

  const toggleClass = (id) => {
    const next = form.classIds.includes(id)
      ? form.classIds.filter(c => c !== id)
      : [...form.classIds, id]
    setForm({ ...form, classIds: next })
    setSelectAll(next.length === classes?.length)
  }

  const filteredByLevel = useMemo(() => {
    return classes?.filter(c => c.level === form.level) || []
  }, [classes, form.level])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-gray-900">{exam ? 'Edit Exam' : 'New Exam'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Name *</label>
            <input type="text" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white">
                <option value="">Select...</option>
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
              <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white">
                <option value="o_level">O-Level</option>
                <option value="a_level">A-Level</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
            <input type="text" value={form.academic_year}
              onChange={e => setForm({ ...form, academic_year: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
          </div>

          <div className="flex items-center gap-3 py-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.has_practical} onChange={e => setForm({ ...form, has_practical: e.target.checked })}
                className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600" />
            </label>
            <span className="text-sm text-gray-700">Includes practical exams</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Classes *</label>
              <button onClick={handleSelectAll}
                className="text-xs text-green-700 font-medium hover:underline flex items-center gap-1">
                {selectAll ? <X size={12} /> : <Check size={12} />}
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredByLevel.map(c => {
                const isSel = form.classIds.includes(c.id)
                return (
                  <button key={c.id} onClick={() => toggleClass(c.id)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                      isSel
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                    {isSel && <Check size={11} className="inline mr-0.5" />}
                    {c.name}
                  </button>
                )
              })}
              {filteredByLevel.length === 0 && (
                <p className="text-xs text-gray-400">No classes for this level.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            disabled={!form.name || !form.type || !form.classIds.length || isPending}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2">
            {isPending ? <Loader size={15} className="animate-spin" /> : null}
            {exam ? 'Update Exam' : 'Create Exam'}
          </button>
        </div>
      </div>
    </div>
  )
}
