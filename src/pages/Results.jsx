import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Loader, Download, Printer, ChevronLeft } from 'lucide-react'
import { getGrade } from '../lib/grading'

// Division sort order: I is best, X (incomplete) is last
const DIV_ORDER = { I: 1, II: 2, III: 3, IV: 4, '0': 5, X: 6 }

function sortStudents(arr) {
  return [...arr].sort((a, b) => {
    // Girls first
    if (a.gender !== b.gender) {
      if (a.gender === 'F') return -1
      if (b.gender === 'F') return 1
    }
    // By division rank
    const da = DIV_ORDER[a.division] ?? 7
    const db = DIV_ORDER[b.division] ?? 7
    if (da !== db) return da - db
    // Lower points = better
    const pa = a.points ?? 9999
    const pb = b.points ?? 9999
    if (pa !== pb) return pa - pb
    return (a.name || '').localeCompare(b.name || '')
  })
}

const O_GRADES  = ['A', 'B', 'C', 'D', 'F']
const A_GRADES  = ['A', 'B', 'C', 'D', 'E', 'S', 'F']
const PASS_SET  = new Set(['A', 'B', 'C', 'D'])

function gradeFromAvgPct(pct, level) {
  if (level === 'a_level') {
    if (pct >= 80) return 'A'
    if (pct >= 70) return 'B'
    if (pct >= 60) return 'C'
    if (pct >= 50) return 'D'
    if (pct >= 40) return 'E'
    if (pct >= 35) return 'S'
    return 'F'
  }
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 45) return 'C'
  if (pct >= 30) return 'D'
  return 'F'
}

export default function Results() {
  const [selectedExamId, setSelectedExamId] = useState(null)
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [viewMode, setViewMode] = useState('grades') // 'grades' | 'marks'

  // ── Exam list ─────────────────────────────────────────────────────────────────
  const { data: exams = [], isLoading: loadingExams } = useQuery({
    queryKey: ['public_exams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*, exam_classes(id, class_id, classes(id, name, level))')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const selectedExam = useMemo(
    () => exams.find(e => e.id === selectedExamId) ?? null,
    [exams, selectedExamId],
  )

  const examClasses = useMemo(() => {
    if (!selectedExam) return []
    return (selectedExam.exam_classes ?? [])
      .map(ec => ec.classes)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedExam])

  // ── Results data ──────────────────────────────────────────────────────────────
  const { data: allGraded = [], isLoading: loadingResults } = useQuery({
    queryKey: ['public_graded', selectedExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded')
        .select('*')
        .eq('exam_id', selectedExamId)
        .order('student_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedExamId,
  })

  const examLevel = selectedExam?.level ?? allGraded[0]?.school_level

  const { data: allDivisions = [], isLoading: loadingDiv } = useQuery({
    queryKey: ['public_divisions', selectedExamId, examLevel],
    queryFn: async () => {
      const view = examLevel === 'a_level'
        ? 'a_level_student_division'
        : 'o_level_student_division'
      const { data, error } = await supabase
        .from(view)
        .select('*')
        .eq('exam_id', selectedExamId)
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedExamId && !!examLevel,
  })

  const isLoading = loadingResults || loadingDiv

  // ── Derived data ──────────────────────────────────────────────────────────────
  const {
    subjects,
    students,
    summary,
    subjectStats,
    schoolAvg,
    schoolGPA,
  } = useMemo(() => {
    const gradeList = examLevel === 'a_level' ? A_GRADES : O_GRADES

    // Apply class filter
    const graded = selectedClassId
      ? allGraded.filter(r => r.class_id === selectedClassId)
      : allGraded

    if (!graded.length) {
      return { subjects: [], students: [], summary: null, subjectStats: [], schoolAvg: '—', schoolGPA: '—' }
    }

    // Unique subjects sorted by code
    const subMap = {}
    graded.forEach(r => {
      if (!subMap[r.subject_code])
        subMap[r.subject_code] = { code: r.subject_code, name: r.subject_name }
    })
    const subjects = Object.values(subMap).sort((a, b) => a.code.localeCompare(b.code))

    // Division lookup keyed by student_id
    const divMap = {}
    allDivisions.forEach(d => { divMap[d.student_id] = d })

    // Group results by student
    const studentMap = {}
    graded.forEach(r => {
      if (!studentMap[r.student_id]) {
        studentMap[r.student_id] = {
          id:        r.student_id,
          name:      r.student_name,
          gender:    r.gender,
          className: r.class_name,
          results:   {},
        }
      }
      studentMap[r.student_id].results[r.subject_code] = r
    })

    const raw = Object.values(studentMap).map(s => {
      const d        = divMap[s.id]
      const division = d?.division ?? null
      const points   = examLevel === 'o_level'
        ? d?.best7_aggregate
        : d?.best3_principal_aggregate
      const resultsArr = Object.values(s.results)
      const present = resultsArr.filter(r => !r.is_absent && r.final_pct != null)
      const avg = present.length > 0
        ? (present.reduce((sum, r) => sum + Number(r.final_pct), 0) / present.length).toFixed(1)
        : null
      const overallGrade = avg ? getGrade(examLevel, Number(avg)).grade : null
      return { ...s, division, points, divData: d, avg, overallGrade }
    })

    const students = sortStudents(raw)
    students.forEach((s, i) => { s.no = i + 1 })

    // ── General summary ─────────────────────────────────────────────────────────
    const makeRow = () => ({ I: 0, II: 0, III: 0, IV: 0, '0': 0, X: 0, CLEAN: 0, ABSENT: 0, TOTAL: 0 })
    const sg = makeRow(), sb = makeRow(), st = makeRow()

    students.forEach(s => {
      const div = s.division ?? 'X'
      const key = DIV_ORDER[div] ? div : 'X'
      const row = s.gender === 'F' ? sg : sb
      row[key] = (row[key] || 0) + 1
      row.TOTAL++
      if (key === 'X') row.ABSENT++
      st[key] = (st[key] || 0) + 1
      st.TOTAL++
      if (key === 'X') st.ABSENT++
    })
    // CLEAN = Division I + II + III + IV (sat and placed)
    ;[sg, sb, st].forEach(r => {
      r.CLEAN = (r.I || 0) + (r.II || 0) + (r.III || 0) + (r.IV || 0)
    })

    // ── Subject statistics ──────────────────────────────────────────────────────
    const subjectStats = subjects.map(sub => {
      const counts = {}
      gradeList.forEach(g => { counts[g] = 0 })
      let total = 0, pass = 0, totalPct = 0, totalPts = 0

      students.forEach(s => {
        const r = s.results[sub.code]
        if (!r || r.is_absent || r.final_pct == null) return
        total++
        totalPct += Number(r.final_pct)
        totalPts += Number(r.points) || 0
        if (r.grade && counts[r.grade] !== undefined) counts[r.grade]++
        if (PASS_SET.has(r.grade)) pass++
      })

      const avg  = total > 0 ? (totalPct / total).toFixed(1) : '—'
      const gpa  = total > 0 ? (totalPts / total).toFixed(2) : '—'
      const grade = total > 0 ? gradeFromAvgPct(totalPct / total, examLevel) : '—'

      return { code: sub.code, name: sub.name, counts, total, pass, avg, gpa, grade }
    })

    // ── School-wide averages ────────────────────────────────────────────────────
    const allPcts = students.flatMap(s =>
      Object.values(s.results)
        .filter(r => !r.is_absent && r.final_pct != null)
        .map(r => Number(r.final_pct))
    )
    const schoolAvg = allPcts.length
      ? (allPcts.reduce((a, b) => a + b, 0) / allPcts.length).toFixed(1)
      : '—'

    const validGPAs = subjectStats.filter(s => s.gpa !== '—').map(s => Number(s.gpa))
    const schoolGPA = validGPAs.length
      ? (validGPAs.reduce((a, b) => a + b, 0) / validGPAs.length).toFixed(2)
      : '—'

    return {
      subjects,
      students,
      summary: { girls: sg, boys: sb, total: st },
      subjectStats,
      schoolAvg,
      schoolGPA,
    }
  }, [allGraded, allDivisions, selectedClassId, examLevel])

  // ── CSV export ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const gradeList = examLevel === 'a_level' ? A_GRADES : O_GRADES
    const className = selectedClassId
      ? examClasses.find(c => c.id === selectedClassId)?.name
      : 'All'

    const hdr = ['No', 'Names', 'SEX', ...subjects.map(s => s.code), 'DIV', 'POINTS']
    const dataRows = students.map(s => [
      s.no,
      s.name,
      s.gender,
      ...subjects.map(sub => {
        const r = s.results[sub.code]
        if (!r) return ''
        if (r.is_absent) return '-'
        return viewMode === 'marks' ? r.final_pct : (r.grade || '')
      }),
      s.division === 'X' || !s.division ? '' : s.division,
      s.division === 'X' || !s.division ? '' : (s.points ?? ''),
    ])

    const sep = ['', '', '']
    const statRows = [
      sep,
      ...gradeList.map(g => [g, '', '', ...subjectStats.map(s => s.counts[g] ?? 0), '', '']),
      ['TOTAL', '', '', ...subjectStats.map(s => s.total), '', ''],
      ['PASS',  '', '', ...subjectStats.map(s => s.pass),  '', ''],
      ['AVG',   '', '', ...subjectStats.map(s => s.avg),   '', ''],
      ['GRADE', '', '', ...subjectStats.map(s => s.grade), '', ''],
      ['GPA',   '', '', ...subjectStats.map(s => s.gpa),   '', ''],
      sep,
      [`SCHOOL AVG: ${schoolAvg}%`, '', `SCHOOL GPA: ${schoolGPA}`],
    ]

    const csv = [hdr, ...dataRows, ...statRows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedExam?.name ?? 'results'}_${className}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loadingExams) {
    return (
      <div className="flex justify-center py-20">
        <Loader size={28} className="animate-spin text-green-700" />
      </div>
    )
  }

  // ── Exam list ─────────────────────────────────────────────────────────────────
  if (!selectedExamId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Examination Results</h1>
        <p className="text-sm text-gray-500 mb-6">Select an examination to view results</p>

        {exams.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
            No published results available yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-center px-4 py-3 w-14">No</th>
                  <th className="text-left px-4 py-3">Exam Name</th>
                  <th className="text-center px-4 py-3 w-28">Year</th>
                  <th className="text-center px-4 py-3 w-28">Type</th>
                  <th className="text-center px-4 py-3 w-40">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exams.map((exam, i) => (
                  <tr key={exam.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-center text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{exam.name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{exam.academic_year}</td>
                    <td className="px-4 py-3 text-center text-gray-500 capitalize">{exam.type}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedExamId(exam.id)
                            setSelectedClassId(null)
                            setViewMode('grades')
                          }}
                          className="px-3 py-1 rounded bg-green-700 text-white text-xs font-bold
                                     hover:bg-green-600 transition"
                        >
                          GRADES
                        </button>
                        <button
                          onClick={() => {
                            setSelectedExamId(exam.id)
                            setSelectedClassId(null)
                            setViewMode('marks')
                          }}
                          className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-bold
                                     hover:bg-blue-500 transition"
                        >
                          MARKS
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Results detail view ───────────────────────────────────────────────────────
  const gradeList = examLevel === 'a_level' ? A_GRADES : O_GRADES
  const SUM_COLS  = ['I', 'II', 'III', 'IV', '0', 'CLEAN', 'ABSENT', 'TOTAL']

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 1cm; }
          table { font-size: 8px !important; }
          th, td { padding: 1px 4px !important; }
        }
      `}</style>

      <div className="px-4 py-6 print:px-0 print:py-2">

        {/* ── Action bar ─────────────────────────────────────────────────────────── */}
        <div className="no-print flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={() => { setSelectedExamId(null); setSelectedClassId(null) }}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          {examClasses.length > 1 && (
            <select
              value={selectedClassId ?? ''}
              onChange={e => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:ring-2 focus:ring-green-500 outline-none"
            >
              <option value="">All Classes</option>
              {examClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button
              onClick={() => setViewMode('grades')}
              className={`px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'grades'
                  ? 'bg-green-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              GRADES
            </button>
            <button
              onClick={() => setViewMode('marks')}
              className={`px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'marks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              MARKS
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={exportCSV}
              disabled={!students.length}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white text-sm
                         font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
            >
              <Download size={15} />
              Export to Excel
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white text-sm
                         font-medium rounded-lg hover:bg-gray-600 transition"
            >
              <Printer size={15} />
              Print
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader size={28} className="animate-spin text-green-700" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No results found for this selection.
          </div>
        ) : (
          <>
            {/* ── School header ──────────────────────────────────────────────────── */}
            <div className="text-center mb-5 print:mb-3">
              <p className="text-xl font-bold uppercase tracking-widest">MUFUMBU SECONDARY SCHOOL</p>
              <p className="text-base font-semibold mt-1">{selectedExam?.name}</p>
              <p className="text-sm text-gray-600 mt-0.5">
                {selectedExam?.academic_year}
                {selectedExam?.type && ` — ${selectedExam.type.toUpperCase()}`}
                {selectedClassId && ` — ${examClasses.find(c => c.id === selectedClassId)?.name}`}
              </p>
              <p className="hidden print:block text-xs text-gray-400 mt-1">
                Printed: {new Date().toLocaleDateString()}
              </p>
            </div>

            {/* ── General summary ────────────────────────────────────────────────── */}
            <div className="mb-5 print:mb-3">
              <p className="text-xs font-bold uppercase text-center mb-2 tracking-wider">
                GENERAL SUMMARY
              </p>
              <div className="flex justify-center">
                <table className="border-collapse text-xs border border-gray-500">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border border-gray-500 px-2 py-1 font-bold text-left">DIVISION</th>
                      {SUM_COLS.map(h => (
                        <th key={h} className="border border-gray-500 px-2 py-1 font-bold text-center">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['GIRLS', summary.girls],
                      ['BOYS',  summary.boys],
                      ['TOTAL', summary.total],
                    ].map(([label, row], ri) => (
                      <tr key={label} className={ri === 2 ? 'bg-gray-100 font-bold' : ''}>
                        <td className="border border-gray-500 px-2 py-1 font-semibold">{label}</td>
                        {SUM_COLS.map(key => (
                          <td key={key} className="border border-gray-500 px-2 py-1 text-center tabular-nums">
                            {row[key] ?? 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Student results table ──────────────────────────────────────────── */}
            <div className="overflow-x-auto mb-1 flex justify-center">
              <table className="border-collapse text-xs border border-gray-500 print:text-[9px]">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold w-8">No</th>
                    <th className="border border-gray-500 px-2 py-1.5 text-left   font-bold">Names</th>
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold">SEX</th>
                    {subjects.map(s => (
                      <th key={s.code} className="border border-gray-500 px-1 py-1.5 text-center font-bold min-w-[28px]">
                        {s.code}
                      </th>
                    ))}
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold">DIV</th>
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold">PTS</th>
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold">AVG</th>
                    <th className="border border-gray-500 px-2 py-1.5 text-center font-bold">GRADE</th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="border border-gray-500 px-2 py-0.5 text-center tabular-nums text-gray-500">
                        {s.no}
                      </td>
                      <td className="border border-gray-500 px-2 py-0.5 font-medium whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="border border-gray-500 px-2 py-0.5 text-center font-semibold">
                        {s.gender}
                      </td>

                      {subjects.map(sub => {
                        const r = s.results[sub.code]
                        if (!r) {
                          return (
                            <td key={sub.code}
                              className="border border-gray-500 px-1 py-0.5 text-center text-gray-300">
                              —
                            </td>
                          )
                        }
                        if (r.is_absent) {
                          return (
                            <td key={sub.code}
                              className="border border-gray-500 px-1 py-0.5 text-center
                                         font-bold text-gray-400 bg-gray-100">
                              -
                            </td>
                          )
                        }
                        return (
                          <td key={sub.code}
                            className="border border-gray-500 px-1 py-0.5 text-center font-semibold">
                            {viewMode === 'marks' ? r.final_pct : r.grade}
                          </td>
                        )
                      })}

                      <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">
                        {s.division && s.division !== 'X' ? s.division : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="border border-gray-500 px-2 py-0.5 text-center tabular-nums font-mono">
                        {s.division && s.division !== 'X' && s.points != null ? s.points : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="border border-gray-500 px-2 py-0.5 text-center tabular-nums font-mono text-xs">
                        {s.avg ? `${s.avg}%` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">
                        {s.overallGrade ? s.overallGrade : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* ── Statistics footer ──────────────────────────────────────────── */}
                <tfoot>
                  {gradeList.map(g => (
                    <tr key={g} className="bg-gray-50">
                      <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">{g}</td>
                      <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                      {subjectStats.map(stat => (
                        <td key={stat.code}
                          className="border border-gray-500 px-1 py-0.5 text-center tabular-nums">
                          {stat.counts[g] ?? 0}
                        </td>
                      ))}
                      <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                    </tr>
                  ))}

                  <tr className="bg-gray-200 font-bold">
                    <td className="border border-gray-500 px-2 py-0.5 text-center">TOTAL</td>
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                    {subjectStats.map(stat => (
                      <td key={stat.code}
                        className="border border-gray-500 px-1 py-0.5 text-center tabular-nums">
                        {stat.total}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                  </tr>

                  <tr className="bg-gray-50">
                    <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">PASS</td>
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                    {subjectStats.map(stat => (
                      <td key={stat.code}
                        className="border border-gray-500 px-1 py-0.5 text-center tabular-nums text-green-700 font-semibold">
                        {stat.pass}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                  </tr>

                  <tr className="bg-gray-100">
                    <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">AVG</td>
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                    {subjectStats.map(stat => (
                      <td key={stat.code}
                        className="border border-gray-500 px-1 py-0.5 text-center tabular-nums font-semibold">
                        {stat.avg}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                  </tr>

                  <tr className="bg-gray-50">
                    <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">GRADE</td>
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                    {subjectStats.map(stat => (
                      <td key={stat.code}
                        className="border border-gray-500 px-1 py-0.5 text-center font-bold">
                        {stat.grade}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                  </tr>

                  <tr className="bg-gray-100">
                    <td className="border border-gray-500 px-2 py-0.5 text-center font-bold">GPA</td>
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={2} />
                    {subjectStats.map(stat => (
                      <td key={stat.code}
                        className="border border-gray-500 px-1 py-0.5 text-center tabular-nums font-mono">
                        {stat.gpa}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-2 py-0.5" colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── School totals ──────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-8 mt-3 text-sm font-bold text-gray-700 print:text-xs">
              <span>SCHOOL AVERAGE: {schoolAvg}%</span>
              <span>SCHOOL GPA: {schoolGPA}</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
