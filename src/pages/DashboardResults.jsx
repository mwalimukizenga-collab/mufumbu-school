import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  Loader, ChevronDown, BarChart2, TrendingUp, Users, BookOpen,
  Check, X, AlertTriangle, Download, Search, ArrowUp, ArrowDown,
  Minus, FileText,
} from 'lucide-react'

const GRADE_COLORS = {
  A: 'text-green-600 bg-green-100', B: 'text-blue-600 bg-blue-100',
  C: 'text-amber-600 bg-amber-100', D: 'text-orange-600 bg-orange-100',
  E: 'text-red-500 bg-red-100', S: 'text-purple-600 bg-purple-100',
  F: 'text-red-600 bg-red-100',
}
const DIVISION_COLORS = {
  I: 'text-green-600 bg-green-100', II: 'text-blue-600 bg-blue-100',
  III: 'text-amber-600 bg-amber-100', IV: 'text-orange-600 bg-orange-100',
  '0': 'text-red-600 bg-red-100',
}

export default function DashboardResults() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [tab, setTab] = useState('results')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [compareExamA, setCompareExamA] = useState('')
  const [compareExamB, setCompareExamB] = useState('')
  const [searchStudent, setSearchStudent] = useState('')
  const [viewClass, setViewClass] = useState('all')

  const { data: exams } = useQuery({
    queryKey: ['exams_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*, exam_classes(id, class_id, classes(name, level))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const selectedExam = useMemo(() => {
    if (!selectedExamId || !exams) return null
    return exams.find(e => e.id === Number(selectedExamId))
  }, [selectedExamId, exams])

  const examClasses = useMemo(() => {
    if (!selectedExam) return []
    return selectedExam.exam_classes?.map(ec => ec.classes).filter(Boolean) || []
  }, [selectedExam])

  const { data: gradedResults } = useQuery({
    queryKey: ['exam_results_graded', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded')
        .select('*')
        .eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId,
  })

  const { data: oLevelDivisions } = useQuery({
    queryKey: ['o_level_division', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('o_level_student_division')
        .select('*')
        .eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId && selectedExam?.level === 'o_level',
  })

  const { data: aLevelDivisions } = useQuery({
    queryKey: ['a_level_division', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('a_level_student_division')
        .select('*')
        .eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId && selectedExam?.level === 'a_level',
  })

  const divisionData = selectedExam?.level === 'o_level' ? oLevelDivisions : aLevelDivisions

  const publishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('exams')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('id', Number(selectedExamId))
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams_all'] })
      toast.success('Results processed and published.')
    },
    onError: (err) => toast.error(err.message),
  })

  const handlePublish = async () => {
    const ok = await confirm({
      title: 'Process results?',
      message: 'This will publish all marks and make results visible. Continue?',
      confirmLabel: 'Process',
      variant: 'warning',
    })
    if (ok) publishMutation.mutate()
  }

  // ── Results by class ─────────────────────────────────────────────────

  const classResults = useMemo(() => {
    if (!gradedResults || !divisionData) return []
    const classMap = {}
    gradedResults.forEach(r => {
      const cname = r.class_name || 'Unknown'
      if (!classMap[cname]) classMap[cname] = {
        className: cname, schoolLevel: r.school_level, results: [], students: new Set(),
      }
      classMap[cname].results.push(r)
      classMap[cname].students.add(r.student_id)
    })
    const divMap = {}
    divisionData.forEach(d => {
      if (!divMap[d.student_id]) divMap[d.student_id] = d
    })
    return Object.values(classMap).map(c => {
      const studentDivisions = {}
      c.results.forEach(r => {
        const div = divMap[r.student_id]
        if (div) studentDivisions[r.student_id] = div
      })
      const students = [...new Set(c.results.map(r => r.student_id))].map(sid => {
        const div = studentDivisions[sid] || {}
        const subjects = c.results.filter(r => r.student_id === sid)
        const avg = subjects.length > 0
          ? (subjects.reduce((sum, s) => sum + Number(s.final_pct), 0) / subjects.length).toFixed(1)
          : '—'
        return { studentId: sid, name: div.student_name, reg: div.registration_number, subjects, avg, div }
      })
      students.sort((a, b) => {
        if (a.avg === '—') return 1
        if (b.avg === '—') return -1
        return Number(b.avg) - Number(a.avg)
      })
      students.forEach((s, i) => s.rank = i + 1)

      // Divisions summary by gender
      const divSummary = { I: { M: 0, F: 0, total: 0 }, II: { M: 0, F: 0, total: 0 }, III: { M: 0, F: 0, total: 0 }, IV: { M: 0, F: 0, total: 0 }, '0': { M: 0, F: 0, total: 0 } }
      c.results.forEach(r => {
        const div = divMap[r.student_id]?.division || '0'
        if (!divSummary[div]) divSummary[div] = { M: 0, F: 0, total: 0 }
        divSummary[div].total++
        if (r.gender === 'M') divSummary[div].M++
        else if (r.gender === 'F') divSummary[div].F++
      })

      // Subject averages
      const subjectMap = {}
      c.results.forEach(r => {
        const key = r.subject_code || r.subject_name
        if (!subjectMap[key]) subjectMap[key] = { name: r.subject_name, code: r.subject_code, scores: [], grades: [] }
        subjectMap[key].scores.push(Number(r.final_pct))
        subjectMap[key].grades.push(r.grade)
      })
      const subjectAvgs = Object.values(subjectMap).map(s => ({
        ...s,
        avg: (s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1),
        grade: getModalGrade(s.grades),
      }))

      const genderBreakdown = { M: 0, F: 0 }
      c.results.forEach(r => { if (r.gender === 'M') genderBreakdown.M++; else if (r.gender === 'F') genderBreakdown.F++ })

      const overallAvg = students.length > 0
        ? (students.reduce((sum, s) => sum + (Number(s.avg) || 0), 0) / students.length).toFixed(1)
        : '—'

      return { ...c, students, divSummary, subjectAvgs, genderBreakdown, overallAvg }
    })
  }, [gradedResults, divisionData])

  const filteredClassResults = useMemo(() => {
    if (viewClass === 'all') return classResults
    return classResults.filter(c => c.className === viewClass)
  }, [classResults, viewClass])

  // ── Comparison ───────────────────────────────────────────────────────

  const examA = useMemo(() => exams?.find(e => e.id === Number(compareExamA)), [exams, compareExamA])
  const examB = useMemo(() => exams?.find(e => e.id === Number(compareExamB)), [exams, compareExamB])

  const { data: resultsA } = useQuery({
    queryKey: ['exam_results_graded', compareExamA],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded')
        .select('*')
        .eq('exam_id', Number(compareExamA))
      if (error) throw error
      return data
    },
    enabled: !!compareExamA,
  })

  const { data: resultsB } = useQuery({
    queryKey: ['exam_results_graded', compareExamB],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded')
        .select('*')
        .eq('exam_id', Number(compareExamB))
      if (error) throw error
      return data
    },
    enabled: !!compareExamB,
  })

  const comparisonData = useMemo(() => {
    if (!resultsA || !resultsB) return null
    const byStudent = {}
    resultsA.forEach(r => { if (!byStudent[r.student_id]) byStudent[r.student_id] = { name: r.student_name, reg: r.registration_number, class: r.class_name, subjects: {} }; byStudent[r.student_id].subjects[r.subject_code] = { a: Number(r.final_pct), gradeA: r.grade } })
    resultsB.forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { name: r.student_name, reg: r.registration_number, class: r.class_name, subjects: {} }
      if (!byStudent[r.student_id].subjects[r.subject_code]) byStudent[r.student_id].subjects[r.subject_code] = {}
      byStudent[r.student_id].subjects[r.subject_code].b = Number(r.final_pct)
      byStudent[r.student_id].subjects[r.subject_code].gradeB = r.grade
    })

    const allSubjects = [...new Set([...resultsA.map(r => r.subject_code), ...resultsB.map(r => r.subject_code)])]
    const students = Object.values(byStudent).map(s => {
      let totalChange = 0, subCount = 0
      const subDetails = allSubjects.map(code => {
        const sub = s.subjects[code] || {}
        const a = sub.a, b = sub.b
        const change = a !== undefined && b !== undefined ? (b - a).toFixed(1) : '—'
        if (a !== undefined && b !== undefined) { totalChange += (b - a); subCount++ }
        return { code, a: a ?? '—', b: b ?? '—', change, gradeA: sub.gradeA || '—', gradeB: sub.gradeB || '—' }
      })
      const avgChange = subCount > 0 ? (totalChange / subCount).toFixed(1) : '—'
      const status = avgChange === '—' ? 'same' : Number(avgChange) > 0 ? 'improved' : Number(avgChange) < 0 ? 'dropped' : 'same'
      return { ...s, subDetails, avgChange, status }
    })

    const improved = students.filter(s => s.status === 'improved').length
    const dropped = students.filter(s => s.status === 'dropped').length
    const same = students.filter(s => s.status === 'same').length

    // Subject-level comparison
    const subjectComp = allSubjects.map(code => {
      let totalDiff = 0, count = 0
      students.forEach(s => {
        const sub = s.subjects[code] || {}
        if (sub.a !== undefined && sub.b !== undefined) { totalDiff += (sub.b - sub.a); count++ }
      })
      return { code, avgChange: count > 0 ? (totalDiff / count).toFixed(1) : '—', studentCount: count }
    })

    return { students, improved, dropped, same, allSubjects, subjectComp }
  }, [resultsA, resultsB])

  const filteredComparison = useMemo(() => {
    if (!comparisonData) return []
    if (!searchStudent) return comparisonData.students
    const q = searchStudent.toLowerCase()
    return comparisonData.students.filter(s =>
      s.name?.toLowerCase().includes(q) || s.reg?.toLowerCase().includes(q)
    )
  }, [comparisonData, searchStudent])

  const isLoading = !exams

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Results & Analysis</h2>
        <p className="text-sm text-gray-500">Process, view, and compare examination results</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <button onClick={() => setTab('results')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'results' ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          <FileText size={15} /> Results
        </button>
        <button onClick={() => setTab('compare')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'compare' ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          <TrendingUp size={15} /> Compare Exams
        </button>
      </div>

      {/* ── RESULTS TAB ── */}
      {tab === 'results' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}
                className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="">Select exam...</option>
                {exams?.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.type}) — {e.academic_year} {e.is_published ? '✓' : ''}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {selectedExam && !selectedExam.is_published && (
              <button onClick={handlePublish} disabled={publishMutation.isPending}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
                {publishMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                Process & Publish Results
              </button>
            )}
            {selectedExam?.is_published && (
              <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium bg-green-50 px-3 py-2 rounded-lg">
                <Check size={14} /> Published
              </span>
            )}
          </div>

          {selectedExam && examClasses.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setViewClass('all')}
                className={`text-xs font-medium px-3 py-1 rounded-full border transition ${viewClass === 'all' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200'}`}>
                All Classes
              </button>
              {examClasses.map(c => (
                <button key={c.id} onClick={() => setViewClass(c.name)}
                  className={`text-xs font-medium px-3 py-1 rounded-full border transition ${viewClass === c.name ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {!selectedExam && (
            <div className="text-center py-16 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">Select an exam to view results</p>
            </div>
          )}

          {selectedExam && gradedResults && divisionData && filteredClassResults.map(cls => (
            <div key={cls.className} className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} /> {cls.className}
                <span className="text-sm font-normal text-gray-500">— {cls.students.length} students</span>
              </h3>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xl font-bold text-gray-900">{cls.students.length}</p>
                  <p className="text-xs text-gray-500">Total Students</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xl font-bold text-gray-900">{cls.overallAvg}%</p>
                  <p className="text-xs text-gray-500">Class Average</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xl font-bold text-blue-600">{cls.genderBreakdown.M}</p>
                  <p className="text-xs text-gray-500">Male</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xl font-bold text-pink-600">{cls.genderBreakdown.F}</p>
                  <p className="text-xs text-gray-500">Female</p>
                </div>
              </div>

              {/* Divisions summary */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">Divisions Summary</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-4 py-2">Division</th>
                      <th className="text-center px-4 py-2">Male</th>
                      <th className="text-center px-4 py-2">Female</th>
                      <th className="text-center px-4 py-2">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(cls.divSummary).filter(([_, v]) => v.total > 0).map(([div, v]) => (
                        <tr key={div}>
                          <td className="px-4 py-2 font-medium">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${DIVISION_COLORS[div] || ''}`}>
                              {div === '0' ? 'Ungraded' : `Division ${div}`}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">{v.M}</td>
                          <td className="px-4 py-2 text-center">{v.F}</td>
                          <td className="px-4 py-2 text-center font-semibold">{v.total}</td>
                        </tr>
                      ))}
                      {Object.values(cls.divSummary).every(v => v.total === 0) && (
                        <tr><td colSpan={4} className="text-center py-4 text-gray-400">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subject averages */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">Subject Performance</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-4 py-2">Subject</th>
                      <th className="text-center px-4 py-2">Average</th>
                      <th className="text-center px-4 py-2">Grade</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {cls.subjectAvgs.map(s => (
                        <tr key={s.code}>
                          <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                          <td className="px-4 py-2 text-center">{s.avg}%</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[s.grade] || ''}`}>{s.grade}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Student results table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">Student Results</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Reg</th>
                      {cls.subjectAvgs.map(s => (
                        <th key={s.code} className="text-center px-2 py-2">{s.code}</th>
                      ))}
                      <th className="text-center px-3 py-2">Avg%</th>
                      <th className="text-center px-3 py-2">Rank</th>
                      <th className="text-center px-3 py-2">Grade</th>
                      <th className="text-center px-3 py-2">Div</th>
                      <th className="text-center px-3 py-2">Pts</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {cls.students.map(s => (
                        <tr key={s.studentId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{s.rank}</td>
                          <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 font-mono">{s.reg}</td>
                          {cls.subjectAvgs.map(sub => {
                            const result = s.subjects.find(r => r.subject_code === sub.code)
                            return (
                              <td key={sub.code} className="px-2 py-2 text-center text-xs font-mono">
                                {result ? (
                                  <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${GRADE_COLORS[result.grade] || ''}`}>
                                    {result.final_pct}%
                                  </span>
                                ) : '—'}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center font-semibold">{s.avg !== '—' ? `${s.avg}%` : '—'}</td>
                          <td className="px-3 py-2 text-center font-bold text-gray-700">{s.rank}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[getAvgGrade(s.subjects)] || ''}`}>
                              {getAvgGrade(s.subjects)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${DIVISION_COLORS[s.div?.division] || ''}`}>
                              {s.div?.division || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-semibold">
                            {s.subjects.reduce((sum, r) => sum + (Number(r.points) || 0), 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COMPARE TAB ── */}
      {tab === 'compare' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Exam A (Previous)</label>
              <select value={compareExamA} onChange={e => setCompareExamA(e.target.value)}
                className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="">Select...</option>
                {exams?.filter(e => e.is_published).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 bottom-3 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Exam B (Current)</label>
              <select value={compareExamB} onChange={e => setCompareExamB(e.target.value)}
                className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="">Select...</option>
                {exams?.filter(e => e.is_published).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 bottom-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {comparisonData && (
            <div className="space-y-4">
              {/* Comparison summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <TrendingUp size={20} className="mx-auto mb-1 text-green-600" />
                  <p className="text-xl font-bold text-green-700">{comparisonData.improved}</p>
                  <p className="text-xs text-green-600">Improved</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <TrendingUp size={20} className="mx-auto mb-1 text-red-500 rotate-180" />
                  <p className="text-xl font-bold text-red-600">{comparisonData.dropped}</p>
                  <p className="text-xs text-red-500">Dropped</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                  <Minus size={20} className="mx-auto mb-1 text-gray-400" />
                  <p className="text-xl font-bold text-gray-700">{comparisonData.same}</p>
                  <p className="text-xs text-gray-500">No Change</p>
                </div>
              </div>

              {/* Subject comparison */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">Subject Comparison</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-4 py-2">Subject</th>
                      <th className="text-center px-4 py-2">Students</th>
                      <th className="text-center px-4 py-2">Avg Change</th>
                      <th className="text-center px-4 py-2">Trend</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {comparisonData.subjectComp.map(s => (
                        <tr key={s.code}>
                          <td className="px-4 py-2 font-medium text-gray-800">{s.code}</td>
                          <td className="px-4 py-2 text-center text-gray-600">{s.studentCount}</td>
                          <td className="px-4 py-2 text-center font-mono font-semibold">
                            <span className={s.avgChange === '—' ? '' : Number(s.avgChange) >= 0 ? 'text-green-600' : 'text-red-500'}>
                              {s.avgChange !== '—' ? `${s.avgChange > 0 ? '+' : ''}${s.avgChange}%` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {s.avgChange === '—' ? '—' : Number(s.avgChange) > 0 ? <ArrowUp size={14} className="inline text-green-600" /> : Number(s.avgChange) < 0 ? <ArrowDown size={14} className="inline text-red-500" /> : <Minus size={14} className="inline text-gray-400" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Student comparison */}
              <div className="relative max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={searchStudent} onChange={e => setSearchStudent(e.target.value)}
                  placeholder="Search student..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">
                  Student Comparison — {examA?.name} vs {examB?.name}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Class</th>
                      {comparisonData.allSubjects.map(code => (
                        <th key={code} className="text-center px-2 py-2">{code}</th>
                      ))}
                      <th className="text-center px-3 py-2">Change</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredComparison.map(s => (
                        <tr key={s.reg} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{s.class}</td>
                          {comparisonData.allSubjects.map(code => {
                            const sub = s.subDetails.find(d => d.code === code)
                            return (
                              <td key={code} className="px-2 py-2 text-center">
                                <div className="text-xs">
                                  <span className="text-gray-400">{sub?.a ?? '—'}</span>
                                  <span className="text-gray-300 mx-0.5">→</span>
                                  <span className={sub?.b !== '—' && Number(sub?.b) >= Number(sub?.a) ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>{sub?.b ?? '—'}</span>
                                </div>
                                {sub?.change !== '—' && (
                                  <span className={`text-xs ${Number(sub.change) > 0 ? 'text-green-500' : 'text-red-400'}`}>
                                    ({sub.change > 0 ? '+' : ''}{sub.change})
                                  </span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center font-mono font-semibold">
                            <span className={s.avgChange === '—' ? '' : Number(s.avgChange) >= 0 ? 'text-green-600' : 'text-red-500'}>
                              {s.avgChange !== '—' ? `${s.avgChange > 0 ? '+' : ''}${s.avgChange}%` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {s.status === 'improved' ? <ArrowUp size={14} className="inline text-green-600" /> : s.status === 'dropped' ? <ArrowDown size={14} className="inline text-red-500" /> : <Minus size={14} className="inline text-gray-400" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getModalGrade(grades) {
  if (!grades?.length) return '—'
  const freq = {}
  grades.forEach(g => { freq[g] = (freq[g] || 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

function getAvgGrade(subjects) {
  if (!subjects?.length) return '—'
  const grades = subjects.map(s => s.grade).filter(Boolean)
  return getModalGrade(grades)
}
