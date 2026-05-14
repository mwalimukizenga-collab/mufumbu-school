-- Add is_absent flag to exam_results
ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS is_absent boolean NOT NULL DEFAULT false;
