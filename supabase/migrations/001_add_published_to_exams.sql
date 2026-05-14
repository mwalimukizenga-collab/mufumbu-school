-- Run this in Supabase SQL Editor AFTER the main schema.sql

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- When admin publishes results, set is_published=true and published_at=now()
-- Example: UPDATE exams SET is_published=true, published_at=now() WHERE id=1;
