
-- Create storage bucket for project files
INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', true);

-- Storage policies for project files
CREATE POLICY "Authenticated users can upload project files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-files');

CREATE POLICY "Anyone can view project files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'project-files');

CREATE POLICY "Users can delete own project files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add columns to projects for hosting
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS files jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS public_url text DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_status text DEFAULT 'pending';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_build_log text DEFAULT '';
