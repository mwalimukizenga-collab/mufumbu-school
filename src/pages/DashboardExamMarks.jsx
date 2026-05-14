import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  Loader, ChevronDown, Check, BookOpen,
  AlertTriangle, Save, X,
} from 'lucide-react'

export default function DashboardExamMarks() {
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [teacherId, setTeacherId]           = useState(null)
  const [selectedExamId, setSelectedExamId] = useState('')
  const [marks, setMarks]                   = useState({})
  const [activeAssignment, setActiveAssignment] = useState(null)

  useEffect(() => {
    if (!user) return
    supabase.from('teachers').select('id').eq('profile_id', user.id).single()
      .then(({ data, error }) => { if (!error && data) setTeacherId(data.id) })
  }, [user])

  // Teacher's assignments
  const { data: assignments } = useQuery({
    queryKey: ['teacher_assignments', teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('*, subjects(id, name, code, has_practical, level), classes(id, name, level)')
        .eq('teacher_id', teacherId)
      if (error) throw error
      return data
    },
    enabled: !!teacherId,
  })

  // All exams
  const { data: allExams } = useQuery({
    queryKey: ['all_exams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*, exam_classes(id, class_id, classes(name, level))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  // Exams that match teacher's class + subject level
  const relevantExams = useMemo(() => {
    if (!allExams || !assignments) return []
    const teacherClassIds   = new Set(assignments.map(a => a.class_id))
    return allExams.filter(exam => {
      const examClassIds = exam.exam_classes?.map(ec => ec.class_id) || []
      if (!examClassIds.some(cid => teacherClassIds.has(cid))) return false
      return assignments.some(a =>
        examClassIds.includes(a.class_id) &&
        a.subjects?.level === exam.level
      )
    })
  }, [allExams, assignments])

  const selectedExam = useMemo(() => {
    if (!selectedExamId || !allExams) return null
    return allExams.find(e => e.id === Number(selectedExamId))
  }, [selectedExamId, allExams])

  // Assignments matching selected exam
  const examAssignments = useMemo(() => {
    if (!selectedExam || !assignments) return []
    const examClassIds      = new Set(selectedExam.exam_classes?.map(ec => ec.class_id) || [])
    const examHasPractical  = selectedExam.has_practical !== false
    return assignments.filter(a =>
      examClassIds.has(a.class_id) &&
      a.subjects?.level === selectedExam.level &&
      (examHasPractical || !a.subjects?.has_practical)
    )
  }, [selectedExam, assignments])

  // Students for active assignment
  const { data: students } = useQuery({
    queryKey: ['students_by_class', activeAssignment?.class_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, registration_number, full_name')
        .eq('class_id', activeAssignment.class_id)
        .order('full_name')
      if (error) throw error
      return data
    },
    enabled: !!activeAssignment?.class_id,
  })

  // Existing results for active assignment
  const { data: existingResults } = useQuery({
    queryKey: ['exam_results', selectedExamId, activeAssignment?.subject_id, activeAssignment?.class_id],
    queryFn: async () => {
      if (!students?.length) return []
      const { data, error } = await supabase
        .from('exam_results')
        .select('*')
        .eq('exam_id', Number(selectedExamId))
        .eq('subject_id', activeAssignment.subject_id)
        .in('student_id', students.map(s => s.id))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId && !!activeAssignment && !!students?.length,
  })

  // Pre-populate marks from existing results (includes is_absent)
  useEffect(() => {
    if (!existingResults) return
    const map = {}
    existingResults.forEach(r => {
      map[r.student_id] = {
        theory:    r.is_absent ? '' : (r.theory_score    ?? ''),
        practical: r.is_absent ? '' : (r.practical_score ?? ''),
        absent:    r.is_absent ?? false,
      }
    })
    setMarks(map)
  }, [existingResults])

  const examHasPractical = selectedExam?.has_practical !== false
  const showPractical    = examHasPractical && activeAssignment?.subjects?.has_practical

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMarkChange = (studentId, field, value) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value === ''
          ? ''
          : Math.max(0, Math.min(field === 'theory' ? 100 : 50, Number(value) || 0)),
      },
    }))
  }

  const handleAbsentChange = (studentId, checked) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        absent:    checked,
        // Clear scores when marking absent
        ...(checked ? { theory: '', practical: '' } : {}),
      },
    }))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = (students ?? []).flatMap(s => {
        const m = marks[s.id]
        if (!m) return []
        const hasMarks = m.theory !== '' && m.theory !== null && m.theory !== undefined
        if (!m.absent && !hasMarks) return []   // skip unrecorded

        return [{
          student_id:      s.id,
          subject_id:      activeAssignment.subject_id,
          exam_id:         Number(selectedExamId),
          is_absent:       m.absent === true,
          theory_score:    m.absent ? null : (Number(m.theory) || 0),
          practical_score: m.absent ? null : (showPractical ? (Number(m.practical) || 0) : null),
          entered_by:      user.id,
        }]
      })

      if (rows.length === 0)
        throw new Error('Enter at least one mark or mark a student absent.')

      const { error } = await supabase.from('exam_results').upsert(rows, {
        onConflict: 'student_id,subject_id,exam_id',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exam_results'] })
      const markedCount = Object.values(marks).filter(m => !m.absent && m.theory !== '').length
      const absentCount = Object.values(marks).filter(m => m.absent).length
      const parts = []
      if (markedCount) parts.push(`${markedCount} marked`)
      if (absentCount) parts.push(`${absentCount} absent`)
      toast.success(`Saved: ${parts.join(', ')}.`)
    },
    onError: (err) => toast.error(err.message),
  })

  // ── Status chip per assignment button ─────────────────────────────────────
  const getStatusIcon = () => {
    if (!existingResults) return null
    const count = existingResults.length
    const total = students?.length || 0
    if (count === 0) return null
    if (count >= total) return <Check size={14} className="text-green-500" />
    return <AlertTriangle size={14} className="text-amber-500" />
  }

  if (!teacherId) {
    return (
      <div className="flex justify-center py-16">
        <Loader size={28} className="animate-spin text-green-600" />
      </div>
    )
  }

  // ── Counters ──────────────────────────────────────────────────────────────
  const markedCount = Object.values(marks).filter(m => !m.absent && m.theory !== '').length
  const absentCount = Object.values(marks).filter(m => m.absent).length
  const totalStudents = students?.length || 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Enter Marks</h2>
        <p className="text-sm text-gray-500">Record examination marks for your subjects</p>
      </div>

      {/* No assignments */}
      {assignments?.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle size={16} />
          You have no subject assignments. Contact admin.
        </div>
      )}

      {/* Select exam */}
      <div className="relative max-w-sm">
        <select
          value={selectedExamId}
          onChange={e => { setSelectedExamId(e.target.value); setActiveAssignment(null); setMarks({}) }}
          className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
        >
          <option value="">Select an exam...</option>
          {relevantExams.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.type}) — {e.academic_year}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {relevantExams.length === 0 && assignments?.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-center gap-2">
          <BookOpen size={16} />
          No exams registered for your classes yet.
        </div>
      )}

      {/* Subject–class assignment pills */}
      {selectedExam && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Your subjects in this exam:</p>
          <div className="flex flex-wrap gap-2">
            {examAssignments.map(a => (
              <button
                key={a.id}
                onClick={() => { setActiveAssignment(a); setMarks({}) }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  activeAssignment?.id === a.id
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                {a.subjects?.name}
                <span className="text-xs opacity-75">({a.classes?.name})</span>
                {getStatusIcon(a.id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mark entry table */}
      {activeAssignment && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

          {/* Table header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 min-w-0">
              <BookOpen size={14} className="shrink-0" />
              <span className="truncate">{activeAssignment.subjects?.name}</span>
              <span className="text-xs text-gray-400 shrink-0">({activeAssignment.classes?.name})</span>
              {showPractical && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">Prac</span>
              )}
            </div>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 bg-green-700 hover:bg-green-600 disabled:opacity-50
                         text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition shrink-0"
            >
              {saveMutation.isPending ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
              Save
            </button>
          </div>

          {/* Column headings */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span className="w-5 shrink-0" />
            <span className="flex-1">Student</span>
            <span className="w-14 text-center">Theory</span>
            {showPractical && <span className="w-14 text-center">Prac</span>}
            <span className="w-16 text-center">Absent</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {students?.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">No students in this class.</div>
            )}

            {students?.map((s, i) => {
              const m       = marks[s.id] || { theory: '', practical: '', absent: false }
              const absent  = m.absent === true

              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 px-4 py-2 transition ${
                    absent ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Row number */}
                  <span className="text-xs text-gray-400 w-5 shrink-0 tabular-nums">{i + 1}</span>

                  {/* Name */}
                  <span className={`flex-1 text-sm truncate min-w-0 ${absent ? 'text-gray-400' : 'text-gray-800'}`}>
                    {s.full_name}
                  </span>

                  {/* Theory input / Absent badge */}
                  {absent ? (
                    <AbsentBadge />
                  ) : (
                    <input
                      type="number" min={0} max={100}
                      value={m.theory}
                      onChange={e => handleMarkChange(s.id, 'theory', e.target.value)}
                      placeholder="T"
                      className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs text-center
                                 focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  )}

                  {/* Practical input / Absent badge */}
                  {showPractical && (
                    absent ? (
                      <AbsentBadge />
                    ) : (
                      <input
                        type="number" min={0} max={50}
                        value={m.practical}
                        onChange={e => handleMarkChange(s.id, 'practical', e.target.value)}
                        placeholder="P"
                        className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs text-center
                                   focus:ring-2 focus:ring-green-500 outline-none"
                      />
                    )
                  )}

                  {/* Absent checkbox */}
                  <div className="w-16 flex justify-center">
                    <input
                      type="checkbox"
                      checked={absent}
                      onChange={e => handleAbsentChange(s.id, e.target.checked)}
                      className="w-4 h-4 accent-gray-500 cursor-pointer"
                      title="Mark as absent"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {markedCount} marked
              {absentCount > 0 && <span className="text-gray-400"> · {absentCount} absent</span>}
              <span className="text-gray-400"> / {totalStudents} total</span>
            </span>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 bg-green-700 hover:bg-green-600 disabled:opacity-50
                         text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
            >
              {saveMutation.isPending ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
              Save Marks
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AbsentBadge() {
  return (
    <span className="w-14 flex items-center justify-center gap-0.5 bg-gray-100 text-gray-400
                     rounded px-1 py-1 text-xs font-medium select-none">
      <X size={10} strokeWidth={2.5} />
    </span>
  )
}
