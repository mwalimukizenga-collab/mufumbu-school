-- Expose is_absent in exam_results_graded, and update division views to
-- exclude absent rows from grade maths and return 'X' when the student
-- does not have enough non-absent subjects to calculate a division.

-- ── exam_results_graded ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.exam_results_graded AS
WITH base AS (
  SELECT
    er.id,
    er.student_id,
    er.subject_id,
    er.exam_id,
    er.theory_score,
    er.practical_score,
    er.is_absent,
    er.remarks,
    s.registration_number,
    s.full_name          AS student_name,
    s.gender,
    s.combination_id,
    c.id                 AS class_id,
    c.name               AS class_name,
    c.level              AS school_level,
    sub.name             AS subject_name,
    sub.code             AS subject_code,
    sub.has_practical,
    e.name               AS exam_name,
    e.type               AS exam_type,
    e.academic_year,
    -- absent rows get NULL so they are skipped in aggregations downstream
    CASE WHEN er.is_absent THEN NULL
    ELSE
      round(
        CASE
          WHEN sub.has_practical
            THEN (COALESCE(er.theory_score,0) + COALESCE(er.practical_score,0)) / 150.0 * 100
          ELSE COALESCE(er.theory_score,0)
        END::numeric, 2
      )
    END AS final_pct
  FROM public.exam_results er
  JOIN public.students s   ON s.id   = er.student_id
  JOIN public.subjects sub ON sub.id = er.subject_id
  JOIN public.exams    e   ON e.id   = er.exam_id
  JOIN public.classes  c   ON c.id   = s.class_id
)
SELECT
  base.*,
  CASE WHEN base.is_absent THEN NULL
  ELSE
    CASE base.school_level
      WHEN 'o_level' THEN public.o_level_grade(base.final_pct)
      WHEN 'a_level' THEN public.a_level_grade(base.final_pct)
    END
  END AS grade,
  CASE WHEN base.is_absent THEN NULL
  ELSE
    CASE base.school_level
      WHEN 'o_level' THEN public.o_level_points(base.final_pct)
      WHEN 'a_level' THEN public.a_level_points(base.final_pct)
    END
  END AS points
FROM base;

-- ── o_level_student_division ─────────────────────────────────────────────────
-- Exclude absent rows; return division = 'X' when non-absent subjects < 7.
CREATE OR REPLACE VIEW public.o_level_student_division AS
WITH present AS (
  SELECT * FROM public.exam_results_graded
  WHERE school_level = 'o_level'
    AND (is_absent IS NULL OR is_absent = false)
    AND final_pct   IS NOT NULL
)
SELECT
  g.student_id,
  g.registration_number,
  g.student_name,
  g.class_name,
  g.exam_id,
  g.exam_name,
  g.academic_year,
  count(*)                             AS subjects_taken,
  sum(g.final_pct)                     AS total_percentage,
  round(avg(g.final_pct)::numeric, 1)  AS average_percentage,
  (
    SELECT sum(pts)::bigint
    FROM (
      SELECT g2.points AS pts
      FROM present g2
      WHERE g2.student_id = g.student_id
        AND g2.exam_id    = g.exam_id
      ORDER BY g2.points ASC
      LIMIT 7
    ) best7
  ) AS best7_aggregate,
  CASE WHEN count(*) < 7 THEN 'X'::text
  ELSE
    public.o_level_division((
      SELECT sum(pts)::bigint
      FROM (
        SELECT g2.points AS pts
        FROM present g2
        WHERE g2.student_id = g.student_id
          AND g2.exam_id    = g.exam_id
        ORDER BY g2.points ASC
        LIMIT 7
      ) best7
    ))
  END AS division
FROM present g
GROUP BY g.student_id, g.registration_number, g.student_name,
         g.class_name, g.exam_id, g.exam_name, g.academic_year;

-- ── a_level_student_division ─────────────────────────────────────────────────
-- Exclude absent rows; return division = 'X' when non-absent principal subjects < 3.
CREATE OR REPLACE VIEW public.a_level_student_division AS
WITH present AS (
  SELECT * FROM public.exam_results_graded
  WHERE school_level = 'a_level'
    AND (is_absent IS NULL OR is_absent = false)
    AND final_pct   IS NOT NULL
)
SELECT
  g.student_id,
  g.registration_number,
  g.student_name,
  g.class_name,
  g.combination_id,
  g.exam_id,
  g.exam_name,
  g.academic_year,
  count(*)                             AS subjects_taken,
  sum(g.final_pct)                     AS total_percentage,
  round(avg(g.final_pct)::numeric, 1)  AS average_percentage,
  (
    SELECT sum(pts)::bigint
    FROM (
      SELECT g2.points AS pts
      FROM present g2
      JOIN public.combination_subjects cs
        ON cs.subject_id     = g2.subject_id
       AND cs.combination_id = g.combination_id
       AND cs.is_principal   = true
      WHERE g2.student_id = g.student_id
        AND g2.exam_id    = g.exam_id
      ORDER BY g2.points ASC
      LIMIT 3
    ) best3
  ) AS best3_principal_aggregate,
  CASE WHEN (
    SELECT count(*)
    FROM present g2
    JOIN public.combination_subjects cs
      ON cs.subject_id     = g2.subject_id
     AND cs.combination_id = g.combination_id
     AND cs.is_principal   = true
    WHERE g2.student_id = g.student_id
      AND g2.exam_id    = g.exam_id
  ) < 3 THEN 'X'::text
  ELSE
    public.a_level_division((
      SELECT sum(pts)::bigint
      FROM (
        SELECT g2.points AS pts
        FROM present g2
        JOIN public.combination_subjects cs
          ON cs.subject_id     = g2.subject_id
         AND cs.combination_id = g.combination_id
         AND cs.is_principal   = true
        WHERE g2.student_id = g.student_id
          AND g2.exam_id    = g.exam_id
        ORDER BY g2.points ASC
        LIMIT 3
      ) best3
    ))
  END AS division
FROM present g
GROUP BY g.student_id, g.registration_number, g.student_name,
         g.class_name, g.combination_id, g.exam_id, g.exam_name, g.academic_year;
