import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  Check, X, Loader, AlertCircle, Search, Users, BookOpen,
  GraduationCap, Layers, ChevronDown, CheckSquare,
  Square, Trash2, UserPlus,
} from 'lucide-react'

async function fetchStudentsByClass(classId) {
  const { data, error } = await supabase
    .from('students')
    .select('id, registration_number, full_name, gender, combination_id')
    .eq('class_id', classId)
    .order('full_name')
  if (error) throw error
  return data
}

async function fetchSubjectsByLevel(level) {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name, code, has_practical')
    .eq('level', level)
    .order('name')
  if (error) throw error
  return data
}

async function fetchClassesByLevel(level) {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name')
    .eq('level', level)
    .order('name')
  if (error) throw error
  return data
}

async function fetchCombinations() {
  const { data, error } = await supabase
    .from('combinations')
    .select('id, code, full_name')
    .order('code')
  if (error) throw error
  return data
}

async function fetchAllStudentSubjects() {
  const { data, error } = await supabase
    .from('student_subjects')
    .select('id, student_id, subject_id')
  if (error) throw error
  return data
}

function FilterSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(Number(e.target.value) || null)}
        className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none cursor-pointer"
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
        {options?.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={15} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
    </div>
  )
}

function StudentRow({ student, selected, onToggle, subjects, assignedIds, onAssign, onRemove, isPending, comboLabel }) {
  const assigned = assignedIds
  const studentSubjects = subjects?.filter(s => assigned.has(s.id)) || []
  const unassignedSubjects = subjects?.filter(s => !assigned.has(s.id)) || []

  return (
    <div className={`border-b border-gray-100 last:border-b-0 ${selected ? 'bg-green-50/50' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onToggle(student.id)} className="shrink-0 text-gray-400 hover:text-green-700 transition">
          {selected ? <CheckSquare size={18} className="text-green-700" /> : <Square size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 truncate">{student.full_name}</p>
          <p className="text-xs text-gray-400">{student.registration_number}</p>
        </div>
        {comboLabel && (
          <span className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full whitespace-nowrap">
            {comboLabel}
          </span>
        )}
        {!comboLabel && studentSubjects.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
            {studentSubjects.slice(0, 3).map(s => (
              <span key={s.id} className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                {s.code}
              </span>
            ))}
            {studentSubjects.length > 3 && (
              <span className="text-xs text-gray-400">+{studentSubjects.length - 3}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {!comboLabel && unassignedSubjects.length > 0 && (
            <button
              onClick={() => onAssign(student.id)}
              disabled={isPending}
              className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded transition"
              title="Assign all unassigned subjects"
            >
              <UserPlus size={15} />
            </button>
          )}
          {!comboLabel && studentSubjects.length > 0 && (
            <button
              onClick={() => onRemove(student.id)}
              disabled={isPending}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition"
              title="Remove all subjects"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── O-Level ───────────────────────────────────────────────────────────────

function OLevelBulk({ toast, confirm }) {
  const queryClient = useQueryClient()
  const [classId, setClassId] = useState(null)
  const [selectedStudents, setSelectedStudents] = useState(new Set())
  const [selectedSubjects, setSelectedSubjects] = useState(new Set())
  const [search, setSearch] = useState('')

  const { data: classes } = useQuery({
    queryKey: ['classes', 'o_level'],
    queryFn: () => fetchClassesByLevel('o_level'),
  })

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-by-class', classId],
    queryFn: () => fetchStudentsByClass(classId),
    enabled: !!classId,
  })

  const { data: subjects } = useQuery({
    queryKey: ['subjects', 'o_level'],
    queryFn: () => fetchSubjectsByLevel('o_level'),
  })

  const { data: allAssignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ['student_subjects'],
    queryFn: fetchAllStudentSubjects,
  })

  const assignMutation = useMutation({
    mutationFn: async ({ studentIds, subjectIds }) => {
      const rows = []
      for (const sid of studentIds) {
        for (const subjId of subjectIds) {
          const exists = allAssignments?.find(a => a.student_id === sid && a.subject_id === subjId)
          if (!exists) rows.push({ student_id: sid, subject_id: subjId })
        }
      }
      if (rows.length === 0) return { skipped: true }
      const { error } = await supabase.from('student_subjects').insert(rows)
      if (error) throw error
      return { count: rows.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['student_subjects'] })
      if (result?.skipped) toast.warning('All selected subjects already assigned.')
      else toast.success(`Assigned ${result.count} subject(s) successfully.`)
    },
    onError: (err) => toast.error(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: async ({ studentIds, subjectIds }) => {
      let query = supabase.from('student_subjects').delete().in('student_id', studentIds)
      if (subjectIds && subjectIds.size > 0) query = query.in('subject_id', [...subjectIds])
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student_subjects'] })
      toast.success('Subjects removed.')
    },
    onError: (err) => toast.error(err.message),
  })

  const filteredStudents = useMemo(() => {
    if (!students) return []
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) || s.registration_number?.toLowerCase().includes(q)
    )
  }, [students, search])

  const studentIds = useMemo(() => students?.map(s => s.id) || [], [students])

  const assignedMap = useMemo(() => {
    const map = new Map()
    if (allAssignments && studentIds.length > 0) {
      for (const sid of studentIds) map.set(sid, new Set())
      for (const a of allAssignments) {
        if (map.has(a.student_id)) map.get(a.student_id).add(a.subject_id)
      }
    }
    return map
  }, [allAssignments, studentIds])

  const toggleStudent = (id) => setSelectedStudents(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleSubject = (id) => setSelectedSubjects(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAllStudents = () => {
    if (selectedStudents.size === filteredStudents.length && filteredStudents.length > 0)
      setSelectedStudents(new Set())
    else setSelectedStudents(new Set(filteredStudents.map(s => s.id)))
  }

  const toggleAllSubjects = () => {
    if (!subjects) return
    if (selectedSubjects.size === subjects.length && subjects.length > 0)
      setSelectedSubjects(new Set())
    else setSelectedSubjects(new Set(subjects.map(s => s.id)))
  }

  const handleAssign = (specificStudentIds) => {
    const targetIds = specificStudentIds || [...selectedStudents]
    const targetSubjects = [...selectedSubjects]
    if (targetIds.length === 0 || targetSubjects.length === 0) return
    assignMutation.mutate({ studentIds: targetIds, subjectIds: targetSubjects })
  }

  const handleRemove = async (specificStudentIds) => {
    const targetIds = specificStudentIds || [...selectedStudents]
    if (targetIds.length === 0) return
    const ok = await confirm({
      title: 'Remove subjects?',
      message: `${selectedSubjects.size > 0 ? selectedSubjects.size + ' subjects from ' : 'All subjects from '}${targetIds.length} student(s) will be removed.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    removeMutation.mutate({ studentIds: targetIds, subjectIds: selectedSubjects })
  }

  const handleAssignSingle = (studentId, allSubjects) => {
    const unassigned = allSubjects.filter(s => !assignedMap.get(studentId)?.has(s.id))
    if (unassigned.length === 0) return
    assignMutation.mutate({ studentIds: [studentId], subjectIds: unassigned.map(s => s.id) })
  }

  const handleRemoveSingle = async (studentId) => {
    const ok = await confirm({
      title: 'Remove all subjects?',
      message: 'All subjects for this student will be removed.',
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    removeMutation.mutate({ studentIds: [studentId] })
  }

  const classOpts = classes?.map(c => ({ id: c.id, label: c.name })) || []
  const noSelection = !classId
  const isLoading = loadingStudents || loadingAssignments

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <FilterSelect label="Class" value={classId} onChange={setClassId} options={classOpts} placeholder="Select class..." />
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Search Students</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or reg no..."
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
          </div>
        </div>
      </div>

      {noSelection && (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Select a class to view students</p>
          <p className="text-sm mt-1">Then choose subjects and assign in bulk.</p>
        </div>
      )}

      {!noSelection && isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader className="animate-spin text-green-600" size={28} />
        </div>
      )}

      {!noSelection && !isLoading && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Students <span className="text-gray-400 font-normal ml-1">({filteredStudents.length})</span></span>
              </div>
              <button onClick={toggleAllStudents} className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 transition">
                {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 ? <X size={13} /> : <CheckSquare size={13} />}
                {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {filteredStudents.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-sm">No students found</p></div>}
              {filteredStudents.map(student => (
                <StudentRow key={student.id} student={student} selected={selectedStudents.has(student.id)} onToggle={toggleStudent}
                  subjects={subjects} assignedIds={assignedMap.get(student.id) || new Set()}
                  onAssign={(sid) => handleAssignSingle(sid, subjects)} onRemove={(sid) => handleRemoveSingle(sid)}
                  isPending={assignMutation.isPending || removeMutation.isPending} />
              ))}
            </div>
            {selectedStudents.size > 0 && (
              <div className="px-4 py-3 bg-green-50 border-t border-green-100 flex items-center gap-2">
                <span className="text-xs font-medium text-green-800">{selectedStudents.size} selected</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Subjects <span className="text-gray-400 font-normal ml-1">({subjects?.length || 0})</span></span>
              </div>
              <button onClick={toggleAllSubjects} className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 transition">
                {selectedSubjects.size === subjects?.length && subjects?.length > 0 ? <X size={13} /> : <CheckSquare size={13} />}
                {selectedSubjects.size === subjects?.length && subjects?.length > 0 ? 'None' : 'All'}
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-3">
              {subjects?.map(sub => {
                const isSelected = selectedSubjects.has(sub.id)
                return (
                  <button key={sub.id} onClick={() => toggleSubject(sub.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition mb-0.5 ${isSelected ? 'bg-green-50 text-green-800' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {isSelected ? <CheckSquare size={16} className="shrink-0 text-green-700" /> : <Square size={16} className="shrink-0 text-gray-300" />}
                    <span className="font-medium">{sub.name}</span>
                    <span className="ml-auto text-xs font-mono text-gray-400">{sub.code}</span>
                    {sub.has_practical && <span className="text-xs text-amber-600 font-medium shrink-0">lab</span>}
                  </button>
                )
              })}
              {(!subjects || subjects.length === 0) && <p className="text-center py-8 text-gray-400 text-sm">No subjects available</p>}
            </div>

            {selectedSubjects.size > 0 && selectedStudents.size > 0 && (
              <div className="px-3 py-3 border-t border-gray-100 bg-gray-50/50 space-y-2">
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                  <CheckSquare size={12} /> <span>{selectedSubjects.size} subject(s) · {selectedStudents.size} student(s)</span>
                </div>
                <button onClick={() => handleAssign()} disabled={assignMutation.isPending}
                  className="w-full flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
                  {assignMutation.isPending ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
                  Assign to Selected
                </button>
                <button onClick={() => handleAssign(studentIds)} disabled={assignMutation.isPending}
                  className="w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
                  {assignMutation.isPending ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Assign to All {filteredStudents.length}
                </button>
                <button onClick={() => handleRemove()} disabled={removeMutation.isPending}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-sm font-medium px-4 py-2 rounded-lg border border-red-200 transition">
                  {removeMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Remove from Selected
                </button>
              </div>
            )}
            {selectedSubjects.size === 0 && (
              <div className="px-3 py-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">Select subjects to enable bulk actions</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── A-Level ──────────────────────────────────────────────────────────────

function ALevelBulk({ toast, confirm }) {
  const queryClient = useQueryClient()
  const [classId, setClassId] = useState(null)
  const [comboId, setComboId] = useState(null)
  const [selectedStudents, setSelectedStudents] = useState(new Set())
  const [search, setSearch] = useState('')

  const { data: classes } = useQuery({
    queryKey: ['classes', 'a_level'],
    queryFn: () => fetchClassesByLevel('a_level'),
  })

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-by-class-a', classId],
    queryFn: () => fetchStudentsByClass(classId),
    enabled: !!classId,
  })

  const { data: combinations } = useQuery({
    queryKey: ['combinations'],
    queryFn: fetchCombinations,
  })

  const assignCombo = useMutation({
    mutationFn: async ({ studentIds, combinationId }) => {
      const { error } = await supabase
        .from('students')
        .update({ combination_id: combinationId })
        .in('id', studentIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-by-class-a', classId] })
      toast.success(`Combination assigned to ${selectedStudents.size} student(s).`)
      setSelectedStudents(new Set())
      setComboId(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const removeCombo = useMutation({
    mutationFn: async (studentIds) => {
      const { error } = await supabase
        .from('students')
        .update({ combination_id: null })
        .in('id', studentIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-by-class-a', classId] })
      toast.success('Combination removed from selected student(s).')
    },
    onError: (err) => toast.error(err.message),
  })

  const filteredStudents = useMemo(() => {
    if (!students) return []
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) || s.registration_number?.toLowerCase().includes(q)
    )
  }, [students, search])

  const comboMap = useMemo(() => {
    const map = {}
    combinations?.forEach(c => { map[c.id] = c })
    return map
  }, [combinations])

  const toggleStudent = (id) => setSelectedStudents(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAllStudents = () => {
    if (selectedStudents.size === filteredStudents.length && filteredStudents.length > 0)
      setSelectedStudents(new Set())
    else setSelectedStudents(new Set(filteredStudents.map(s => s.id)))
  }

  const classOpts = classes?.map(c => ({ id: c.id, label: c.name })) || []
  const comboOpts = combinations?.map(c => ({ id: c.id, label: `${c.code} — ${c.full_name}` })) || []

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <FilterSelect label="Class" value={classId} onChange={setClassId} options={classOpts} placeholder="Select class..." />
        <FilterSelect label="Combination" value={comboId} onChange={setComboId} options={comboOpts} placeholder="Assign combination..." />
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Search Students</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or reg no..."
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
          </div>
        </div>
      </div>

      {!classId && (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">Select an A-Level class (S5–S6) to view students</p>
          <p className="text-sm mt-1">Then select a combination and assign in bulk.</p>
        </div>
      )}

      {classId && loadingStudents && (
        <div className="flex items-center justify-center py-16">
          <Loader className="animate-spin text-green-600" size={28} />
        </div>
      )}

      {classId && !loadingStudents && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Students <span className="text-gray-400 font-normal ml-1">({filteredStudents.length})</span></span>
            </div>
            <button onClick={toggleAllStudents} className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 transition">
              {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 ? <X size={13} /> : <CheckSquare size={13} />}
              {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {filteredStudents.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-sm">No students found</p></div>}
            {filteredStudents.map(student => (
              <div key={student.id} className={`border-b border-gray-100 last:border-b-0 ${selectedStudents.has(student.id) ? 'bg-green-50/50' : ''}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggleStudent(student.id)} className="shrink-0 text-gray-400 hover:text-green-700 transition">
                    {selectedStudents.has(student.id) ? <CheckSquare size={18} className="text-green-700" /> : <Square size={18} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{student.full_name}</p>
                    <p className="text-xs text-gray-400">{student.registration_number}</p>
                  </div>
                  {student.combination_id && comboMap[student.combination_id] && (
                    <span className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      {comboMap[student.combination_id].code}
                    </span>
                  )}
                  {!student.combination_id && (
                    <span className="text-xs text-gray-400 italic">No combo</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedStudents.size > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-gray-600">{selectedStudents.size} selected</span>

              {comboId && (
                <>
                  <button onClick={() => assignCombo.mutate({ studentIds: [...selectedStudents], combinationId: comboId })}
                    disabled={assignCombo.isPending}
                    className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
                    {assignCombo.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                    Assign {comboMap[comboId]?.code}
                  </button>
                  <button onClick={() => assignCombo.mutate({ studentIds: [...selectedStudents], combinationId: comboId })}
                    disabled={assignCombo.isPending}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
                    <UserPlus size={14} />
                    Assign to All {filteredStudents.length}
                  </button>
                </>
              )}

              <button onClick={async () => {
                const ok = await confirm({
                  title: 'Remove combination?',
                  message: `Remove combination from ${selectedStudents.size} student(s)?`,
                  confirmLabel: 'Remove',
                  variant: 'danger',
                })
                if (ok) removeCombo.mutate([...selectedStudents])
              }} disabled={removeCombo.isPending}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-semibold px-4 py-2 rounded-lg border border-red-200 transition ml-auto">
                {removeCombo.isPending ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Remove Combo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function DashboardAssignment() {
  const toast = useToast()
  const confirm = useConfirm()
  const [level, setLevel] = useState('o_level')

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Users size={22} className="text-green-700" />
        <h1 className="text-2xl font-bold text-gray-800">Subject Assignment</h1>
      </div>

      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        <button onClick={() => setLevel('o_level')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${level === 'o_level' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
          <GraduationCap size={16} /> O-Level
        </button>
        <button onClick={() => setLevel('a_level')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${level === 'a_level' ? 'bg-green-700 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
          <Layers size={16} /> A-Level
        </button>
      </div>

      {level === 'o_level' ? <OLevelBulk toast={toast} confirm={confirm} /> : <ALevelBulk toast={toast} confirm={confirm} />}
    </div>
  )
}
