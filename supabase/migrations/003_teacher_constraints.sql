-- Run in Supabase SQL Editor
-- Adds constraints to teachers table for data integrity

-- Unique email — prevents duplicate teacher accounts
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_email_unique UNIQUE (email);

-- Unique profile_id — ensures one teacher per auth user
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_profile_unique UNIQUE (profile_id);

-- Ensure email is not null for teachers who have auth accounts
-- (Existing rows with null email are left unchanged)
