import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { Loader, Check, X, AlertTriangle, Users, Percent } from 'lucide-react'

export default function DashboardTopicScores({ topic, assignment, onClose }) {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [maxScore, setMaxScore] = useState(10)
  const [scores, setScores] = useState({})

  const classId = assignment?.class_id

  // Fetch students in this class
  const { data: students, isLoading: loadStudents } = useQuery({
    queryKey: ['students_by_class', classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, registration_number, full_name')
        .eq('class_id', classId)
        .order('full_name')
      if (error) throw error
      return data
    },
    enabled: !!classId,
  })

  // Fetch existing scores for this topic
  const { data: existingScores, isLoading: loadScores } = useQuery({
    queryKey: ['topic_tests', topic.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topic_tests')
        .select('*')
        .eq('topic_id', topic.id)
      if (error) throw error
      return data
    },
    enabled: !!topic.id,
    onSuccess: (data) => {
      if (data?.length) {
        setMaxScore(data[0].max_score || 10)
        const map = {}
        data.forEach(s => { map[s.student_id] = s.score })
        setScores(map)
      }
    },
  })

  const totalStudents = students?.length || 0
  const scoredCount = Object.values(scores).filter(s => s !== '' && s !== null && s !== undefined).length
  const pctScored = totalStudents > 0 ? Math.round((scoredCount / totalStudents) * 100) : 0
  const canSubmit = totalStudents === 0 || scoredCount >= Math.ceil(totalStudents * 0.75)
  const isFullyScored = totalStudents > 0 && scoredCount >= totalStudents

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(scores)
        .filter(([_, s]) => s !== '' && s !== null && s !== undefined)
        .map(([studentId, score]) => ({
          topic_id: topic.id,
          student_id: Number(studentId),
          score: Number(score),
          max_score: Number(maxScore),
        }))

      if (rows.length === 0) throw new Error('Enter at least one score.')

      // Delete existing scores for this topic, then bulk insert
      const { error: delErr } = await supabase.from('topic_tests').delete().eq('topic_id', topic.id)
      if (delErr) throw delErr

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('topic_tests').insert(rows)
        if (insErr) throw insErr
      }

      // Mark topic as completed
      const { error: updErr } = await supabase
        .from('syllabus_topics')
        .update({ status: 'completed' })
        .eq('id', topic.id)
      if (updErr) throw updErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topic_tests'] })
      qc.invalidateQueries({ queryKey: ['syllabus_topics'] })
      toast.success(`Scores saved for ${scoredCount} student(s). Topic marked completed.`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  const handleSave = async () => {
    const msg = `Only ${scoredCount} of ${totalStudents} students have scores (${pctScored}%). ${canSubmit ? 'Submit anyway?' : 'At least 75% must have scores before submitting.'}`
    if (!canSubmit) {
      toast.warning(`Need at least ${Math.ceil(totalStudents * 0.75)} students scored (${pctScored}% scored).`)
      return
    }
    if (!isFullyScored) {
      const ok = await confirm({
        title: 'Submit scores?',
        message: `${scoredCount} of ${totalStudents} students scored (${pctScored}%). Missing students will have no record. Continue?`,
        confirmLabel: 'Submit',
        variant: 'warning',
      })
      if (!ok) return
    }
    saveMutation.mutate()
  }

  const handleScoreChange = (studentId, val) => {
    const num = val === '' ? '' : Math.max(0, Math.min(Number(maxScore), Number(val) || 0))
    setScores(prev => ({ ...prev, [studentId]: num }))
  }

  const fillAll = () => {
    const filled = {}
    students?.forEach(s => { filled[s.id] = Number(maxScore) / 2 })
    setScores(prev => ({ ...prev, ...filled }))
  }

  if (loadStudents || loadScores) {
    return (
      <div className="flex justify-center py-16">
        <Loader size={28} className="animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{topic.topic_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {assignment?.subjects?.name} — {assignment?.classes?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition shrink-0 ml-3"><X size={18} /></button>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Users size={16} className="text-gray-400" />
              <span className="text-gray-600">Students:</span>
              <span className="font-semibold text-gray-900">{totalStudents}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Percent size={16} className="text-gray-400" />
              <span className="text-gray-600">Scored:</span>
              <span className={`font-semibold ${pctScored >= 75 ? 'text-green-600' : 'text-amber-600'}`}>
                {scoredCount}/{totalStudents} ({pctScored}%)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Max Score:</span>
              <input type="number" value={maxScore} min={1} max={100}
                onChange={e => setMaxScore(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
            <button onClick={fillAll}
              className="text-xs text-blue-600 hover:underline font-medium">
              Fill default (50%)
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pctScored >= 75 ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(pctScored, 100)}%` }}
            />
          </div>
          {!canSubmit && (
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle size={12} />
              Need at least {Math.ceil(totalStudents * 0.75)} students scored ({Math.ceil(totalStudents * 0.75) - scoredCount} more) to submit.
            </p>
          )}
        </div>

        {/* Score table */}
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          {students?.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No students in this class.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <div className="flex-1">Student</div>
                <div className="w-24 text-right">Reg No.</div>
                <div className="w-20 text-right">Score /{maxScore}</div>
              </div>
              {students?.map(student => (
                <div key={student.id} className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                  <div className="flex-1 text-sm font-medium text-gray-800 truncate">
                    {student.full_name}
                  </div>
                  <div className="w-24 text-right text-xs text-gray-400 font-mono">
                    {student.registration_number}
                  </div>
                  <div className="w-20 text-right">
                    <input
                      type="number"
                      value={scores[student.id] ?? ''}
                      onChange={e => handleScoreChange(student.id, e.target.value)}
                      min={0}
                      max={maxScore}
                      step={0.5}
                      className={`w-16 border rounded px-2 py-1 text-sm text-center outline-none transition
                        ${scores[student.id] !== undefined && scores[student.id] !== ''
                          ? 'border-green-300 bg-green-50 focus:ring-2 focus:ring-green-500'
                          : 'border-gray-300 focus:ring-2 focus:ring-green-500'
                        }`}
                      placeholder="—"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={handleSave}
            disabled={!canSubmit || saveMutation.isPending || scoredCount === 0}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2">
            {saveMutation.isPending ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
            Save & Complete Topic
          </button>
        </div>
      </div>
    </div>
  )
}
