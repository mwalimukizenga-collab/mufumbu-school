/**
 * Mufumbu Secondary School — Grading Engine
 * Handles O-Level and A-Level grade/division calculations.
 */

// ── Final percentage ──────────────────────────────────────────────────────────

/**
 * Compute the final percentage for a result.
 * If the subject has a practical: (theory/100 + practical/50) / 150 * 100
 * Otherwise: theory score is already out of 100.
 */
export function finalPercentage(theoryScore, practicalScore, hasPractical) {
  const theory = theoryScore ?? 0
  const prac   = practicalScore ?? 0
  if (hasPractical) {
    return Math.round(((theory + prac) / 150) * 100 * 100) / 100
  }
  return Math.round(theory * 100) / 100
}

// ── O-Level ───────────────────────────────────────────────────────────────────

/**
 * O-Level grade scale:
 *   A  75–100  → 1 point
 *   B  65–74   → 2 points
 *   C  45–64   → 3 points
 *   D  30–44   → 4 points
 *   F   0–29   → 5 points
 */
export function oLevelGrade(pct) {
  if (pct >= 75) return { grade: 'A', points: 1 }
  if (pct >= 65) return { grade: 'B', points: 2 }
  if (pct >= 45) return { grade: 'C', points: 3 }
  if (pct >= 30) return { grade: 'D', points: 4 }
  return             { grade: 'F', points: 5 }
}

/**
 * O-Level division from best-7-subjects aggregate:
 *   I   → 7–17
 *   II  → 18–21
 *   III → 22–25
 *   IV  → 26–33
 *   0   → 34+
 *
 * @param {number[]} pointsArray – all subject points for the student in this exam
 * @returns {{ aggregate: number, division: string }}
 */
export function oLevelDivision(pointsArray) {
  const sorted    = [...pointsArray].sort((a, b) => a - b)   // ascending (lower = better)
  const best7     = sorted.slice(0, 7)
  const aggregate = best7.reduce((s, p) => s + p, 0)

  let division
  if      (aggregate <= 17) division = 'I'
  else if (aggregate <= 21) division = 'II'
  else if (aggregate <= 25) division = 'III'
  else if (aggregate <= 33) division = 'IV'
  else                      division = '0'

  return { aggregate, division }
}

// ── A-Level ───────────────────────────────────────────────────────────────────

/**
 * A-Level grade scale:
 *   A  80–100  → 1 point
 *   B  70–79   → 2 points
 *   C  60–69   → 3 points
 *   D  50–59   → 4 points
 *   E  40–49   → 5 points
 *   S  35–39   → 6 points
 *   F   0–34   → 7 points
 */
export function aLevelGrade(pct) {
  if (pct >= 80) return { grade: 'A', points: 1 }
  if (pct >= 70) return { grade: 'B', points: 2 }
  if (pct >= 60) return { grade: 'C', points: 3 }
  if (pct >= 50) return { grade: 'D', points: 4 }
  if (pct >= 40) return { grade: 'E', points: 5 }
  if (pct >= 35) return { grade: 'S', points: 6 }
  return             { grade: 'F', points: 7 }
}

/**
 * A-Level division from best-3 PRINCIPAL subjects aggregate:
 *   I   → 3–9
 *   II  → 10–12
 *   III → 13–15
 *   IV  → 16–19
 *   0   → 20+
 *
 * @param {number[]} principalPoints – points for principal subjects only
 * @returns {{ aggregate: number, division: string }}
 */
export function aLevelDivision(principalPoints) {
  const sorted    = [...principalPoints].sort((a, b) => a - b)
  const best3     = sorted.slice(0, 3)
  const aggregate = best3.reduce((s, p) => s + p, 0)

  let division
  if      (aggregate <= 9)  division = 'I'
  else if (aggregate <= 12) division = 'II'
  else if (aggregate <= 15) division = 'III'
  else if (aggregate <= 19) division = 'IV'
  else                      division = '0'

  return { aggregate, division }
}

// ── Unified helper ────────────────────────────────────────────────────────────

/**
 * Get grade (letter + points) based on school level.
 * @param {'o_level'|'a_level'} level
 * @param {number} pct – final percentage
 */
export function getGrade(level, pct) {
  return level === 'o_level' ? oLevelGrade(pct) : aLevelGrade(pct)
}

// ── Grade colour for UI ───────────────────────────────────────────────────────

export const GRADE_COLORS = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-orange-100 text-orange-800',
  E: 'bg-red-100 text-red-700',
  S: 'bg-purple-100 text-purple-800',
  F: 'bg-red-200 text-red-900',
}

export const DIVISION_COLORS = {
  'I':   'bg-green-600 text-white',
  'II':  'bg-blue-600 text-white',
  'III': 'bg-yellow-500 text-white',
  'IV':  'bg-orange-500 text-white',
  '0':   'bg-red-600 text-white',
}

// ── Topic-test pass/fail threshold ───────────────────────────────────────────

export const TOPIC_PASS_THRESHOLD = 50 // percentage

export function topicResult(score, maxScore) {
  const pct = (score / maxScore) * 100
  return {
    pct: Math.round(pct * 10) / 10,
    passed: pct >= TOPIC_PASS_THRESHOLD,
  }
}
