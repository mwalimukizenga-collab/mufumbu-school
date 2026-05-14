-- =====================================================
-- MUFUMBU SECONDARY SCHOOL — Full Schema (FIXED)
-- Run in: Supabase SQL Editor
-- Levels: O-Level (Form 1–4) | A-Level (Form 5–6)
-- =====================================================

-- =====================================================
-- TYPES
-- =====================================================
DO $$ BEGIN
  CREATE TYPE school_level AS ENUM ('o_level', 'a_level');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE exam_type AS ENUM ('midterm', 'terminal', 'annual', 'mock');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE exam_scope AS ENUM ('class', 'school');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE topic_status AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'academic_master', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- TABLES
-- =====================================================

-- ---- profiles (linked to auth.users) ----
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name   text       NOT NULL,
  role        user_role  NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ---- classes ----
CREATE TABLE IF NOT EXISTS public.classes (
  id            serial PRIMARY KEY,
  name          text         NOT NULL UNIQUE,
  level         school_level NOT NULL,
  academic_year text         NOT NULL,
  created_at    timestamptz  DEFAULT now()
);

-- ---- subjects ----
CREATE TABLE IF NOT EXISTS public.subjects (
  id            serial PRIMARY KEY,
  name          text         NOT NULL,
  code          text         NOT NULL UNIQUE,
  level         school_level NOT NULL,
  has_practical boolean      DEFAULT false,
  created_at    timestamptz  DEFAULT now()
);

-- ---- A-Level combinations ----
CREATE TABLE IF NOT EXISTS public.combinations (
  id         serial PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  full_name  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ---- combination_subjects ----
CREATE TABLE IF NOT EXISTS public.combination_subjects (
  id              serial PRIMARY KEY,
  combination_id  integer REFERENCES public.combinations(id) ON DELETE CASCADE,
  subject_id      integer REFERENCES public.subjects(id)     ON DELETE CASCADE,
  is_principal    boolean DEFAULT true,
  UNIQUE(combination_id, subject_id)
);

-- ---- teachers ----
CREATE TABLE IF NOT EXISTS public.teachers (
  id              serial PRIMARY KEY,
  profile_id      uuid   REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_number text   UNIQUE,
  full_name       text   NOT NULL,
  gender          text   CHECK (gender IN ('M','F')),
  phone           text,
  email           text,
  created_at      timestamptz DEFAULT now()
);

-- ---- teacher_assignments ----
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id            serial PRIMARY KEY,
  teacher_id    integer REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id    integer REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id      integer REFERENCES public.classes(id)  ON DELETE CASCADE,
  academic_year text NOT NULL,
  UNIQUE(teacher_id, subject_id, class_id, academic_year)
);

-- ---- students ----
CREATE TABLE IF NOT EXISTS public.students (
  id                  serial PRIMARY KEY,
  profile_id          uuid    REFERENCES public.profiles(id)     ON DELETE SET NULL,
  registration_number text    NOT NULL UNIQUE,
  full_name           text    NOT NULL,
  gender              text    CHECK (gender IN ('M','F')),
  date_of_birth       date,
  class_id            integer REFERENCES public.classes(id)      ON DELETE SET NULL,
  combination_id      integer REFERENCES public.combinations(id) ON DELETE SET NULL,
  enrollment_year     text,
  photo_url           text,
  created_at          timestamptz DEFAULT now()
);

-- ---- exams ----
CREATE TABLE IF NOT EXISTS public.exams (
  id            serial PRIMARY KEY,
  name          text         NOT NULL,
  type          exam_type    NOT NULL,
  scope         exam_scope   NOT NULL DEFAULT 'school',
  level         school_level NOT NULL,
  class_id      integer REFERENCES public.classes(id) ON DELETE SET NULL,
  academic_year text NOT NULL,
  exam_date     date,
  created_at    timestamptz DEFAULT now()
);

-- ---- exam_results ----
CREATE TABLE IF NOT EXISTS public.exam_results (
  id               serial PRIMARY KEY,
  student_id       integer REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id       integer REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_id          integer REFERENCES public.exams(id)    ON DELETE CASCADE,
  theory_score     real CHECK (theory_score  >= 0 AND theory_score  <= 100),
  practical_score  real CHECK (practical_score >= 0 AND practical_score <= 50),
  is_absent        boolean NOT NULL DEFAULT false,
  remarks          text,
  entered_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_id, exam_id)
);

-- ---- syllabus_topics ----
CREATE TABLE IF NOT EXISTS public.syllabus_topics (
  id             serial PRIMARY KEY,
  assignment_id  integer      REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  topic_name     text         NOT NULL,
  competency     text,
  start_date     date,
  end_date       date,
  status         topic_status DEFAULT 'not_started',
  created_at     timestamptz  DEFAULT now(),
  updated_at     timestamptz  DEFAULT now()
);

-- ---- topic_tests ----
CREATE TABLE IF NOT EXISTS public.topic_tests (
  id         serial PRIMARY KEY,
  topic_id   integer REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  student_id integer REFERENCES public.students(id)        ON DELETE CASCADE,
  score      real NOT NULL CHECK (score >= 0),
  max_score  real NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  UNIQUE(topic_id, student_id)
);

-- =====================================================
-- TRIGGERS — updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS exam_results_updated_at ON public.exam_results;
CREATE TRIGGER exam_results_updated_at
  BEFORE UPDATE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS syllabus_topics_updated_at ON public.syllabus_topics;
CREATE TRIGGER syllabus_topics_updated_at
  BEFORE UPDATE ON public.syllabus_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- GRADING FUNCTIONS (FIXED: using bigint for sum() results)
-- =====================================================

-- O-Level grade letter
CREATE OR REPLACE FUNCTION public.o_level_grade(pct numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pct >= 75 THEN 'A'
    WHEN pct >= 65 THEN 'B'
    WHEN pct >= 45 THEN 'C'
    WHEN pct >= 30 THEN 'D'
    ELSE 'F'
  END;
$$;

-- O-Level grade points
CREATE OR REPLACE FUNCTION public.o_level_points(pct numeric)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pct >= 75 THEN 1
    WHEN pct >= 65 THEN 2
    WHEN pct >= 45 THEN 3
    WHEN pct >= 30 THEN 4
    ELSE 5
  END;
$$;

-- O-Level division (FIXED: accepts bigint)
CREATE OR REPLACE FUNCTION public.o_level_division(agg bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN agg <= 17 THEN 'I'
    WHEN agg <= 21 THEN 'II'
    WHEN agg <= 25 THEN 'III'
    WHEN agg <= 33 THEN 'IV'
    ELSE '0'
  END;
$$;

-- A-Level grade letter
CREATE OR REPLACE FUNCTION public.a_level_grade(pct numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pct >= 80 THEN 'A'
    WHEN pct >= 70 THEN 'B'
    WHEN pct >= 60 THEN 'C'
    WHEN pct >= 50 THEN 'D'
    WHEN pct >= 40 THEN 'E'
    WHEN pct >= 35 THEN 'S'
    ELSE 'F'
  END;
$$;

-- A-Level grade points
CREATE OR REPLACE FUNCTION public.a_level_points(pct numeric)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pct >= 80 THEN 1
    WHEN pct >= 70 THEN 2
    WHEN pct >= 60 THEN 3
    WHEN pct >= 50 THEN 4
    WHEN pct >= 40 THEN 5
    WHEN pct >= 35 THEN 6
    ELSE 7
  END;
$$;

-- A-Level division (FIXED: accepts bigint)
CREATE OR REPLACE FUNCTION public.a_level_division(agg bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN agg <= 9  THEN 'I'
    WHEN agg <= 12 THEN 'II'
    WHEN agg <= 15 THEN 'III'
    WHEN agg <= 19 THEN 'IV'
    ELSE '0'
  END;
$$;

-- =====================================================
-- VIEWS
-- =====================================================

-- View: exam results with computed percentage, grade, points
CREATE OR REPLACE VIEW public.exam_results_graded AS
WITH base AS (
  SELECT
    er.id,
    er.student_id,
    er.subject_id,
    er.exam_id,
    er.theory_score,
    er.practical_score,
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
    round(
      CASE
        WHEN sub.has_practical
          THEN (COALESCE(er.theory_score,0) + COALESCE(er.practical_score,0)) / 150.0 * 100
        ELSE COALESCE(er.theory_score,0)
      END::numeric, 2
    ) AS final_pct
  FROM public.exam_results er
  JOIN public.students s   ON s.id   = er.student_id
  JOIN public.subjects sub ON sub.id = er.subject_id
  JOIN public.exams    e   ON e.id   = er.exam_id
  JOIN public.classes  c   ON c.id   = s.class_id
)
SELECT
  base.*,
  CASE base.school_level
    WHEN 'o_level' THEN public.o_level_grade(base.final_pct)
    WHEN 'a_level' THEN public.a_level_grade(base.final_pct)
  END AS grade,
  CASE base.school_level
    WHEN 'o_level' THEN public.o_level_points(base.final_pct)
    WHEN 'a_level' THEN public.a_level_points(base.final_pct)
  END AS points
FROM base;

-- View: O-Level student division per exam (best 7 subjects)
CREATE OR REPLACE VIEW public.o_level_student_division AS
SELECT
  g.student_id,
  g.registration_number,
  g.student_name,
  g.class_name,
  g.exam_id,
  g.exam_name,
  g.academic_year,
  count(*)              AS subjects_taken,
  sum(g.final_pct)      AS total_percentage,
  round(avg(g.final_pct)::numeric, 1) AS average_percentage,
  (
    SELECT sum(pts)::bigint
    FROM (
      SELECT g2.points AS pts
      FROM public.exam_results_graded g2
      WHERE g2.student_id = g.student_id
        AND g2.exam_id    = g.exam_id
      ORDER BY g2.points ASC
      LIMIT 7
    ) best7
  ) AS best7_aggregate,
  public.o_level_division(
    (
      SELECT sum(pts)::bigint
      FROM (
        SELECT g2.points AS pts
        FROM public.exam_results_graded g2
        WHERE g2.student_id = g.student_id
          AND g2.exam_id    = g.exam_id
        ORDER BY g2.points ASC
        LIMIT 7
      ) best7
    )
  ) AS division
FROM public.exam_results_graded g
WHERE g.school_level = 'o_level'
GROUP BY g.student_id, g.registration_number, g.student_name,
         g.class_name, g.exam_id, g.exam_name, g.academic_year;

-- View: A-Level student division per exam (best 3 PRINCIPAL subjects)
CREATE OR REPLACE VIEW public.a_level_student_division AS
SELECT
  g.student_id,
  g.registration_number,
  g.student_name,
  g.class_name,
  g.combination_id,
  g.exam_id,
  g.exam_name,
  g.academic_year,
  count(*)              AS subjects_taken,
  sum(g.final_pct)      AS total_percentage,
  round(avg(g.final_pct)::numeric, 1) AS average_percentage,
  (
    SELECT sum(pts)::bigint
    FROM (
      SELECT g2.points AS pts
      FROM public.exam_results_graded g2
      JOIN public.combination_subjects cs
        ON cs.subject_id = g2.subject_id
       AND cs.combination_id = g.combination_id
       AND cs.is_principal = true
      WHERE g2.student_id = g.student_id
        AND g2.exam_id    = g.exam_id
      ORDER BY g2.points ASC
      LIMIT 3
    ) best3
  ) AS best3_principal_aggregate,
  public.a_level_division(
    (
      SELECT sum(pts)::bigint
      FROM (
        SELECT g2.points AS pts
        FROM public.exam_results_graded g2
        JOIN public.combination_subjects cs
          ON cs.subject_id = g2.subject_id
         AND cs.combination_id = g.combination_id
         AND cs.is_principal = true
        WHERE g2.student_id = g.student_id
          AND g2.exam_id    = g.exam_id
        ORDER BY g2.points ASC
        LIMIT 3
      ) best3
    )
  ) AS division
FROM public.exam_results_graded g
WHERE g.school_level = 'a_level'
GROUP BY g.student_id, g.registration_number, g.student_name,
         g.class_name, g.combination_id, g.exam_id, g.exam_name, g.academic_year;

-- View: topic test analysis
CREATE OR REPLACE VIEW public.topic_analysis AS
SELECT
  st.id                                AS topic_id,
  st.topic_name,
  st.competency,
  st.status,
  st.start_date,
  st.end_date,
  ta.class_id,
  c.name                               AS class_name,
  c.level                              AS school_level,
  ta.subject_id,
  sub.name                             AS subject_name,
  sub.code                             AS subject_code,
  ta.teacher_id,
  t.full_name                          AS teacher_name,
  count(tt.id)                         AS students_tested,
  count(CASE WHEN (tt.score / tt.max_score * 100) >= 50 THEN 1 END) AS passed,
  count(CASE WHEN (tt.score / tt.max_score * 100) <  50 THEN 1 END) AS failed,
  round(avg(tt.score / tt.max_score * 100)::numeric, 1)             AS average_pct,
  round(min(tt.score / tt.max_score * 100)::numeric, 1)             AS min_pct,
  round(max(tt.score / tt.max_score * 100)::numeric, 1)             AS max_pct
FROM public.syllabus_topics st
JOIN public.teacher_assignments ta ON ta.id  = st.assignment_id
JOIN public.classes             c  ON c.id   = ta.class_id
JOIN public.subjects            sub ON sub.id = ta.subject_id
JOIN public.teachers            t  ON t.id   = ta.teacher_id
LEFT JOIN public.topic_tests    tt ON tt.topic_id = st.id
GROUP BY st.id, st.topic_name, st.competency, st.status, st.start_date, st.end_date,
         ta.class_id, c.name, c.level, ta.subject_id, sub.name, sub.code,
         ta.teacher_id, t.full_name;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combinations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combination_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_topics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_tests        ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Public read for catalogue tables
DO $$ BEGIN
  CREATE POLICY "read_classes"       ON public.classes             FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_subjects"      ON public.subjects            FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_combinations"  ON public.combinations        FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_combo_sub"     ON public.combination_subjects FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_teachers"      ON public.teachers            FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_assignments"   ON public.teacher_assignments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_students"      ON public.students            FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_exams"         ON public.exams               FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_results"       ON public.exam_results        FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_topics"        ON public.syllabus_topics     FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "read_topic_tests"   ON public.topic_tests         FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profiles: each user sees own row; admin/academic_master see all
DO $$ BEGIN
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.current_role() IN ('admin','academic_master'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin: full write on everything
DO $$ BEGIN CREATE POLICY "admin_all_exams"    ON public.exams               FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_students" ON public.students            FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_teachers" ON public.teachers            FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_classes"  ON public.classes             FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_combos"   ON public.combinations        FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_combo_s"  ON public.combination_subjects FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_subjects" ON public.subjects            FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_assigns"  ON public.teacher_assignments FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_results"  ON public.exam_results        FOR ALL USING (public.current_role() = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teachers: manage own syllabus topics
DO $$ BEGIN
  CREATE POLICY "teacher_own_topics" ON public.syllabus_topics FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.teachers t ON t.id = ta.teacher_id
        WHERE ta.id = syllabus_topics.assignment_id
          AND t.profile_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teachers and academic_master: write results
DO $$ BEGIN
  CREATE POLICY "staff_write_results" ON public.exam_results FOR INSERT
    WITH CHECK (public.current_role() IN ('admin','academic_master','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "staff_update_results" ON public.exam_results FOR UPDATE
    USING (public.current_role() IN ('admin','academic_master','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teachers: write topic_tests for their own topics
DO $$ BEGIN
  CREATE POLICY "teacher_write_topic_tests" ON public.topic_tests FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.syllabus_topics st
        JOIN public.teacher_assignments ta ON ta.id = st.assignment_id
        JOIN public.teachers t ON t.id = ta.teacher_id
        WHERE st.id = topic_tests.topic_id
          AND t.profile_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- SEED DATA
-- =====================================================

-- O-Level subjects
INSERT INTO public.subjects (name, code, level, has_practical) VALUES
  ('Mathematics',         'MATH',   'o_level', false),
  ('English Language',    'ENG',    'o_level', false),
  ('French',              'FRE',    'o_level', false),
  ('Kiswahili',           'KIS',    'o_level', false),
  ('Biology',             'BIO-O',  'o_level', true),
  ('Chemistry',           'CHEM-O', 'o_level', true),
  ('Physics',             'PHY-O',  'o_level', true),
  ('History',             'HIST',   'o_level', false),
  ('Geography',           'GEO',    'o_level', false),
  ('Computer Science',    'CS-O',   'o_level', true),
  ('Christian Religious Education', 'CRE', 'o_level', false),
  ('Entrepreneurship',    'ENT-O',  'o_level', false)
ON CONFLICT (code) DO NOTHING;

-- A-Level subjects
INSERT INTO public.subjects (name, code, level, has_practical) VALUES
  ('Mathematics',         'MATH-A', 'a_level', false),
  ('Physics',             'PHY-A',  'a_level', true),
  ('Chemistry',           'CHEM-A', 'a_level', true),
  ('Biology',             'BIO-A',  'a_level', true),
  ('Economics',           'ECO',    'a_level', false),
  ('History',             'HIST-A', 'a_level', false),
  ('Geography',           'GEO-A',  'a_level', false),
  ('Computer Science',    'CS-A',   'a_level', true),
  ('Entrepreneurship',    'ENT-A',  'a_level', false),
  ('General Studies',     'GS',     'a_level', false),
  ('English Literature',  'LIT',    'a_level', false)
ON CONFLICT (code) DO NOTHING;

-- A-Level combinations
INSERT INTO public.combinations (code, full_name) VALUES
  ('PCB',  'Physics, Chemistry, Biology'),
  ('PCM',  'Physics, Chemistry, Mathematics'),
  ('MCE',  'Mathematics, Computer Science, Economics'),
  ('HEG',  'History, Economics, Geography'),
  ('BCG',  'Biology, Chemistry, Geography'),
  ('MEG',  'Mathematics, Economics, Geography')
ON CONFLICT (code) DO NOTHING;

-- Classes O-Level
INSERT INTO public.classes (name, level, academic_year) VALUES
  ('Form 1', 'o_level', '2024-2025'),
  ('Form 2', 'o_level', '2024-2025'),
  ('Form 3', 'o_level', '2024-2025'),
  ('Form 4', 'o_level', '2024-2025')
ON CONFLICT (name) DO NOTHING;

-- Classes A-Level
INSERT INTO public.classes (name, level, academic_year) VALUES
  ('Form 5', 'a_level', '2024-2025'),
  ('Form 6', 'a_level', '2024-2025')
ON CONFLICT (name) DO NOTHING;