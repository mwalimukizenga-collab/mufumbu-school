import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { GRADE_COLORS, DIVISION_COLORS } from '../lib/grading'
import { X, Loader, AlertTriangle, Info } from 'lucide-react'

// Minimum subjects needed for a valid division
const MIN_SUBJECTS = { o_level: 7, a_level: 3 }
const MIN_LABEL    = { o_level: '7 subjects', a_level: '3 principal subjects' }
const DIVISION_SCALE = {
  o_level: 'Div I (7–17) · II (18–21) · III (22–25) · IV (26–33) · 0 (34+) — Best 7 subjects',
  a_level: 'Div I (3–9) · II (10–12) · III (13–15) · IV (16–19) · 0 (20+) — Best 3 principals',
}

export default function StudentReportCard({ studentId, examId, level, onClose }) {
  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: subjects = [], isLoading: loadingSubjects } = useQuery({
    queryKey: ['rc_results', studentId, examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results_graded')
        .select('*')
        .eq('student_id', studentId)
        .eq('exam_id', examId)
        .order('subject_name')
      if (error) throw error
      return data ?? []
    },
  })

  const divView = level === 'o_level' ? 'o_level_student_division' : 'a_level_student_division'

  const { data: divData, isLoading: loadingDiv } = useQuery({
    queryKey: ['rc_division', studentId, examId, level],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(divView)
        .select('*')
        .eq('student_id', studentId)
        .eq('exam_id', examId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const isLoading = loadingSubjects || loadingDiv

  // ── Derived values ───────────────────────────────────────────────────────────

  const presentRows = subjects.filter(r => !r.is_absent)
  const absentRows  = subjects.filter(r =>  r.is_absent)

  const satCount   = presentRows.length
  const totalCount = subjects.length

  // Any subject in the exam has a practical component (drives column visibility)
  const showPracticalCol = subjects.some(r => r.has_practical)

  const avgPct = satCount > 0
    ? (presentRows.reduce((s, r) => s + Number(r.final_pct), 0) / satCount).toFixed(1)
    : null

  const pointsTotal = presentRows.reduce((s, r) => s + (Number(r.points) || 0), 0)

  const aggregate = level === 'o_level'
    ? divData?.best7_aggregate
    : divData?.best3_principal_aggregate

  const division           = divData?.division ?? null
  const divisionIncomplete = !divData || division === 'X'
  const minReq             = MIN_SUBJECTS[level]
  const isIncomplete       = satCount < minReq

  // Header info from first result row (all rows share exam / student meta)
  const meta = subjects[0] ?? {}

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close report card"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">

        {/* ── Top bar ── */}
        <div className="bg-green-800 text-white shrink-0">
          <div className="flex items-start justify-between px-6 pt-5 pb-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-green-300 uppercase tracking-widest mb-1">
                Student Report Card
              </p>
              <h2 className="text-xl font-bold leading-tight truncate">
                {meta.student_name ?? '—'}
              </h2>
              <p className="text-sm text-green-200 mt-0.5">
                {meta.registration_number} &nbsp;·&nbsp; {meta.class_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-2 rounded-lg hover:bg-green-700 transition ml-4 mt-0.5"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Exam meta strip */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-6 pb-4 text-xs text-green-200">
            <span><span className="text-green-400">Exam:</span> {meta.exam_name}</span>
            <span><span className="text-green-400">Type:</span>{' '}
              <span className="capitalize">{meta.exam_type}</span>
            </span>
            <span><span className="text-green-400">Year:</span> {meta.academic_year}</span>
            <span><span className="text-green-400">Level:</span>{' '}
              {level === 'o_level' ? 'O-Level' : 'A-Level'}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader size={28} className="animate-spin text-green-600" />
            </div>
          ) : subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
              <AlertTriangle size={32} />
              <p className="text-sm font-medium">No results recorded for this student</p>
            </div>
          ) : (
            <>
              {/* ── Subject table ── */}
              <div className="px-6 pt-6 pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Subject Results
                </p>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5">Subject</th>
                        <th className="text-center px-3 py-2.5">Theory</th>
                        {showPracticalCol && (
                          <th className="text-center px-3 py-2.5">Practical</th>
                        )}
                        <th className="text-center px-3 py-2.5">Score %</th>
                        <th className="text-center px-3 py-2.5">Grade</th>
                        <th className="text-center px-3 py-2.5">Pts</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {subjects.map(r => (
                        r.is_absent
                          ? <AbsentRow key={r.id} row={r} showPracticalCol={showPracticalCol} />
                          : <SubjectRow key={r.id} row={r} showPracticalCol={showPracticalCol} />
                      ))}
                    </tbody>

                    {/* Column totals footer */}
                    {satCount > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs font-semibold text-gray-600">
                          <td className="px-4 py-2.5">
                            {satCount} subject{satCount !== 1 ? 's' : ''} sat
                          </td>
                          <td colSpan={showPracticalCol ? 3 : 2} className="px-3 py-2.5 text-center">
                            Average: {avgPct}%
                          </td>
                          <td className="px-3 py-2.5" />
                          <td className="px-3 py-2.5 text-center tabular-nums">{pointsTotal}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* ── Summary cards ── */}
              <div className="px-6 pt-4 pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Summary
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Subjects sat */}
                  <SummaryCard
                    label="Subjects Sat"
                    value={`${satCount} / ${totalCount}`}
                    sub={
                      satCount < totalCount
                        ? `${absentRows.length} absent — incomplete`
                        : 'All present'
                    }
                    warn={satCount < totalCount}
                  />
                  {/* Average */}
                  <SummaryCard
                    label="Average %"
                    value={avgPct ? `${avgPct}%` : '—'}
                    sub={satCount > 0 ? `${satCount} subject${satCount !== 1 ? 's' : ''}` : ''}
                  />
                  {/* Points */}
                  <SummaryCard
                    label="Total Points"
                    value={satCount > 0 ? pointsTotal : '—'}
                    sub="Lower is better"
                  />
                  {/* Aggregate */}
                  <SummaryCard
                    label={level === 'o_level' ? 'Best 7 Agg.' : 'Best 3 Agg.'}
                    value={aggregate ?? '—'}
                    sub={aggregate ? (level === 'o_level' ? 'of 7 subjects' : 'of 3 principals') : 'N/A'}
                  />
                </div>
              </div>

              {/* ── Division panel ── */}
              <div className="px-6 pt-2 pb-6">
                <div className={`rounded-xl border p-4 ${
                  divisionIncomplete
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-green-50  border-green-200'
                }`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-gray-700">Division</span>

                    {divisionIncomplete ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg
                                         text-sm font-bold bg-orange-100 text-orange-700
                                         border border-orange-300">
                          <AlertTriangle size={13} />
                          X — Insufficient subjects
                        </span>
                        <span className="text-xs text-gray-500">
                          Minimum {MIN_LABEL[level]} required &nbsp;·&nbsp; {satCount} sat
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                          DIVISION_COLORS[division] ?? 'bg-gray-200 text-gray-700'
                        }`}>
                          {division === '0' ? 'Division 0 (Ungraded)' : `Division ${division}`}
                        </span>
                        {aggregate != null && (
                          <span className="text-xs text-gray-500">
                            Aggregate: {aggregate}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Grading scale note */}
                  <p className="mt-2.5 text-xs text-gray-400 flex items-start gap-1">
                    <Info size={11} className="shrink-0 mt-0.5" />
                    {DIVISION_SCALE[level]}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400">Mufumbu Secondary School</p>
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SubjectRow({ row, showPracticalCol }) {
  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-4 py-2.5 font-medium text-gray-800">
        {row.subject_name}
        {row.has_practical && (
          <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">P</span>
        )}
      </td>

      {/* Theory score — always shown */}
      <td className="px-3 py-2.5 text-center font-mono text-gray-700">
        {row.theory_score ?? '—'}{row.theory_score != null ? '/100' : ''}
      </td>

      {/* Practical — only if the exam has at least one practical subject */}
      {showPracticalCol && (
        <td className="px-3 py-2.5 text-center font-mono text-gray-700">
          {row.has_practical
            ? (row.practical_score != null ? `${row.practical_score}/50` : '—')
            : <span className="text-gray-300 select-none">—</span>
          }
        </td>
      )}

      {/* Final % */}
      <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-900">
        {row.final_pct != null ? `${row.final_pct}%` : '—'}
      </td>

      {/* Grade badge */}
      <td className="px-3 py-2.5 text-center">
        {row.grade ? (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[row.grade] ?? ''}`}>
            {row.grade}
          </span>
        ) : '—'}
      </td>

      {/* Points */}
      <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-700">
        {row.points ?? '—'}
      </td>
    </tr>
  )
}

function AbsentRow({ row, showPracticalCol }) {
  // Number of score columns: theory + (practical?) + % + grade + pts = 4 or 5
  const scoreCols = showPracticalCol ? 5 : 4

  return (
    <tr className="bg-gray-50">
      <td className="px-4 py-2.5 text-gray-400">
        {row.subject_name}
        <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
          Absent
        </span>
      </td>
      {Array.from({ length: scoreCols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5 text-center">
          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-bold text-gray-400 bg-gray-200">
            X
          </span>
        </td>
      ))}
    </tr>
  )
}

function SummaryCard({ label, value, sub, warn = false }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${warn ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 leading-snug ${warn ? 'text-orange-500' : 'text-gray-400'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}
