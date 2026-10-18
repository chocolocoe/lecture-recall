-- Private lesson attachments. The object key is deliberately opaque and
-- nested as {classroom UUID}/{lesson UUID}/{attachment UUID}.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'lesson-attachments',
  'lesson-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lecture_recall_attachment_read ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_insert ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_delete ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_read_guard ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_insert_guard ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_update_guard ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_delete_guard ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_anon_deny ON storage.objects;

-- A Storage object is readable only when its exact path has a visible metadata
-- row. The metadata RLS policy limits that row to classroom members and hides
-- another student's pending contribution file.
CREATE POLICY lecture_recall_attachment_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND attachment.classroom_id::text = pg_catalog.split_part(storage.objects.name, '/', 1)
        AND attachment.lesson_id::text = pg_catalog.split_part(storage.objects.name, '/', 2)
        AND attachment.id::text = pg_catalog.split_part(storage.objects.name, '/', 3)
    )
  );

-- Require a pre-authorized metadata row before bytes can be uploaded. This
-- binds the uploaded path to the classroom, lesson, attachment id and uploader.
CREATE POLICY lecture_recall_attachment_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND attachment.uploaded_by = (SELECT auth.uid())
        AND attachment.classroom_id::text = pg_catalog.split_part(storage.objects.name, '/', 1)
        AND attachment.lesson_id::text = pg_catalog.split_part(storage.objects.name, '/', 2)
        AND attachment.id::text = pg_catalog.split_part(storage.objects.name, '/', 3)
    )
  );

-- No overwrite/update policy is granted. Staff must delete the object through
-- Storage before deleting its metadata or its parent lesson.
CREATE POLICY lecture_recall_attachment_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND private.has_classroom_role(attachment.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  );

-- Restrictive guards ensure a pre-existing permissive Storage policy for some
-- other bucket cannot accidentally widen access to this bucket. PostgreSQL
-- combines permissive policies with OR and restrictive policies with AND.
CREATE POLICY lecture_recall_attachment_read_guard
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'lesson-attachments'
    OR EXISTS (
      SELECT 1 FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND attachment.classroom_id::text = pg_catalog.split_part(storage.objects.name, '/', 1)
        AND attachment.lesson_id::text = pg_catalog.split_part(storage.objects.name, '/', 2)
        AND attachment.id::text = pg_catalog.split_part(storage.objects.name, '/', 3)
    )
  );
CREATE POLICY lecture_recall_attachment_insert_guard
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'lesson-attachments'
    OR EXISTS (
      SELECT 1 FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND attachment.uploaded_by = (SELECT auth.uid())
        AND attachment.classroom_id::text = pg_catalog.split_part(storage.objects.name, '/', 1)
        AND attachment.lesson_id::text = pg_catalog.split_part(storage.objects.name, '/', 2)
        AND attachment.id::text = pg_catalog.split_part(storage.objects.name, '/', 3)
    )
  );
CREATE POLICY lecture_recall_attachment_update_guard
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'lesson-attachments')
  WITH CHECK (bucket_id <> 'lesson-attachments');
CREATE POLICY lecture_recall_attachment_delete_guard
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'lesson-attachments'
    OR EXISTS (
      SELECT 1 FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND private.has_classroom_role(attachment.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  );
CREATE POLICY lecture_recall_attachment_anon_deny
  ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'lesson-attachments')
  WITH CHECK (bucket_id <> 'lesson-attachments');

COMMENT ON POLICY lecture_recall_attachment_read ON storage.objects IS
  'Private lesson files require a matching, RLS-visible metadata row for the current classroom member.';
