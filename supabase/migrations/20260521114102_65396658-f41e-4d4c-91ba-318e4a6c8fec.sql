
-- Add CNH category and expiration to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cnh_category text,
  ADD COLUMN IF NOT EXISTS cnh_expires_at date,
  ADD COLUMN IF NOT EXISTS cnh_file_url text;

-- Create driver-docs bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-docs', 'driver-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for driver-docs
-- Admins can do everything; drivers can read/upload their own folder (folder = user id)
DROP POLICY IF EXISTS "driver-docs admin all" ON storage.objects;
CREATE POLICY "driver-docs admin all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'driver-docs' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'driver-docs' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "driver-docs own read" ON storage.objects;
CREATE POLICY "driver-docs own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "driver-docs own upload" ON storage.objects;
CREATE POLICY "driver-docs own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
