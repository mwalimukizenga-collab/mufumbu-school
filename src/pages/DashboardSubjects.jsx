import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { Plus, Pencil, Trash2, X, FlaskConical, BookOpen, Star, ChevronDown, ChevronUp } from 'lucide-react'

// ── data fetchers ─────────────────────────────────────────────────────────────
const fetchSubjects = async () => {
  const { data, error } = await supabase.from('subjects').select('*').order('level').order('name')
  if (error) throw error
  return data
}
const fetchCombinations = async () => {
  const { data, error } = await supabase
    .from('combinations')
    .select('*, combination_subjects(id, is_principal, subject_id, subjects(id,name,code))')
    .order('code')
  if (error) throw error
  return data
}

const LEVEL_LABEL = { o_level: 'O-Level', a_level: 'A-Level' }
const LEVEL_COLOR = { o_level: 'bg-blue-100 text-blue-700', a_level: 'bg-purple-100 text-purple-700' }
const inputCls = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

// ── reusable primitives ───────────────────────────────────────────────────────
function Badge({ children, color = 'bg-gray-100 text-gray-600' }) {
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{children}</span>
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── SubjectForm ───────────────────────────────────────────────────────────────
function SubjectForm({ initial, onClose }) {
  const qc   = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    level: initial?.level ?? 'o_level',
    has_practical: initial?.has_practical ?? false,
  })
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.code.trim()) throw new Error('Name and code are required.')
      const payload = { ...form, code: form.code.trim().toUpperCase() }
      const { error } = initial
        ? await supabase.from('subjects').update(payload).eq('id', initial.id)
        : await supabase.from('subjects').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] })
      toast.success(initial ? `"${form.name}" updated successfully.` : `Subject "${form.name}" added.`)
      onClose()
    },
    onError: e => {
      const msg = e.message?.includes('duplicate') ? `Code "${form.code.toUpperCase()}" already exists.` : e.message
      setErr(msg)
      toast.error(msg)
    },
  })

  return (
    <>
      <div className="space-y-4">
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <Field label="Subject name" required>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Mathematics" />
        </Field>
        <Field label="Code" required>
          <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. MATH" maxLength={10} />
        </Field>
        <Field label="Level" required>
          <select className={inputCls} value={form.level} onChange={e => set('level', e.target.value)}>
            <option value="o_level">O-Level (S1–S4)</option>
            <option value="a_level">A-Level (S5–S6)</option>
          </select>
        </Field>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div className="relative">
            <input type="checkbox" className="sr-only peer" checked={form.has_practical}
              onChange={e => set('has_practical', e.target.checked)} />
            <div className="w-10 h-5 bg-gray-200 peer-checked:bg-green-600 rounded-full transition" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition peer-checked:translate-x-5" />
          </div>
          <span className="text-sm text-gray-700 flex items-center gap-1.5">
            <FlaskConical size={14} className="text-gray-400" />
            Has practical &nbsp;<span className="text-gray-400 text-xs">(theory/100 + prac/50 ÷ 150)</span>
          </span>
        </label>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-semibold transition disabled:opacity-60">
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Add subject'}
        </button>
      </div>
    </>
  )
}

// ── CombinationForm ───────────────────────────────────────────────────────────
function CombinationForm({ initial, onClose }) {
  const qc    = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ code: initial?.code ?? '', full_name: initial?.full_name ?? '' })
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.full_name.trim()) throw new Error('Code and name are required.')
      const payload = { code: form.code.trim().toUpperCase(), full_name: form.full_name.trim() }
      const { error } = initial
        ? await supabase.from('combinations').update(payload).eq('id', initial.id)
        : await supabase.from('combinations').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['combinations'] })
      toast.success(initial ? `Combination "${form.code.toUpperCase()}" updated.` : `Combination "${form.code.toUpperCase()}" added.`)
      onClose()
    },
    onError: e => {
      const msg = e.message?.includes('duplicate') ? `Code "${form.code.toUpperCase()}" already exists.` : e.message
      setErr(msg)
      toast.error(msg)
    },
  })

  return (
    <>
      <div className="space-y-4">
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <Field label="Combination code" required>
          <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. PCB" maxLength={10} />
        </Field>
        <Field label="Full name" required>
          <input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Physics, Chemistry, Biology" />
        </Field>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-semibold transition disabled:opacity-60">
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Add combination'}
        </button>
      </div>
    </>
  )
}

// ── AssignSubjectPanel ────────────────────────────────────────────────────────
function AssignSubjectPanel({ combination, aLevelSubjects, onClose }) {
  const qc    = useQueryClient()
  const toast = useToast()
  const [subjectId, setSubjectId] = useState('')
  const [isPrincipal, setIsPrincipal] = useState(true)
  const [err, setErr] = useState('')

  const assignedIds = new Set(combination.combination_subjects.map(cs => cs.subject_id))
  const available = aLevelSubjects.filter(s => !assignedIds.has(s.id))

  const assign = useMutation({
    mutationFn: async () => {
      if (!subjectId) throw new Error('Select a subject.')
      const { error } = await supabase.from('combination_subjects').insert({
        combination_id: combination.id,
        subject_id: parseInt(subjectId),
        is_principal: isPrincipal,
      })
      if (error) throw error
    },
    onSuccess: () => {
      const sub = available.find(s => s.id === parseInt(subjectId))
      qc.invalidateQueries({ queryKey: ['combinations'] })
      toast.success(`"${sub?.name}" assigned to ${combination.code} as ${isPrincipal ? 'Principal' : 'Subsidiary'}.`)
      onClose()
    },
    onError: e => { setErr(e.message); toast.error(e.message) },
  })

  return (
    <>
      <div className="space-y-4">
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <p className="text-sm text-gray-500">Adding subject to <strong className="text-gray-800">{combination.code}</strong> — {combination.full_name}</p>
        <Field label="Subject" required>
          <select className={inputCls} value={subjectId} onChange={e => setSubjectId(e.target.value)}>
            <option value="">— Select A-Level subject —</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <Field label="Role in combination">
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: true,  label: 'Principal',   desc: 'Counts for division (best 3)' },
              { v: false, label: 'Subsidiary',  desc: 'Does not count for division' },
            ].map(opt => (
              <label key={String(opt.v)}
                className={`border rounded-xl p-3 cursor-pointer transition ${
                  isPrincipal === opt.v ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <input type="radio" className="sr-only" checked={isPrincipal === opt.v} onChange={() => setIsPrincipal(opt.v)} />
                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
        <button onClick={() => assign.mutate()} disabled={assign.isPending || !available.length}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-semibold transition disabled:opacity-60">
          {assign.isPending ? 'Assigning…' : 'Assign subject'}
        </button>
      </div>
    </>
  )
}

// ── CombinationCard ───────────────────────────────────────────────────────────
function CombinationCard({ combo, aLevelSubjects }) {
  const qc      = useQueryClient()
  const toast   = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const del = useMutation({
    mutationFn: () => supabase.from('combinations').delete().eq('id', combo.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combinations'] }); toast.success(`Combination "${combo.code}" deleted.`) },
    onError:   e => toast.error(`Failed to delete: ${e.message}`),
  })
  const removeSubject = useMutation({
    mutationFn: csId => supabase.from('combination_subjects').delete().eq('id', csId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combinations'] }); toast.success('Subject removed from combination.') },
    onError:   e => toast.error(`Failed to remove: ${e.message}`),
  })
  const togglePrincipal = useMutation({
    mutationFn: ({ csId, val }) => supabase.from('combination_subjects').update({ is_principal: val }).eq('id', csId),
    onSuccess: (_, { val }) => { qc.invalidateQueries({ queryKey: ['combinations'] }); toast.success(`Role changed to ${val ? 'Principal' : 'Subsidiary'}.`) },
    onError:   e => toast.error(`Failed to update role: ${e.message}`),
  })

  const principals  = combo.combination_subjects.filter(cs => cs.is_principal)
  const subsidiaries = combo.combination_subjects.filter(cs => !cs.is_principal)

  return (
    <>
      {editing   && <Modal title={`Edit ${combo.code}`} onClose={() => setEditing(false)}><CombinationForm initial={combo} onClose={() => setEditing(false)} /></Modal>}
      {assigning && <Modal title={`Assign subject → ${combo.code}`} onClose={() => setAssigning(false)}><AssignSubjectPanel combination={combo} aLevelSubjects={aLevelSubjects} onClose={() => setAssigning(false)} /></Modal>}

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="bg-purple-700 text-white font-bold text-sm px-2.5 py-1 rounded-lg shrink-0">{combo.code}</span>
            <span className="text-sm text-gray-700 font-medium truncate">{combo.full_name}</span>
            <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
              {principals.length}P · {subsidiaries.length}S
            </span>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button onClick={() => setAssigning(true)}
              className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1">
              <Plus size={12} /> Assign
            </button>
            <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-blue-600 transition rounded"><Pencil size={14} /></button>
            <button onClick={async () => {
                const ok = await confirm({ title: `Delete ${combo.code}?`, message: 'This will remove the combination and all its subject assignments. This cannot be undone.', confirmLabel: 'Delete' })
                if (ok) del.mutate()
              }}
              className="p-1.5 text-gray-400 hover:text-red-600 transition rounded"><Trash2 size={14} /></button>
            <button onClick={() => setOpen(v => !v)} className="p-1.5 text-gray-400 hover:text-gray-700 transition rounded">
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Subject rows */}
        {open && (
          <div>
            {combo.combination_subjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No subjects assigned yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left font-medium text-gray-500 px-4 py-2">Subject</th>
                    <th className="text-left font-medium text-gray-500 px-4 py-2">Code</th>
                    <th className="text-left font-medium text-gray-500 px-4 py-2">Role</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {combo.combination_subjects.map(cs => (
                    <tr key={cs.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        {cs.is_principal
                          ? <Star size={13} className="text-amber-500 fill-amber-400 shrink-0" />
                          : <BookOpen size={13} className="text-gray-400 shrink-0" />}
                        <span className="text-gray-800">{cs.subjects?.name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{cs.subjects?.code}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={cs.is_principal ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}>
                          {cs.is_principal ? '★ Principal' : 'Subsidiary'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => togglePrincipal.mutate({ csId: cs.id, val: !cs.is_principal })}
                            className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-green-400
                                       text-gray-500 hover:text-green-700 transition">
                            {cs.is_principal ? '↓ Subsidiary' : '↑ Principal'}
                          </button>
                          <button onClick={async () => {
                              const ok = await confirm({ title: 'Remove subject?', message: `Remove "${cs.subjects?.name}" from ${combo.code}?`, confirmLabel: 'Remove' })
                              if (ok) removeSubject.mutate(cs.id)
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition rounded"><X size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DashboardSubjects() {
  const qc      = useQueryClient()
  const toast   = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState('o_level')
  const [addSubject, setAddSubject] = useState(false)
  const [editSubject, setEditSubject] = useState(null)
  const [addCombo, setAddCombo] = useState(false)

  const { data: subjects = [], isLoading: loadingS } = useQuery({ queryKey: ['subjects'], queryFn: fetchSubjects })
  const { data: combos = [],   isLoading: loadingC } = useQuery({ queryKey: ['combinations'], queryFn: fetchCombinations })

  const filtered = subjects.filter(s => s.level === tab)
  const aLevelSubjects = subjects.filter(s => s.level === 'a_level')

  const delSubject = useMutation({
    mutationFn: id => supabase.from('subjects').delete().eq('id', id),
    onSuccess: (_, id) => {
      const name = subjects.find(s => s.id === id)?.name ?? 'Subject'
      qc.invalidateQueries({ queryKey: ['subjects'] })
      toast.success(`"${name}" deleted successfully.`)
    },
    onError: e => toast.error(`Failed to delete: ${e.message}`),
  })

  const TABS = [
    { id: 'o_level',      label: 'O-Level',      count: subjects.filter(s => s.level === 'o_level').length },
    { id: 'a_level',      label: 'A-Level',       count: subjects.filter(s => s.level === 'a_level').length },
    { id: 'combinations', label: 'Combinations',  count: combos.length },
  ]

  return (
    <div className="space-y-5">
      {addSubject  && <Modal title="Add subject"      onClose={() => setAddSubject(false)}><SubjectForm onClose={() => setAddSubject(false)} /></Modal>}
      {editSubject && <Modal title="Edit subject"     onClose={() => setEditSubject(null)}><SubjectForm initial={editSubject} onClose={() => setEditSubject(null)} /></Modal>}
      {addCombo    && <Modal title="Add combination"  onClose={() => setAddCombo(false)}><CombinationForm onClose={() => setAddCombo(false)} /></Modal>}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Subject Registration</h2>
          <p className="text-sm text-gray-500 mt-0.5">O-Level subjects · A-Level subjects · Combinations</p>
        </div>
        <button
          onClick={() => tab === 'combinations' ? setAddCombo(true) : setAddSubject(true)}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white
                     text-sm font-semibold px-4 py-2 rounded-lg transition">
          <Plus size={16} />
          {tab === 'combinations' ? 'New combination' : 'New subject'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Subjects table */}
      {tab !== 'combinations' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingS
            ? <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
            : filtered.length === 0
              ? <div className="py-16 text-center text-gray-400 text-sm">
                  No {LEVEL_LABEL[tab]} subjects.{' '}
                  <button onClick={() => setAddSubject(true)} className="text-green-700 underline">Add one</button>
                </div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left font-semibold text-gray-600 px-4 py-3">Subject</th>
                        <th className="text-left font-semibold text-gray-600 px-4 py-3">Code</th>
                        <th className="text-left font-semibold text-gray-600 px-4 py-3">Practical</th>
                        {tab === 'a_level' && <th className="text-left font-semibold text-gray-600 px-4 py-3">In combinations</th>}
                        <th className="px-4 py-3 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(s => {
                        const inCombos = combos.filter(c => c.combination_subjects.some(cs => cs.subject_id === s.id))
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                            <td className="px-4 py-3"><Badge>{s.code}</Badge></td>
                            <td className="px-4 py-3">
                              {s.has_practical
                                ? <span className="flex items-center gap-1 text-teal-700 text-xs font-medium"><FlaskConical size={13} /> Yes</span>
                                : <span className="text-gray-400 text-xs">Theory only</span>}
                            </td>
                            {tab === 'a_level' && (
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {inCombos.length === 0 && <span className="text-gray-400 text-xs">—</span>}
                                  {inCombos.map(c => {
                                    const cs = c.combination_subjects.find(x => x.subject_id === s.id)
                                    return (
                                      <Badge key={c.id} color={cs?.is_principal ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}>
                                        {c.code}{cs?.is_principal ? ' ★' : ''}
                                      </Badge>
                                    )
                                  })}
                                </div>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                <button onClick={() => setEditSubject(s)} className="p-1.5 text-gray-400 hover:text-blue-600 transition rounded"><Pencil size={15} /></button>
                                <button onClick={async () => {
                                const ok = await confirm({ title: `Delete "${s.name}"?`, message: 'This will permanently remove the subject and all its results. This cannot be undone.', confirmLabel: 'Delete' })
                                if (ok) delSubject.mutate(s.id)
                              }}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition rounded"><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
          }
        </div>
      )}

      {/* Combinations */}
      {tab === 'combinations' && (
        <div className="space-y-3">
          {loadingC
            ? <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
            : combos.length === 0
              ? <div className="py-16 text-center text-gray-400 text-sm">
                  No combinations yet.{' '}
                  <button onClick={() => setAddCombo(true)} className="text-green-700 underline">Add one</button>
                </div>
              : combos.map(c => <CombinationCard key={c.id} combo={c} aLevelSubjects={aLevelSubjects} />)
          }
        </div>
      )}
    </div>
  )
}
