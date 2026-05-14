-- Run in Supabase SQL Editor
-- Extends exams table with dates and multi-class support

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS has_practical boolean NOT NULL DEFAULT true;

-- Junction table for multi-class exams
CREATE TABLE IF NOT EXISTS public.exam_classes (
  id       serial PRIMARY KEY,
  exam_id  integer NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  UNIQUE(exam_id, class_id)
);

ALTER TABLE public.exam_classes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "read_exam_classes" ON public.exam_classes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin_all_exam_classes" ON public.exam_classes FOR ALL
    USING (public.current_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "staff_write_exam_classes" ON public.exam_classes FOR INSERT
    WITH CHECK (public.current_role() IN ('admin','academic_master'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate existing single-class exams into exam_classes
INSERT INTO public.exam_classes (exam_id, class_id)
  SELECT id, class_id FROM public.exams
  WHERE class_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.exam_classes ec
      WHERE ec.exam_id = exams.id AND ec.class_id = exams.class_id
    )
ON CONFLICT DO NOTHING;
