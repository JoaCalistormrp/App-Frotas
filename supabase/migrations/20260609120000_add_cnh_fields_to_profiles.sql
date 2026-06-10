-- Add missing CNH columns to profiles for new database migrations
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cnh_category text,
  ADD COLUMN IF NOT EXISTS cnh_expires_at date,
  ADD COLUMN IF NOT EXISTS cnh_file_url text;
