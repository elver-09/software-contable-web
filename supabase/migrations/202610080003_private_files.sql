INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('ansorito-files','ansorito-files',false,52428800)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='ansorito-files' AND public) THEN
  RAISE EXCEPTION 'Ansorito requires a private storage bucket';
 END IF;
END $$;
CREATE POLICY ansorito_private_files ON storage.objects FOR ALL TO authenticated
USING(bucket_id='ansorito-files' AND (storage.foldername(name))[1]=auth.uid()::text
 AND ((storage.foldername(name))[2]='global' OR EXISTS
 (SELECT 1 FROM ansorito.empresas e WHERE e.id::text=(storage.foldername(name))[2] AND e.owner_id=auth.uid())))
WITH CHECK(bucket_id='ansorito-files' AND (storage.foldername(name))[1]=auth.uid()::text
 AND ((storage.foldername(name))[2]='global' OR EXISTS
 (SELECT 1 FROM ansorito.empresas e WHERE e.id::text=(storage.foldername(name))[2] AND e.owner_id=auth.uid())));
