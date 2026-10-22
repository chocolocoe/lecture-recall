-- Reapply the complete, finalized override enforcement rules idempotently.
-- Allow explicitly granted capabilities to extend a member's classroom role,
-- while keeping each row and Storage object anchored to an authorized class.
-- Existing policies remain as role defaults; these policies add scoped grants.
UPDATE public.classroom_role_permissions SET allowed=false
WHERE role='student' AND permission_key IN ('contributions.edit','contributions.delete','attachments.upload','attachments.delete');

CREATE OR REPLACE FUNCTION private.has_permission_override(p_classroom_id uuid,p_permission_key text,p_resource_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=auth.uid() AND permission_key=p_permission_key AND resource_id=p_resource_id)
      THEN COALESCE((SELECT effect='allow' FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=auth.uid() AND permission_key=p_permission_key AND resource_id=p_resource_id LIMIT 1),false)
    WHEN EXISTS (SELECT 1 FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=auth.uid() AND permission_key=p_permission_key AND resource_id IS NULL)
      THEN COALESCE((SELECT effect='allow' FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=auth.uid() AND permission_key=p_permission_key AND resource_id IS NULL LIMIT 1),false)
    ELSE false END;
$function$;
REVOKE ALL ON FUNCTION private.has_permission_override(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.has_permission_override(uuid,text,uuid) TO authenticated;
ALTER FUNCTION private.has_permission_override(uuid,text,uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.has_effective_permission(p_classroom_id uuid,p_permission_key text,p_resource_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.has_permission(p_classroom_id,p_permission_key,p_resource_id)
$function$;
REVOKE ALL ON FUNCTION public.has_effective_permission(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_effective_permission(uuid,text,uuid) TO authenticated;
ALTER FUNCTION public.has_effective_permission(uuid,text,uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION private.guard_permission_contribution_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_classroom uuid;
BEGIN
  SELECT classroom_id INTO v_classroom FROM public.lessons WHERE id=OLD.lesson_id;
  IF private.has_classroom_role(v_classroom,ARRAY['admin']::public.user_role[]) THEN RETURN NEW; END IF;
  IF NEW.lesson_id IS DISTINCT FROM OLD.lesson_id OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
    RAISE EXCEPTION 'Contribution ownership and lesson cannot be reassigned.' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='approved' AND OLD.status='pending' AND OLD.submitted_by<>auth.uid()
      AND private.has_permission(v_classroom,'contributions.approve',OLD.id)
      AND NEW.reviewed_by=auth.uid() AND NEW.reviewed_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.status='rejected' AND OLD.status='pending' AND OLD.submitted_by<>auth.uid()
      AND private.has_permission(v_classroom,'contributions.reject',OLD.id)
      AND NEW.reviewed_by=auth.uid() AND NEW.reviewed_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.status='pending' AND OLD.submitted_by=auth.uid() AND OLD.status IN ('pending','rejected')
      AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'This permission does not allow the requested review transition.' USING ERRCODE='42501';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'Review metadata can only change with an authorized review.' USING ERRCODE='42501';
  END IF;
  IF OLD.submitted_by<>auth.uid() AND NOT private.has_permission(v_classroom,'contributions.edit',OLD.id) THEN
    RAISE EXCEPTION 'Edit permission is required for another member''s contribution.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_permission_contribution_update() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION private.guard_permission_contribution_update() OWNER TO postgres;
DROP TRIGGER IF EXISTS contributions_guard_permissions ON public.lesson_contributions;
CREATE TRIGGER contributions_guard_permissions BEFORE UPDATE ON public.lesson_contributions
  FOR EACH ROW EXECUTE FUNCTION private.guard_permission_contribution_update();

-- Resource-level overrides must be evaluated against the affected record.
DROP POLICY permission_gate_subjects_update ON public.subjects;
DROP POLICY permission_gate_subjects_select ON public.subjects;
DROP POLICY IF EXISTS permission_gate_subjects_select ON public.subjects; CREATE POLICY permission_gate_subjects_select ON public.subjects AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'subjects.view',id));
DROP POLICY IF EXISTS permission_gate_subjects_update ON public.subjects; CREATE POLICY permission_gate_subjects_update ON public.subjects AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'subjects.edit',id)) WITH CHECK (private.has_permission(classroom_id,'subjects.edit',id));
DROP POLICY permission_gate_subjects_delete ON public.subjects;
DROP POLICY IF EXISTS permission_gate_subjects_delete ON public.subjects; CREATE POLICY permission_gate_subjects_delete ON public.subjects AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'subjects.delete',id));
DROP POLICY permission_gate_lessons_update ON public.lessons;
DROP POLICY permission_gate_lessons_select ON public.lessons;
DROP POLICY IF EXISTS permission_gate_lessons_select ON public.lessons; CREATE POLICY permission_gate_lessons_select ON public.lessons AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'lessons.view',id));
DROP POLICY IF EXISTS permission_gate_lessons_update ON public.lessons; CREATE POLICY permission_gate_lessons_update ON public.lessons AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'lessons.edit',id)) WITH CHECK (private.has_permission(classroom_id,'lessons.edit',id));
DROP POLICY permission_gate_lessons_delete ON public.lessons;
DROP POLICY IF EXISTS permission_gate_lessons_delete ON public.lessons; CREATE POLICY permission_gate_lessons_delete ON public.lessons AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'lessons.delete',id));
DROP POLICY permission_gate_assignments_update ON public.assignments;
DROP POLICY permission_gate_assignments_select ON public.assignments;
DROP POLICY IF EXISTS permission_gate_assignments_select ON public.assignments; CREATE POLICY permission_gate_assignments_select ON public.assignments AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'assignments.view',id));
DROP POLICY IF EXISTS permission_gate_assignments_update ON public.assignments; CREATE POLICY permission_gate_assignments_update ON public.assignments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'assignments.edit',id) OR private.has_permission(classroom_id,'assignments.manage_deadlines',id)) WITH CHECK (private.has_permission(classroom_id,'assignments.edit',id) OR private.has_permission(classroom_id,'assignments.manage_deadlines',id));
DROP POLICY permission_gate_assignments_delete ON public.assignments;
DROP POLICY IF EXISTS permission_gate_assignments_delete ON public.assignments; CREATE POLICY permission_gate_assignments_delete ON public.assignments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'assignments.delete',id));
DROP POLICY permission_gate_contributions_select ON public.lesson_contributions;
DROP POLICY IF EXISTS permission_gate_contributions_select ON public.lesson_contributions; CREATE POLICY permission_gate_contributions_select ON public.lesson_contributions AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.view',id)));
DROP POLICY permission_gate_contributions_update ON public.lesson_contributions;
DROP POLICY IF EXISTS permission_gate_contributions_update ON public.lesson_contributions; CREATE POLICY permission_gate_contributions_update ON public.lesson_contributions AS RESTRICTIVE FOR UPDATE TO authenticated USING (
  (submitted_by=auth.uid() AND status IN ('pending','rejected')) OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
  (private.has_permission(l.classroom_id,'contributions.edit',id) OR private.has_permission(l.classroom_id,'contributions.review',id) OR private.has_permission(l.classroom_id,'contributions.approve',id) OR private.has_permission(l.classroom_id,'contributions.reject',id)))) WITH CHECK (
  (submitted_by=auth.uid() AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
  (private.has_permission(l.classroom_id,'contributions.edit',id) OR private.has_permission(l.classroom_id,'contributions.review',id) OR private.has_permission(l.classroom_id,'contributions.approve',id) OR private.has_permission(l.classroom_id,'contributions.reject',id))));
DROP POLICY permission_gate_contributions_delete ON public.lesson_contributions;
DROP POLICY IF EXISTS permission_gate_contributions_delete ON public.lesson_contributions; CREATE POLICY permission_gate_contributions_delete ON public.lesson_contributions AS RESTRICTIVE FOR DELETE TO authenticated USING (
  (submitted_by=auth.uid() AND status IN ('pending','rejected')) OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.delete',id)));
DROP POLICY permission_gate_attachment_select ON public.lesson_attachments;
DROP POLICY IF EXISTS permission_gate_attachment_select ON public.lesson_attachments; CREATE POLICY permission_gate_attachment_select ON public.lesson_attachments AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'attachments.view',lesson_id));
DROP POLICY permission_gate_attachment_insert ON public.lesson_attachments;
DROP POLICY IF EXISTS permission_gate_attachment_insert ON public.lesson_attachments; CREATE POLICY permission_gate_attachment_insert ON public.lesson_attachments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  private.has_permission(classroom_id,'attachments.upload',lesson_id) OR EXISTS (SELECT 1 FROM public.lesson_contributions c WHERE c.id=contribution_id AND c.lesson_id=lesson_id AND c.submitted_by=auth.uid() AND c.status IN ('pending','rejected')));
DROP POLICY permission_gate_attachment_update ON public.lesson_attachments;
DROP POLICY IF EXISTS permission_gate_attachment_update ON public.lesson_attachments; CREATE POLICY permission_gate_attachment_update ON public.lesson_attachments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'attachments.replace',id)) WITH CHECK (private.has_permission(classroom_id,'attachments.replace',id));
DROP POLICY permission_gate_attachment_delete ON public.lesson_attachments;
DROP POLICY IF EXISTS permission_gate_attachment_delete ON public.lesson_attachments; CREATE POLICY permission_gate_attachment_delete ON public.lesson_attachments AS RESTRICTIVE FOR DELETE TO authenticated USING (
  (uploaded_by=auth.uid() AND contribution_id IS NOT NULL AND NOT private.lesson_storage_object_exists(file_path) AND EXISTS (
    SELECT 1 FROM public.lesson_contributions c WHERE c.id=contribution_id AND c.lesson_id=lesson_id AND c.submitted_by=auth.uid() AND c.status IN ('pending','rejected')))
  OR private.has_permission(classroom_id,'attachments.delete',id));
DROP POLICY permission_gate_progress_select ON public.assignment_progress;
DROP POLICY IF EXISTS permission_gate_progress_select ON public.assignment_progress; CREATE POLICY permission_gate_progress_select ON public.assignment_progress AS RESTRICTIVE FOR SELECT TO authenticated USING (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_classroom',assignment_id));
DROP POLICY permission_gate_progress_insert ON public.assignment_progress;
DROP POLICY IF EXISTS permission_gate_progress_insert ON public.assignment_progress; CREATE POLICY permission_gate_progress_insert ON public.assignment_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.create',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id));
DROP POLICY permission_gate_progress_update ON public.assignment_progress;
DROP POLICY IF EXISTS permission_gate_progress_update ON public.assignment_progress; CREATE POLICY permission_gate_progress_update ON public.assignment_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id)) WITH CHECK (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id));
DROP POLICY permission_gate_progress_delete ON public.assignment_progress;
DROP POLICY IF EXISTS permission_gate_progress_delete ON public.assignment_progress; CREATE POLICY permission_gate_progress_delete ON public.assignment_progress AS RESTRICTIVE FOR DELETE TO authenticated USING (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id));

DROP POLICY permission_gate_storage_read ON storage.objects;
DROP POLICY IF EXISTS permission_gate_storage_read ON storage.objects; CREATE POLICY permission_gate_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id<>'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND private.has_permission(a.classroom_id,'attachments.view',a.lesson_id)));
DROP POLICY permission_gate_storage_insert ON storage.objects;
DROP POLICY IF EXISTS permission_gate_storage_insert ON storage.objects; CREATE POLICY permission_gate_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  bucket_id<>'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    (private.has_permission(a.classroom_id,'attachments.upload',a.lesson_id) OR (a.uploaded_by=auth.uid() AND a.contribution_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.lesson_contributions c WHERE c.id=a.contribution_id AND c.lesson_id=a.lesson_id AND c.submitted_by=auth.uid() AND c.status IN ('pending','rejected'))))));
DROP POLICY permission_gate_storage_delete ON storage.objects;
DROP POLICY IF EXISTS permission_gate_storage_delete ON storage.objects; CREATE POLICY permission_gate_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
  bucket_id<>'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    (private.has_permission(a.classroom_id,'attachments.delete',a.id) OR (a.uploaded_by=auth.uid() AND a.contribution_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.lesson_contributions c WHERE c.id=a.contribution_id AND c.lesson_id=a.lesson_id AND c.submitted_by=auth.uid() AND c.status IN ('pending','rejected'))))));
DROP POLICY lecture_recall_attachment_delete_guard ON storage.objects;
DROP POLICY IF EXISTS lecture_recall_attachment_delete_guard ON storage.objects; CREATE POLICY lecture_recall_attachment_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
  bucket_id<>'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    (private.has_permission(a.classroom_id,'attachments.delete',a.id) OR private.has_classroom_role(a.classroom_id,ARRAY['teacher','admin']::public.user_role[])
      OR (a.uploaded_by=auth.uid() AND a.contribution_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lesson_contributions c
        WHERE c.id=a.contribution_id AND c.lesson_id=a.lesson_id AND c.submitted_by=auth.uid() AND c.status IN ('pending','rejected'))))));

DROP POLICY IF EXISTS permission_grant_subject_insert ON public.subjects; CREATE POLICY permission_grant_subject_insert ON public.subjects FOR INSERT TO authenticated WITH CHECK (
  private.has_permission(classroom_id,'subjects.create')
);
DROP POLICY IF EXISTS permission_grant_subject_update ON public.subjects; CREATE POLICY permission_grant_subject_update ON public.subjects FOR UPDATE TO authenticated USING (
  private.has_permission(classroom_id,'subjects.edit',id)
) WITH CHECK (private.has_permission(classroom_id,'subjects.edit',id));
DROP POLICY IF EXISTS permission_grant_subject_delete ON public.subjects; CREATE POLICY permission_grant_subject_delete ON public.subjects FOR DELETE TO authenticated USING (
  private.has_permission(classroom_id,'subjects.delete',id)
);

DROP POLICY IF EXISTS permission_grant_lesson_insert ON public.lessons; CREATE POLICY permission_grant_lesson_insert ON public.lessons FOR INSERT TO authenticated WITH CHECK (
  created_by=auth.uid() AND private.has_permission(classroom_id,'lessons.create') AND
  EXISTS (SELECT 1 FROM public.subjects s WHERE s.id=lessons.subject_id AND s.classroom_id=lessons.classroom_id)
);
DROP POLICY IF EXISTS permission_grant_lesson_update ON public.lessons; CREATE POLICY permission_grant_lesson_update ON public.lessons FOR UPDATE TO authenticated USING (
  private.has_permission(classroom_id,'lessons.edit',id)
) WITH CHECK (private.has_permission(classroom_id,'lessons.edit',id));
DROP POLICY IF EXISTS permission_grant_lesson_delete ON public.lessons; CREATE POLICY permission_grant_lesson_delete ON public.lessons FOR DELETE TO authenticated USING (
  private.has_permission(classroom_id,'lessons.delete',id)
);

DROP POLICY IF EXISTS permission_grant_assignment_insert ON public.assignments; CREATE POLICY permission_grant_assignment_insert ON public.assignments FOR INSERT TO authenticated WITH CHECK (
  created_by=auth.uid() AND private.has_permission(classroom_id,'assignments.create')
);
DROP POLICY IF EXISTS permission_grant_assignment_update ON public.assignments; CREATE POLICY permission_grant_assignment_update ON public.assignments FOR UPDATE TO authenticated USING (
  private.has_permission(classroom_id,'assignments.edit',id) OR private.has_permission(classroom_id,'assignments.manage_deadlines',id)
) WITH CHECK (private.has_permission(classroom_id,'assignments.edit',id) OR private.has_permission(classroom_id,'assignments.manage_deadlines',id));
DROP POLICY IF EXISTS permission_grant_assignment_delete ON public.assignments; CREATE POLICY permission_grant_assignment_delete ON public.assignments FOR DELETE TO authenticated USING (
  private.has_permission(classroom_id,'assignments.delete',id)
);

DROP POLICY IF EXISTS permission_grant_contribution_select ON public.lesson_contributions; CREATE POLICY permission_grant_contribution_select ON public.lesson_contributions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.view',id)) AND
  (submitted_by=auth.uid() OR status='approved' OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_classroom_role(l.classroom_id,ARRAY['teacher','admin']::public.user_role[])) OR
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission_override(l.classroom_id,'contributions.view',id)))
);
DROP POLICY IF EXISTS permission_grant_contribution_insert ON public.lesson_contributions; CREATE POLICY permission_grant_contribution_insert ON public.lesson_contributions FOR INSERT TO authenticated WITH CHECK (
  submitted_by=auth.uid() AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.create',lesson_id))
);
DROP POLICY IF EXISTS permission_grant_contribution_update ON public.lesson_contributions; CREATE POLICY permission_grant_contribution_update ON public.lesson_contributions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
    (private.has_permission(l.classroom_id,'contributions.edit',id) OR private.has_permission(l.classroom_id,'contributions.review',id) OR private.has_permission(l.classroom_id,'contributions.approve',id) OR private.has_permission(l.classroom_id,'contributions.reject',id)))
) WITH CHECK (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
    (private.has_permission(l.classroom_id,'contributions.edit',id) OR private.has_permission(l.classroom_id,'contributions.review',id) OR private.has_permission(l.classroom_id,'contributions.approve',id) OR private.has_permission(l.classroom_id,'contributions.reject',id))));
DROP POLICY IF EXISTS permission_grant_contribution_delete ON public.lesson_contributions; CREATE POLICY permission_grant_contribution_delete ON public.lesson_contributions FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.delete',id))
);

DROP POLICY IF EXISTS permission_grant_progress_select ON public.assignment_progress; CREATE POLICY permission_grant_progress_select ON public.assignment_progress FOR SELECT TO authenticated USING (
  user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_own',assignment_id)
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_classroom',assignment_id)
);
DROP POLICY IF EXISTS permission_grant_progress_insert ON public.assignment_progress; CREATE POLICY permission_grant_progress_insert ON public.assignment_progress FOR INSERT TO authenticated WITH CHECK (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.create',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id)
);
DROP POLICY IF EXISTS permission_grant_progress_update ON public.assignment_progress; CREATE POLICY permission_grant_progress_update ON public.assignment_progress FOR UPDATE TO authenticated USING (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id)
) WITH CHECK (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id)
);
DROP POLICY IF EXISTS permission_grant_progress_delete ON public.assignment_progress; CREATE POLICY permission_grant_progress_delete ON public.assignment_progress FOR DELETE TO authenticated USING (
  (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own',assignment_id))
  OR private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage',assignment_id)
);

DROP POLICY IF EXISTS permission_grant_attachment_read ON public.lesson_attachments; CREATE POLICY permission_grant_attachment_read ON public.lesson_attachments FOR SELECT TO authenticated USING (
  private.has_permission(classroom_id,'attachments.view',lesson_id) AND (contribution_id IS NULL OR uploaded_by=auth.uid() OR
    EXISTS (SELECT 1 FROM public.lesson_contributions c WHERE c.id=contribution_id AND c.lesson_id=lesson_id AND c.status='approved') OR
    private.has_permission_override(classroom_id,'attachments.view',lesson_id))
);
DROP POLICY IF EXISTS permission_grant_attachment_insert ON public.lesson_attachments; CREATE POLICY permission_grant_attachment_insert ON public.lesson_attachments FOR INSERT TO authenticated WITH CHECK (
  uploaded_by=auth.uid() AND file_path=classroom_id::text||'/'||lesson_id::text||'/'||id::text AND
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_attachments.lesson_id AND l.classroom_id=lesson_attachments.classroom_id) AND
  private.has_permission(classroom_id,'attachments.upload',lesson_id) AND
  (contribution_id IS NULL OR EXISTS (SELECT 1 FROM public.lesson_contributions c WHERE c.id=contribution_id AND c.lesson_id=lesson_id))
);
DROP POLICY IF EXISTS permission_grant_attachment_delete ON public.lesson_attachments; CREATE POLICY permission_grant_attachment_delete ON public.lesson_attachments FOR DELETE TO authenticated USING (
  NOT private.lesson_storage_object_exists(file_path) AND private.has_permission(classroom_id,'attachments.delete',id)
);
DROP POLICY IF EXISTS permission_grant_storage_read ON storage.objects; CREATE POLICY permission_grant_storage_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='lesson-attachments' AND EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    private.has_permission(a.classroom_id,'attachments.view',a.lesson_id) AND (a.contribution_id IS NULL OR a.uploaded_by=auth.uid() OR
      EXISTS (SELECT 1 FROM public.lesson_contributions c WHERE c.id=a.contribution_id AND c.lesson_id=a.lesson_id AND c.status='approved') OR
      private.has_permission_override(a.classroom_id,'attachments.view',a.lesson_id)))
);
DROP POLICY IF EXISTS permission_grant_storage_insert ON storage.objects; CREATE POLICY permission_grant_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='lesson-attachments' AND EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    a.uploaded_by=auth.uid() AND private.has_permission(a.classroom_id,'attachments.upload',a.lesson_id))
);
DROP POLICY IF EXISTS permission_grant_storage_delete ON storage.objects; CREATE POLICY permission_grant_storage_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='lesson-attachments' AND EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND
    private.has_permission(a.classroom_id,'attachments.delete',a.id))
);

-- Deletion RPCs use the same effective permission and exact resource grant.
CREATE OR REPLACE FUNCTION public.delete_academic_item(p_kind text, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE target_classroom uuid; target_lesson uuid; required_permission text;
BEGIN
  IF p_kind='subject' THEN SELECT classroom_id INTO target_classroom FROM public.subjects WHERE id=p_id; required_permission:='subjects.delete';
  ELSIF p_kind='lesson' THEN SELECT classroom_id INTO target_classroom FROM public.lessons WHERE id=p_id; required_permission:='lessons.delete';
  ELSIF p_kind='assignment' THEN SELECT classroom_id INTO target_classroom FROM public.assignments WHERE id=p_id; required_permission:='assignments.delete';
  ELSIF p_kind='contribution' THEN SELECT lesson_id INTO target_lesson FROM public.lesson_contributions WHERE id=p_id; SELECT classroom_id INTO target_classroom FROM public.lessons WHERE id=target_lesson; required_permission:='contributions.delete';
  ELSE RAISE EXCEPTION 'Unsupported academic item.' USING ERRCODE='22023'; END IF;
  IF target_classroom IS NULL THEN RAISE EXCEPTION 'Academic item not found.' USING ERRCODE='P0002'; END IF;
  IF NOT private.has_permission(target_classroom,required_permission,p_id) THEN RAISE EXCEPTION 'Permission denied for this academic item.' USING ERRCODE='42501'; END IF;
  IF (p_kind='subject' AND EXISTS (SELECT 1 FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.subject_id=p_id AND private.lesson_storage_object_exists(a.file_path)))
    OR (p_kind='lesson' AND EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.lesson_id=p_id AND private.lesson_storage_object_exists(a.file_path)))
    OR (p_kind='contribution' AND EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.contribution_id=p_id AND private.lesson_storage_object_exists(a.file_path))) THEN
    RAISE EXCEPTION 'Remove lesson attachment files from private Storage before deleting this item.' USING ERRCODE='23514';
  END IF;
  IF p_kind='subject' THEN
    DELETE FROM public.lesson_attachments a USING public.lessons l WHERE a.lesson_id=l.id AND l.subject_id=p_id;
    DELETE FROM public.lesson_contributions c USING public.lessons l WHERE c.lesson_id=l.id AND l.subject_id=p_id;
    DELETE FROM public.lessons WHERE subject_id=p_id; DELETE FROM public.subjects WHERE id=p_id;
  ELSIF p_kind='lesson' THEN DELETE FROM public.lesson_attachments WHERE lesson_id=p_id; DELETE FROM public.lesson_contributions WHERE lesson_id=p_id; DELETE FROM public.lessons WHERE id=p_id;
  ELSIF p_kind='contribution' THEN DELETE FROM public.lesson_attachments WHERE contribution_id=p_id; DELETE FROM public.lesson_contributions WHERE id=p_id;
  ELSE DELETE FROM public.assignments WHERE id=p_id; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_academic_item(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_academic_item(text,uuid) TO authenticated;
ALTER FUNCTION public.delete_academic_item(text,uuid) OWNER TO postgres;

