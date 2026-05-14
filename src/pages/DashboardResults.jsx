import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import StudentReportCard from './StudentReportCard'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { getGrade } from '../lib/grading'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  Loader, ChevronDown, TrendingUp, Users,
  Check, AlertTriangle, Download, Search, ArrowUp, ArrowDown,
  Minus, FileText, Printer,
} from 'lucide-react'

// ── Grade/Division colour maps ────────────────────────────────────────────────
const GRADE_COLORS = {
  A: 'text-green-700 bg-green-100', B: 'text-blue-700 bg-blue-100',
  C: 'text-amber-700 bg-amber-100', D: 'text-orange-700 bg-orange-100',
  E: 'text-red-600 bg-red-100',    S: 'text-purple-700 bg-purple-100',
  F: 'text-red-800 bg-red-200',
}
const DIV_COLORS = {
  I:   'text-green-700 bg-green-100', II:  'text-blue-700 bg-blue-100',
  III: 'text-amber-700 bg-amber-100', IV:  'text-orange-700 bg-orange-100',
  '0': 'text-red-700 bg-red-100',
}

// Grade order for bottom stats rows
const O_GRADES = ['A', 'B', 'C', 'D', 'F']
const A_GRADES = ['A', 'B', 'C', 'D', 'E', 'S', 'F']

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeLetters(level) { return level === 'o_level' ? O_GRADES : A_GRADES }

function isPassGrade(grade, level) {
  return level === 'o_level'
    ? ['A', 'B', 'C', 'D'].includes(grade)
    : ['A', 'B', 'C', 'D', 'E'].includes(grade)
}

function modalGrade(grades) {
  if (!grades?.length) return '—'
  const freq = {}
  grades.forEach(g => { freq[g] = (freq[g] || 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportClassToExcel(cls, exam, subjects, generalSummary, subjectStats, level) {
  const wb = XLSX.utils.book_new()
  const rows = []
  const grades = gradeLetters(level)

  // Title
  rows.push(['MUFUMBU SECONDARY SCHOOL'])
  rows.push([`${exam?.name ?? ''} — ${exam?.academic_year ?? ''}`])
  rows.push([cls.className])
  rows.push([])

  // General Summary
  rows.push(['GENERAL SUMMARY'])
  rows.push(['', 'DIV I', 'DIV II', 'DIV III', 'DIV IV', 'DIV 0', 'CLEAN', 'ABSENT', 'TOTAL'])
  ;['GIRLS', 'BOYS', 'TOTAL'].forEach(row => {
    const r = generalSummary[row]
    rows.push([row, r.I, r.II, r.III, r.IV, r['0'], r.clean, r.absent, r.total])
  })
  rows.push([])

  // Student table header
  rows.push(['No.', 'Names', 'Sex', ...subjects.map(s => s.code), 'Div', 'Pts'])

  // Student rows
  cls.students.forEach((s, i) => {
    const div = s.div?.division
    const pts = div === 'X' ? '—'
      : level === 'o_level' ? (s.div?.best7_aggregate ?? '—')
      : (s.div?.best3_principal_aggregate ?? '—')
    rows.push([
      i + 1,
      s.name,
      s.gender ?? '—',
      ...subjects.map(sub => {
        const r = s.subjects.find(r => r.subject_code === sub.code)
        if (!r || r.is_absent) return '—'
        return r.grade ?? '—'
      }),
      div === 'X' || !div ? '—' : div,
      pts,
    ])
  })
  rows.push([])

  // Stats rows
  const statCols = subjects.map(s => subjectStats[s.code] ?? {})
  grades.forEach(g => {
    rows.push([g, '', '', ...statCols.map(st => st[g] ?? 0)])
  })
  rows.push(['TOTAL', '', '', ...statCols.map(st => st.total ?? 0)])
  rows.push(['PASS',  '', '', ...statCols.map(st => {
    const ss = st
    return grades.filter(g => isPassGrade(g, level)).reduce((s, g) => s + (ss[g] || 0), 0)
  })])
  rows.push(['SUBJECT AVERAGE', '', '', ...statCols.map(st =>
    st.total ? (st.totalPct / st.total).toFixed(1) + '%' : '—'
  )])
  rows.push(['SUBJECT GRADE', '', '', ...statCols.map(st => st.modalGrade ?? '—')])
  rows.push(['SUBJECT GPA', '', '', ...statCols.map(st =>
    st.total ? (st.totalPts / st.total).toFixed(2) : '—'
  )])

  // School-wide
  const allStats = statCols.filter(st => st.total > 0)
  const schoolGPA = allStats.length
    ? (allStats.reduce((s, st) => s + st.totalPts / st.total, 0) / allStats.length).toFixed(2)
    : '—'
  const schoolAvg = allStats.length
    ? (allStats.reduce((s, st) => s + st.totalPct / st.total, 0) / allStats.length).toFixed(1) + '%'
    : '—'
  rows.push([`SCHOOL GPA: ${schoolGPA}`])
  rows.push([`SCHOOL AVERAGE: ${schoolAvg}`])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, cls.className.slice(0, 31))
  XLSX.writeFile(wb, `Results_${cls.className}_${exam?.name ?? 'exam'}.xlsx`)
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardResults() {
  const toast   = useToast()
  const confirm = useConfirm()
  const qc      = useQueryClient()
  const printRef = useRef()

  const [tab, setTab]               = useState('results')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [compareExamA, setCompareExamA]     = useState('')
  const [compareExamB, setCompareExamB]     = useState('')
  const [searchStudent, setSearchStudent]   = useState('')
  const [viewClass, setViewClass]           = useState('all')
  const [reportCard, setReportCard]         = useState(null)

  // ── Queries ──────────────────────────────────────────────────────────

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

  const selectedExam = useMemo(() =>
    exams?.find(e => e.id === Number(selectedExamId)) ?? null,
  [selectedExamId, exams])

  const examClasses = useMemo(() =>
    selectedExam?.exam_classes?.map(ec => ec.classes).filter(Boolean) ?? [],
  [selectedExam])

  const { data: gradedResults } = useQuery({
    queryKey: ['exam_results_graded', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded').select('*').eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId,
  })

  const { data: oLevelDivisions } = useQuery({
    queryKey: ['o_level_division', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('o_level_student_division').select('*').eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId && selectedExam?.level === 'o_level',
  })

  const { data: aLevelDivisions } = useQuery({
    queryKey: ['a_level_division', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('a_level_student_division').select('*').eq('exam_id', Number(selectedExamId))
      if (error) throw error
      return data
    },
    enabled: !!selectedExamId && selectedExam?.level === 'a_level',
  })

  const divisionData = selectedExam?.level === 'o_level' ? oLevelDivisions : aLevelDivisions

  // ── Publish ──────────────────────────────────────────────────────────

  const publishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('exams')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('id', Number(selectedExamId))
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams_all'] }); toast.success('Results published.') },
    onError: (err) => toast.error(err.message),
  })

  const handlePublish = async () => {
    const ok = await confirm({
      title: 'Process results?',
      message: 'This will publish all marks and make results visible. Continue?',
      confirmLabel: 'Process', variant: 'warning',
    })
    if (ok) publishMutation.mutate()
  }

  // ── Class results (derived) ──────────────────────────────────────────

  const classResults = useMemo(() => {
    if (!gradedResults || !divisionData) return []

    const classMap = {}
    gradedResults.forEach(r => {
      const cname = r.class_name || 'Unknown'
      if (!classMap[cname]) classMap[cname] = {
        className: cname, schoolLevel: r.school_level, results: [],
      }
      classMap[cname].results.push(r)
    })

    const divMap = {}
    divisionData.forEach(d => { if (!divMap[d.student_id]) divMap[d.student_id] = d })

    return Object.values(classMap).map(c => {
      const level = c.schoolLevel
      const grades = gradeLetters(level)

      // ── Students ──
      const sids = [...new Set(c.results.map(r => r.student_id))]
      const students = sids.map(sid => {
        const subjects  = c.results.filter(r => r.student_id === sid)
        const div       = divMap[sid] ?? {}
        const fallback  = subjects[0] ?? {}
        const gender    = fallback.gender ?? '—'
        const hasAbsent = subjects.some(r => r.is_absent)
        const presentSubs = subjects.filter(r => !r.is_absent && r.final_pct != null)
        const aggregate = level === 'o_level'
          ? (div.best7_aggregate ?? null)
          : (div.best3_principal_aggregate ?? null)
        return {
          studentId: sid,
          name:      div.student_name ?? fallback.student_name ?? '—',
          gender,
          subjects, div, hasAbsent, aggregate,
        }
      })

      // Sort: valid division first (by aggregate asc = better rank), then X
      students.sort((a, b) => {
        const da = a.div?.division, db = b.div?.division
        if (da === 'X' && db !== 'X') return 1
        if (db === 'X' && da !== 'X') return -1
        const pa = a.aggregate ?? 999, pb = b.aggregate ?? 999
        return pa - pb
      })
      students.forEach((s, i) => { s.rank = i + 1 })

      // ── General summary ──
      const generalSummary = {
        GIRLS: { I:0, II:0, III:0, IV:0, '0':0, clean:0, absent:0, total:0 },
        BOYS:  { I:0, II:0, III:0, IV:0, '0':0, clean:0, absent:0, total:0 },
        TOTAL: { I:0, II:0, III:0, IV:0, '0':0, clean:0, absent:0, total:0 },
      }
      students.forEach(s => {
        const row = s.gender === 'F' ? 'GIRLS' : 'BOYS'
        const div = s.div?.division
        ;[row, 'TOTAL'].forEach(key => {
          generalSummary[key].total++
          if (div && div !== 'X' && generalSummary[key][div] !== undefined)
            generalSummary[key][div]++
          if (s.hasAbsent) generalSummary[key].absent++
          else if (div && div !== 'X') generalSummary[key].clean++
        })
      })

      // ── Subject columns (ordered) ──
      const subjectMap = {}
      c.results.forEach(r => {
        const key = r.subject_code || r.subject_name
        if (!subjectMap[key]) subjectMap[key] = { name: r.subject_name, code: r.subject_code }
      })
      const subjectCols = Object.values(subjectMap)

      // ── Subject statistics ──
      const subjectStats = {}
      subjectCols.forEach(s => {
        subjectStats[s.code] = { total: 0, totalPct: 0, totalPts: 0, gradeList: [] }
        grades.forEach(g => { subjectStats[s.code][g] = 0 })
      })
      c.results.filter(r => !r.is_absent && r.final_pct != null && r.grade).forEach(r => {
        const key = r.subject_code || r.subject_name
        const st  = subjectStats[key]
        if (!st) return
        st.total++
        st.totalPct += Number(r.final_pct)
        st.totalPts += Number(r.points) || 0
        st.gradeList.push(r.grade)
        if (r.grade in st) st[r.grade]++
      })
      subjectCols.forEach(s => {
        const st = subjectStats[s.code]
        st.avg       = st.total ? (st.totalPct / st.total).toFixed(1) : null
        st.gpa       = st.total ? (st.totalPts / st.total).toFixed(2) : null
        st.modalGrade = modalGrade(st.gradeList)
      })

      // School-wide stats
      const activeSubs = subjectCols.map(s => subjectStats[s.code]).filter(st => st.total > 0)
      const schoolGPA  = activeSubs.length
        ? (activeSubs.reduce((s, st) => s + st.totalPts / st.total, 0) / activeSubs.length).toFixed(2)
        : null
      const schoolAvg  = activeSubs.length
        ? (activeSubs.reduce((s, st) => s + st.totalPct / st.total, 0) / activeSubs.length).toFixed(1)
        : null

      return { ...c, students, subjectCols, subjectStats, generalSummary, schoolGPA, schoolAvg, level }
    })
  }, [gradedResults, divisionData])

  const filteredClassResults = useMemo(() =>
    viewClass === 'all' ? classResults : classResults.filter(c => c.className === viewClass),
  [classResults, viewClass])

  // ── Compare queries / data ───────────────────────────────────────────

  const examA = useMemo(() => exams?.find(e => e.id === Number(compareExamA)), [exams, compareExamA])
  const examB = useMemo(() => exams?.find(e => e.id === Number(compareExamB)), [exams, compareExamB])

  const { data: resultsA } = useQuery({
    queryKey: ['exam_results_graded', compareExamA],
    queryFn: async () => {
      const { data, error } = await supabase.from('exam_results_graded').select('*').eq('exam_id', Number(compareExamA))
      if (error) throw error; return data
    },
    enabled: !!compareExamA,
  })
  const { data: resultsB } = useQuery({
    queryKey: ['exam_results_graded', compareExamB],
    queryFn: async () => {
      const { data, error } = await supabase.from('exam_results_graded').select('*').eq('exam_id', Number(compareExamB))
      if (error) throw error; return data
    },
    enabled: !!compareExamB,
  })

  const comparisonData = useMemo(() => {
    if (!resultsA || !resultsB) return null
    const byStudent = {}
    resultsA.forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { name: r.student_name, reg: r.registration_number, class: r.class_name, subjects: {} }
      byStudent[r.student_id].subjects[r.subject_code] = { a: Number(r.final_pct), gradeA: r.grade }
    })
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
    const dropped  = students.filter(s => s.status === 'dropped').length
    const same     = students.filter(s => s.status === 'same').length
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
      s.name?.toLowerCase().includes(q) || s.reg?.toLowerCase().includes(q))
  }, [comparisonData, searchStudent])

  // ── Render ───────────────────────────────────────────────────────────

  if (!exams) {
    return <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Title — hidden when printing */}
      <div className="no-print">
        <h2 className="text-xl font-bold text-gray-900">Results &amp; Analysis</h2>
        <p className="text-sm text-gray-500">Process, view, and compare examination results</p>
      </div>

      {/* Tabs */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        {[['results', FileText, 'Results'], ['compare', TrendingUp, 'Compare Exams']].map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition
              ${tab === id ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ══════════ RESULTS TAB ══════════ */}
      {tab === 'results' && (
        <div className="space-y-6">

          {/* Exam selector + publish */}
          <div className="no-print flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <select value={selectedExamId} onChange={e => { setSelectedExamId(e.target.value); setViewClass('all') }}
                className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                <option value="">Select exam…</option>
                {exams.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.type}) — {e.academic_year}{e.is_published ? ' ✓' : ''}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {selectedExam && !selectedExam.is_published && (
              <button onClick={handlePublish} disabled={publishMutation.isPending}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
                {publishMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                Process &amp; Publish
              </button>
            )}
            {selectedExam?.is_published && (
              <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium bg-green-50 px-3 py-2 rounded-lg">
                <Check size={14} /> Published
              </span>
            )}
          </div>

          {/* Class filter pills */}
          {selectedExam && examClasses.length > 0 && (
            <div className="no-print flex flex-wrap gap-1.5">
              <button onClick={() => setViewClass('all')}
                className={`text-xs font-medium px-3 py-1 rounded-full border transition
                  ${viewClass === 'all' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200'}`}>
                All Classes
              </button>
              {examClasses.map(c => (
                <button key={c.id} onClick={() => setViewClass(c.name)}
                  className={`text-xs font-medium px-3 py-1 rounded-full border transition
                    ${viewClass === c.name ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!selectedExam && (
            <div className="text-center py-16 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">Select an exam to view results</p>
            </div>
          )}

          {/* ── Per-class sections ── */}
          {selectedExam && gradedResults && divisionData && filteredClassResults.map(cls => (
            <ClassResultsSection
              key={cls.className}
              cls={cls}
              exam={selectedExam}
              onReportCard={(studentId) => setReportCard({ studentId, examId: Number(selectedExamId), level: cls.level })}
            />
          ))}
        </div>
      )}

      {/* ══════════ COMPARE TAB ══════════ */}
      {tab === 'compare' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {[['Exam A (Previous)', compareExamA, setCompareExamA], ['Exam B (Current)', compareExamB, setCompareExamB]].map(([label, val, set]) => (
              <div key={label} className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <select value={val} onChange={e => set(e.target.value)}
                  className="appearance-none w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
                  <option value="">Select…</option>
                  {exams.filter(e => e.is_published).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 bottom-3 text-gray-400 pointer-events-none" />
              </div>
            ))}
          </div>

          {comparisonData && (
            <div className="space-y-4">
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

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b font-medium text-sm text-gray-700">Subject Comparison</div>
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
                          <td className="px-4 py-2 font-medium">{s.code}</td>
                          <td className="px-4 py-2 text-center">{s.studentCount}</td>
                          <td className="px-4 py-2 text-center font-mono font-semibold">
                            <span className={s.avgChange === '—' ? '' : Number(s.avgChange) >= 0 ? 'text-green-600' : 'text-red-500'}>
                              {s.avgChange !== '—' ? `${s.avgChange > 0 ? '+' : ''}${s.avgChange}%` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {s.avgChange === '—' ? '—' : Number(s.avgChange) > 0
                              ? <ArrowUp size={14} className="inline text-green-600" />
                              : Number(s.avgChange) < 0
                                ? <ArrowDown size={14} className="inline text-red-500" />
                                : <Minus size={14} className="inline text-gray-400" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="relative max-w-sm no-print">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={searchStudent} onChange={e => setSearchStudent(e.target.value)}
                  placeholder="Search student…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b font-medium text-sm text-gray-700">
                  {examA?.name} vs {examB?.name}
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
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{s.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{s.class}</td>
                          {comparisonData.allSubjects.map(code => {
                            const sub = s.subDetails.find(d => d.code === code)
                            return (
                              <td key={code} className="px-2 py-2 text-center">
                                <div className="text-xs">
                                  <span className="text-gray-400">{sub?.a ?? '—'}</span>
                                  <span className="text-gray-300 mx-0.5">→</span>
                                  <span className={sub?.b !== '—' && Number(sub?.b) >= Number(sub?.a) ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                                    {sub?.b ?? '—'}
                                  </span>
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
                              {s.avgChange !== '—' ? `${Number(s.avgChange) > 0 ? '+' : ''}${s.avgChange}%` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {s.status === 'improved' ? <ArrowUp size={14} className="inline text-green-600" />
                              : s.status === 'dropped' ? <ArrowDown size={14} className="inline text-red-500" />
                              : <Minus size={14} className="inline text-gray-400" />}
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

      {/* Report card panel */}
      {reportCard && (
        <StudentReportCard
          studentId={reportCard.studentId}
          examId={reportCard.examId}
          level={reportCard.level}
          onClose={() => setReportCard(null)}
        />
      )}
    </div>
  )
}

// ── ClassResultsSection ────────────────────────────────────────────────────────

function ClassResultsSection({ cls, exam, onReportCard }) {
  const { students, subjectCols, subjectStats, generalSummary, schoolGPA, schoolAvg, level } = cls
  const grades = gradeLetters(level)
  const [showMarks, setShowMarks] = useState(false)

  const studentsWithAvg = useMemo(() => students.map(s => {
    const present = s.subjects.filter(r => !r.is_absent && r.final_pct != null)
    const avg = present.length > 0
      ? (present.reduce((sum, r) => sum + Number(r.final_pct), 0) / present.length).toFixed(1)
      : null
    const overallGrade = avg ? getGrade(level, Number(avg)).grade : null
    return { ...s, avg, overallGrade }
  }), [students, level])

  const handlePrint = () => window.print()

  const handleExport = () => {
    exportClassToExcel(cls, exam, subjectCols, generalSummary, subjectStats, level)
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-section { break-inside: avoid; }
          @page { size: A4 landscape; margin: 1cm; }
          table { font-size: 8px !important; }
          .print-section table { font-size: 8px !important; }
          .print-section th, .print-section td { padding: 1px 3px !important; }
          .print-section .rounded-xl { border-radius: 0 !important; }
        }
      `}</style>
      <div className="space-y-4 print-section">

      {/* Section header */}
      <div className="print:hidden flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-500" />
          <h3 className="text-lg font-bold text-gray-900">{cls.className}</h3>
          <span className="text-sm text-gray-400">— {students.length} students</span>
        </div>
        {/* Action buttons */}
        <div className="no-print flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button onClick={() => setShowMarks(false)}
              className={`px-2.5 py-1.5 text-xs font-bold transition ${!showMarks ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              GRADES
            </button>
            <button onClick={() => setShowMarks(true)}
              className={`px-2.5 py-1.5 text-xs font-bold transition ${showMarks ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              MARKS
            </button>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition">
            <Download size={13} /> Export Excel
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white transition">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block text-center mb-4">
        <p className="text-2xl font-bold uppercase tracking-widest">MUFUMBU SECONDARY SCHOOL</p>
        <p className="text-base font-semibold mt-1">{exam?.name} — {exam?.academic_year}</p>
        <p className="text-sm">{cls.className} &nbsp;|&nbsp; {level === 'o_level' ? 'O-Level' : 'A-Level'}</p>
        <p className="text-xs mt-1">Printed: {new Date().toLocaleDateString()}</p>
      </div>

      {/* ── 1. GENERAL SUMMARY ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-800 text-white text-xs font-bold uppercase tracking-wider">
          General Summary
        </div>
        <div className="flex justify-center py-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                <th className="text-left px-2 py-1.5 border border-gray-200">DIVISION</th>
                {['I', 'II', 'III', 'IV', '0'].map(d => (
                  <th key={d} className={`text-center px-2 py-1.5 border border-gray-200 ${
                    d === 'I' ? 'text-green-700' : d === 'II' ? 'text-blue-700'
                    : d === 'III' ? 'text-amber-700' : d === 'IV' ? 'text-orange-700' : 'text-red-700'
                  }`}>
                    {d === '0' ? 'DIV 0' : `DIV ${d}`}
                  </th>
                ))}
                <th className="text-center px-2 py-1.5 border border-gray-200 text-gray-600">CLEAN</th>
                <th className="text-center px-2 py-1.5 border border-gray-200 text-gray-600">ABSENT</th>
                <th className="text-center px-2 py-1.5 border border-gray-200 text-gray-700">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {['GIRLS', 'BOYS', 'TOTAL'].map((row, ri) => {
                const r = generalSummary[row]
                return (
                  <tr key={row} className={ri === 2 ? 'bg-gray-100 font-bold' : 'hover:bg-gray-50'}>
                    <td className="px-2 py-1.5 border border-gray-200 font-semibold text-gray-700 text-xs uppercase">
                      {row}
                    </td>
                    {['I', 'II', 'III', 'IV', '0'].map(d => (
                      <td key={d} className="px-2 py-1.5 border border-gray-200 text-center tabular-nums">
                        {r[d] > 0 ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${DIV_COLORS[d] || ''}`}>
                            {r[d]}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 border border-gray-200 text-center font-semibold tabular-nums">{r.clean || '—'}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center tabular-nums">
                      {r.absent > 0 ? <span className="text-orange-600 font-semibold">{r.absent}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center font-bold tabular-nums">{r.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 2. STUDENT RESULTS TABLE ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-800 text-white text-xs font-bold uppercase tracking-wider">
          Student Results
        </div>
        <div className="overflow-x-auto flex justify-center">
          <table className="text-xs border-collapse">
            {/* Header */}
            <thead>
              <tr className="bg-gray-100 text-gray-600 font-bold uppercase">
                <th className="text-center px-2 py-2 border border-gray-200 w-8">#</th>
                <th className="text-left px-3 py-2 border border-gray-200 min-w-[140px]">NAMES</th>
                <th className="text-center px-2 py-2 border border-gray-200 w-10">SEX</th>
                {subjectCols.map(s => (
                  <th key={s.code} className="text-center px-2 py-2 border border-gray-200 w-12"
                    title={s.name}>
                    {s.code}
                  </th>
                ))}
                <th className="text-center px-2 py-2 border border-gray-200 w-12">DIV</th>
                <th className="text-center px-2 py-2 border border-gray-200 w-12">PTS</th>
                <th className="text-center px-2 py-2 border border-gray-200 w-14">AVG</th>
                <th className="text-center px-2 py-2 border border-gray-200 w-12">GRADE</th>
              </tr>
            </thead>

            {/* Student rows */}
            <tbody>
              {studentsWithAvg.map((s, i) => {
                const div = s.div?.division
                const pts = div === 'X' ? null
                  : level === 'o_level' ? s.div?.best7_aggregate
                  : s.div?.best3_principal_aggregate
                return (
                  <tr key={s.studentId} className={i % 2 === 0 ? 'bg-white hover:bg-green-50' : 'bg-gray-50 hover:bg-green-50'}>
                    <td className="px-2 py-1.5 border border-gray-200 text-center text-gray-400">{s.rank}</td>
                    <td className="px-3 py-1.5 border border-gray-200 font-medium text-gray-800 whitespace-nowrap">
                      <button
                        onClick={() => onReportCard(s.studentId)}
                        className="hover:text-green-700 hover:underline text-left transition"
                        title="View report card"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center text-gray-500">{s.gender}</td>
                    {subjectCols.map(sub => {
                      const r = s.subjects.find(r => r.subject_code === sub.code)
                      if (!r) return <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center text-gray-300">—</td>
                      if (r.is_absent) return (
                        <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center">
                          <span className="font-bold text-gray-400">—</span>
                        </td>
                      )
                      return (
                        <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center">
                          {showMarks ? (
                            <span className="font-bold text-xs text-gray-700">{r.final_pct}</span>
                          ) : (
                            <span className={`inline-block px-1 py-0.5 rounded font-bold text-xs ${GRADE_COLORS[r.grade] || 'text-gray-600'}`}>
                              {r.grade || '—'}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 border border-gray-200 text-center">
                      {div && div !== 'X' ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-xs ${DIV_COLORS[div] || ''}`}>
                          {div}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center font-mono font-semibold text-gray-700">
                      {pts ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center font-mono text-xs font-semibold text-gray-700">
                      {s.avg ? `${s.avg}%` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 border border-gray-200 text-center">
                      {s.overallGrade ? (
                        <span className={`inline-block px-1 py-0.5 rounded font-bold text-xs ${GRADE_COLORS[s.overallGrade] || 'text-gray-600'}`}>
                          {s.overallGrade}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* ── 3. STATISTICS FOOTER ── */}
            <tfoot>
              {/* Divider row */}
              <tr>
                <td colSpan={3 + subjectCols.length + 4}
                  className="px-3 py-1 bg-gray-800 text-white text-xs font-bold uppercase tracking-wide">
                  Subject Statistics
                </td>
              </tr>

              {/* Grade count rows */}
              {grades.map(g => (
                <tr key={g} className="bg-white">
                  <td className="px-2 py-1.5 border border-gray-200 text-center font-bold">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${GRADE_COLORS[g] || ''}`}>{g}</span>
                  </td>
                  <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs text-gray-400 italic">
                    Grade {g}
                  </td>
                  {subjectCols.map(sub => {
                    const count = subjectStats[sub.code]?.[g] ?? 0
                    return (
                      <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center font-mono text-xs">
                        {count > 0 ? count : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  <td colSpan={4} className="border border-gray-200" />
                </tr>
              ))}

              {/* TOTAL row */}
              <tr className="bg-gray-50">
                <td className="px-2 py-1.5 border border-gray-200 text-center" />
                <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs font-bold text-gray-700 uppercase">TOTAL SAT</td>
                {subjectCols.map(sub => (
                  <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center font-bold font-mono text-xs">
                    {subjectStats[sub.code]?.total ?? 0}
                  </td>
                ))}
                <td colSpan={4} className="border border-gray-200" />
              </tr>

              {/* PASS row */}
              <tr className="bg-green-50">
                <td className="px-2 py-1.5 border border-gray-200 text-center" />
                <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs font-bold text-green-700 uppercase">PASS</td>
                {subjectCols.map(sub => {
                  const st    = subjectStats[sub.code] ?? {}
                  const pass  = grades.filter(g => isPassGrade(g, level)).reduce((s, g) => s + (st[g] || 0), 0)
                  const total = st.total || 0
                  const pct   = total > 0 ? Math.round((pass / total) * 100) : null
                  return (
                    <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center font-mono text-xs">
                      <span className="font-bold text-green-700">{pass}</span>
                      {pct !== null && <span className="text-gray-400 ml-0.5">({pct}%)</span>}
                    </td>
                  )
                })}
                <td colSpan={4} className="border border-gray-200" />
              </tr>

              {/* SUBJECT AVERAGE */}
              <tr className="bg-blue-50">
                <td className="px-2 py-1.5 border border-gray-200" />
                <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs font-bold text-blue-700 uppercase">SUBJECT AVG</td>
                {subjectCols.map(sub => {
                  const st = subjectStats[sub.code]
                  return (
                    <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center font-mono text-xs font-semibold">
                      {st?.avg ? `${st.avg}%` : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
                <td colSpan={4} className="border border-gray-200" />
              </tr>

              {/* SUBJECT GRADE */}
              <tr className="bg-white">
                <td className="px-2 py-1.5 border border-gray-200" />
                <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs font-bold text-gray-700 uppercase">SUBJECT GRADE</td>
                {subjectCols.map(sub => {
                  const g = subjectStats[sub.code]?.modalGrade
                  return (
                    <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center">
                      {g && g !== '—' ? (
                        <span className={`inline-block px-1 py-0.5 rounded font-bold text-xs ${GRADE_COLORS[g] || ''}`}>{g}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
                <td colSpan={4} className="border border-gray-200" />
              </tr>

              {/* SUBJECT GPA */}
              <tr className="bg-gray-50">
                <td className="px-2 py-1.5 border border-gray-200" />
                <td colSpan={2} className="px-3 py-1.5 border border-gray-200 text-xs font-bold text-gray-700 uppercase">SUBJECT GPA</td>
                {subjectCols.map(sub => {
                  const st = subjectStats[sub.code]
                  return (
                    <td key={sub.code} className="px-2 py-1.5 border border-gray-200 text-center font-mono text-xs font-semibold">
                      {st?.gpa ?? <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
                <td colSpan={4} className="border border-gray-200" />
              </tr>

              {/* SCHOOL-WIDE row */}
              <tr className="bg-gray-800 text-white">
                <td className="px-2 py-2 border border-gray-700" />
                <td colSpan={2} className="px-3 py-2 border border-gray-700 text-xs font-bold uppercase">
                  SCHOOL
                </td>
                <td colSpan={subjectCols.length} className="px-3 py-2 border border-gray-700 text-xs">
                  <span className="font-bold">GPA: {schoolGPA ?? '—'}</span>
                  <span className="mx-3 text-gray-400">|</span>
                  <span className="font-bold">Average: {schoolAvg != null ? `${schoolAvg}%` : '—'}</span>
                </td>
                <td colSpan={4} className="border border-gray-700" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    </>
  )
}
