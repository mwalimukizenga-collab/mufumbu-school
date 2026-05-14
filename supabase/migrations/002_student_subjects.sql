-- Run in Supabase SQL Editor
-- Ensures student_subjects table exists with the correct columns
-- Handles both fresh installs and existing tables

CREATE TABLE IF NOT EXISTS public.student_subjects (
  id            serial PRIMARY KEY,
  student_id    integer NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id    integer NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_id)
);

-- Add academic_year if the table already exists without it (safe to run even if present)
ALTER TABLE public.student_subjects
  ADD COLUMN IF NOT EXISTS academic_year text;

ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "read_student_subjects" ON public.student_subjects FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin_all_student_subjects" ON public.student_subjects FOR ALL
    USING (public.current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "staff_write_student_subjects" ON public.student_subjects FOR INSERT
    WITH CHECK (public.current_role() IN ('admin','academic_master','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "staff_delete_student_subjects" ON public.student_subjects FOR DELETE
    USING (public.current_role() IN ('admin','academic_master','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
