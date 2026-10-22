-- Typed, classroom-scoped permission registry and user overrides.
-- Existing role policies remain the outer boundary; restrictive policies
-- below make explicit denies effective across every existing permissive rule.
CREATE TABLE public.permission_registry (
  permission_key text PRIMARY KEY CHECK (permission_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  category text NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false
);

INSERT INTO public.permission_registry (permission_key, category, label, description, sensitive) VALUES
('subjects.view','Subjects','View subjects','Read classroom subjects',false),
('subjects.create','Subjects','Create subjects','Create classroom subjects',false),
('subjects.edit','Subjects','Edit subjects','Edit classroom subjects',false),
('subjects.delete','Subjects','Delete subjects','Delete subjects and dependent academic content',true),
('lessons.view','Lessons','View lessons','Read classroom lessons',false),
('lessons.create','Lessons','Create lessons','Create lessons',false),
('lessons.edit','Lessons','Edit lessons','Edit lessons',false),
('lessons.delete','Lessons','Delete lessons','Delete lessons and dependent records',true),
('lessons.publish','Lessons','Publish lessons','Publish and unpublish lessons',true),
('contributions.view','Notes','View contributions','Read notes permitted by note visibility rules',false),
('contributions.create','Notes','Submit contributions','Submit a student note for review',false),
('contributions.edit','Notes','Edit contributions','Edit permitted own note content',false),
('contributions.delete','Notes','Delete contributions','Delete contributions and their metadata',true),
('contributions.review','Notes','Review contributions','Review notes submitted by other members',true),
('contributions.approve','Notes','Approve contributions','Approve notes submitted by other members',true),
('contributions.reject','Notes','Reject contributions','Reject notes submitted by other members',true),
('attachments.view','Attachments','View attachments','Read attachments permitted by resource visibility',false),
('attachments.upload','Attachments','Upload attachments','Upload files to permitted classroom resources',false),
('attachments.replace','Attachments','Replace attachments','Replace attachments on permitted resources',false),
('attachments.delete','Attachments','Delete attachments','Delete attachment files and metadata',true),
('assignments.view','Assignments','View assignments','Read classroom assignments',false),
('assignments.create','Assignments','Create assignments','Create assignments',false),
('assignments.edit','Assignments','Edit assignments','Edit assignments and deadlines',false),
('assignments.delete','Assignments','Delete assignments','Delete assignments and progress',true),
('assignments.manage_deadlines','Assignments','Manage deadlines','Change assignment due dates',false),
('progress.view_own','Submissions','View own progress','Read own assignment progress',false),
('progress.view_classroom','Submissions','View classroom progress','Read student assignment submissions',false),
('progress.create','Submissions','Submit progress','Create assignment responses',false),
('progress.edit_own','Submissions','Edit own progress','Edit own assignment responses',false),
('progress.manage','Submissions','Manage progress','Manage student progress records',true),
('members.view','Members','View members','View classroom directory',false),
('members.create','Members','Create members','Create classroom accounts',true),
('members.edit','Members','Edit members','Edit member profile details',true),
('members.delete','Members','Delete members','Delete classroom accounts',true),
('members.change_roles','Members','Change roles','Change member roles',true),
('members.reset_passwords','Members','Reset passwords','Set a member temporary password',true),
('classroom.view','Classroom','View classroom','View classroom details',false),
('classroom.manage_settings','Classroom','Manage settings','Edit classroom settings',true),
('permissions.view','Permissions','View permissions','View assigned and effective permissions',true),
('permissions.grant','Permissions','Grant permissions','Grant individual permissions to members',true),
('permissions.revoke','Permissions','Revoke permissions','Revoke individual permission overrides',true),
('permissions.manage_templates','Permissions','Manage templates','Manage role permission templates',true);

CREATE TABLE public.classroom_role_permissions (
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permission_registry(permission_key) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  PRIMARY KEY (classroom_id, role, permission_key)
);

CREATE TABLE public.member_permission_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classroom_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES public.permission_registry(permission_key) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  resource_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  FOREIGN KEY (user_id) REFERENCES public.memberships(user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX member_permission_overrides_scope_key ON public.member_permission_overrides
  (classroom_id, user_id, permission_key, COALESCE(resource_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE public.permission_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  permission_key text NOT NULL REFERENCES public.permission_registry(permission_key),
  resource_id uuid,
  old_effect text,
  new_effect text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_registry_read_authenticated ON public.permission_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY classroom_permission_read_admin ON public.classroom_role_permissions FOR SELECT TO authenticated USING (private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[]));
CREATE POLICY member_override_read_admin ON public.member_permission_overrides FOR SELECT TO authenticated USING (private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[]));
CREATE POLICY permission_audit_read_admin ON public.permission_audit_log FOR SELECT TO authenticated USING (private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[]));
REVOKE INSERT, UPDATE, DELETE ON public.permission_registry, public.classroom_role_permissions, public.member_permission_overrides, public.permission_audit_log FROM anon, authenticated;
GRANT SELECT ON public.permission_registry TO authenticated;
GRANT SELECT ON public.classroom_role_permissions, public.member_permission_overrides, public.permission_audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.permission_audit_log_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION private.has_permission(p_classroom_id uuid, p_permission_key text, p_resource_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user uuid := auth.uid(); v_role public.user_role; v_result boolean;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.permission_registry WHERE permission_key = p_permission_key) THEN RETURN false; END IF;
  SELECT role INTO v_role FROM public.memberships WHERE classroom_id = p_classroom_id AND user_id = v_user;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  -- Specific resource overrides precede classroom overrides; deny wins at a
  -- matching scope. Role defaults apply only when no override is present.
  SELECT (effect = 'allow') INTO v_result FROM public.member_permission_overrides
    WHERE classroom_id = p_classroom_id AND user_id = v_user AND permission_key = p_permission_key
      AND resource_id = p_resource_id ORDER BY updated_at DESC LIMIT 1;
  IF FOUND THEN RETURN COALESCE(v_result, false); END IF;
  SELECT (effect = 'allow') INTO v_result FROM public.member_permission_overrides
    WHERE classroom_id = p_classroom_id AND user_id = v_user AND permission_key = p_permission_key
      AND resource_id IS NULL ORDER BY updated_at DESC LIMIT 1;
  IF FOUND THEN RETURN COALESCE(v_result, false); END IF;
  SELECT allowed INTO v_result FROM public.classroom_role_permissions
    WHERE classroom_id = p_classroom_id AND role = v_role AND permission_key = p_permission_key;
  RETURN COALESCE(v_result, false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION private.has_permission(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid,text,uuid) TO authenticated;
ALTER FUNCTION private.has_permission(uuid,text,uuid) OWNER TO postgres;

-- Defaults reproduce the current role boundaries while making them explicit.
INSERT INTO public.classroom_role_permissions (classroom_id, role, permission_key, allowed)
SELECT c.id, r.role, p.permission_key,
  CASE
    WHEN r.role='admin' THEN true
    WHEN r.role='teacher' THEN p.permission_key NOT IN ('members.create','members.edit','members.delete','members.change_roles','members.reset_passwords','classroom.manage_settings','permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates')
    WHEN r.role='student' THEN p.permission_key IN ('subjects.view','lessons.view','contributions.view','contributions.create','contributions.edit','contributions.delete','attachments.view','attachments.upload','attachments.delete','assignments.view','progress.view_own','progress.create','progress.edit_own','members.view','classroom.view')
    ELSE false
  END
FROM public.classrooms c CROSS JOIN (VALUES ('admin'::public.user_role),('teacher'::public.user_role),('student'::public.user_role)) r(role)
CROSS JOIN public.permission_registry p;

CREATE OR REPLACE FUNCTION private.seed_classroom_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  INSERT INTO public.classroom_role_permissions(classroom_id,role,permission_key,allowed)
  SELECT NEW.id,r.role,p.permission_key,
    CASE WHEN r.role='admin' THEN true
      WHEN r.role='teacher' THEN p.permission_key NOT IN ('members.create','members.edit','members.delete','members.change_roles','members.reset_passwords','classroom.manage_settings','permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates')
      WHEN r.role='student' THEN p.permission_key IN ('subjects.view','lessons.view','contributions.view','contributions.create','contributions.edit','contributions.delete','attachments.view','attachments.upload','attachments.delete','assignments.view','progress.view_own','progress.create','progress.edit_own','members.view','classroom.view')
      ELSE false END
  FROM (VALUES ('admin'::public.user_role),('teacher'::public.user_role),('student'::public.user_role)) r(role)
  CROSS JOIN public.permission_registry p;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER classrooms_seed_permissions AFTER INSERT ON public.classrooms FOR EACH ROW EXECUTE FUNCTION private.seed_classroom_permissions();
ALTER FUNCTION private.seed_classroom_permissions() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.save_member_permissions(p_classroom_id uuid, p_user_id uuid, p_overrides jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_actor uuid := auth.uid(); v_item jsonb; v_key text; v_effect text; v_resource uuid; v_old text; v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL OR NOT private.has_classroom_role(p_classroom_id, ARRAY['admin']::public.user_role[]) THEN RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501'; END IF;
  IF p_user_id = v_actor THEN RAISE EXCEPTION 'You cannot change your own permission overrides.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE classroom_id=p_classroom_id AND user_id=p_user_id AND role <> 'admin') THEN RAISE EXCEPTION 'Target must be a non-administrator member of this classroom.' USING ERRCODE='23503'; END IF;
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'array' OR jsonb_array_length(p_overrides) > 128 THEN RAISE EXCEPTION 'Invalid permission override list.' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('permission',permission_key,'effect',effect,'resourceId',resource_id)), '[]'::jsonb)
    INTO v_snapshot FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=p_user_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_snapshot) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_overrides) candidate WHERE candidate->>'permission'=v_item->>'permission' AND NULLIF(candidate->>'resourceId','')::uuid IS NOT DISTINCT FROM NULLIF(v_item->>'resourceId','')::uuid) THEN
      INSERT INTO public.permission_audit_log(classroom_id,actor_id,target_user_id,permission_key,resource_id,old_effect,new_effect)
      VALUES(p_classroom_id,v_actor,p_user_id,v_item->>'permission',NULLIF(v_item->>'resourceId','')::uuid,v_item->>'effect',NULL);
    END IF;
  END LOOP;
  DELETE FROM public.member_permission_overrides WHERE classroom_id=p_classroom_id AND user_id=p_user_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_overrides) LOOP
    v_key := v_item->>'permission'; v_effect := v_item->>'effect'; v_resource := NULLIF(v_item->>'resourceId','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.permission_registry WHERE permission_key=v_key) OR v_effect NOT IN ('allow','deny') THEN RAISE EXCEPTION 'Unknown permission or effect.' USING ERRCODE='22023'; END IF;
    IF v_key IN ('permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates','members.change_roles') AND v_effect='allow' THEN RAISE EXCEPTION 'This administrative permission cannot be delegated.' USING ERRCODE='42501'; END IF;
    v_old := NULL;
    SELECT item->>'effect' INTO v_old FROM jsonb_array_elements(v_snapshot) item
      WHERE item->>'permission'=v_key AND NULLIF(item->>'resourceId','')::uuid IS NOT DISTINCT FROM v_resource LIMIT 1;
    INSERT INTO public.member_permission_overrides(classroom_id,user_id,permission_key,effect,resource_id,updated_by)
    VALUES(p_classroom_id,p_user_id,v_key,v_effect,v_resource,v_actor);
    INSERT INTO public.permission_audit_log(classroom_id,actor_id,target_user_id,permission_key,resource_id,old_effect,new_effect)
    VALUES(p_classroom_id,v_actor,p_user_id,v_key,v_resource,v_old,v_effect);
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_member_permissions(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_member_permissions(uuid,uuid,jsonb) TO authenticated;
ALTER FUNCTION public.save_member_permissions(uuid,uuid,jsonb) OWNER TO postgres;

-- Denials are restrictive, so legacy permissive role policies cannot bypass
-- them. Adds an upper bound for all established table operations.
CREATE POLICY permission_gate_subjects_select ON public.subjects AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'subjects.view'));
CREATE POLICY permission_gate_subjects_insert ON public.subjects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.has_permission(classroom_id,'subjects.create'));
CREATE POLICY permission_gate_subjects_update ON public.subjects AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'subjects.edit')) WITH CHECK (private.has_permission(classroom_id,'subjects.edit'));
CREATE POLICY permission_gate_subjects_delete ON public.subjects AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'subjects.delete'));
CREATE POLICY permission_gate_lessons_select ON public.lessons AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'lessons.view'));
CREATE POLICY permission_gate_lessons_insert ON public.lessons AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.has_permission(classroom_id,'lessons.create'));
CREATE POLICY permission_gate_lessons_update ON public.lessons AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'lessons.edit')) WITH CHECK (private.has_permission(classroom_id,'lessons.edit'));
CREATE POLICY permission_gate_lessons_delete ON public.lessons AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'lessons.delete'));
CREATE POLICY permission_gate_assignments_select ON public.assignments AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'assignments.view'));
CREATE POLICY permission_gate_assignments_insert ON public.assignments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.has_permission(classroom_id,'assignments.create'));
CREATE POLICY permission_gate_assignments_update ON public.assignments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'assignments.edit') OR private.has_permission(classroom_id,'assignments.manage_deadlines')) WITH CHECK (private.has_permission(classroom_id,'assignments.edit') OR private.has_permission(classroom_id,'assignments.manage_deadlines'));
CREATE POLICY permission_gate_assignments_delete ON public.assignments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'assignments.delete'));
CREATE POLICY permission_gate_classroom_select ON public.classrooms AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(id,'classroom.view'));
CREATE POLICY permission_gate_classroom_update ON public.classrooms AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(id,'classroom.manage_settings')) WITH CHECK (private.has_permission(id,'classroom.manage_settings'));
CREATE POLICY permission_gate_contributions_select ON public.lesson_contributions AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.view')));
CREATE POLICY permission_gate_contributions_insert ON public.lesson_contributions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.create')));
CREATE POLICY permission_gate_contributions_update ON public.lesson_contributions AS RESTRICTIVE FOR UPDATE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND (private.has_permission(l.classroom_id,'contributions.edit') OR private.has_permission(l.classroom_id,'contributions.review')))) WITH CHECK (
 EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND (private.has_permission(l.classroom_id,'contributions.edit') OR private.has_permission(l.classroom_id,'contributions.review'))));
CREATE POLICY permission_gate_contributions_delete ON public.lesson_contributions AS RESTRICTIVE FOR DELETE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND private.has_permission(l.classroom_id,'contributions.delete')));
CREATE POLICY permission_gate_attachment_select ON public.lesson_attachments AS RESTRICTIVE FOR SELECT TO authenticated USING (private.has_permission(classroom_id,'attachments.view'));
CREATE POLICY permission_gate_attachment_insert ON public.lesson_attachments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.has_permission(classroom_id,'attachments.upload'));
CREATE POLICY permission_gate_attachment_update ON public.lesson_attachments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.has_permission(classroom_id,'attachments.replace')) WITH CHECK (private.has_permission(classroom_id,'attachments.replace'));
CREATE POLICY permission_gate_attachment_delete ON public.lesson_attachments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.has_permission(classroom_id,'attachments.delete'));
CREATE POLICY permission_gate_progress_select ON public.assignment_progress AS RESTRICTIVE FOR SELECT TO authenticated USING (
 user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_own') OR
 private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.view_classroom'));
CREATE POLICY permission_gate_progress_insert ON public.assignment_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.create'));
CREATE POLICY permission_gate_progress_update ON public.assignment_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING (
 (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own')) OR
 private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage')) WITH CHECK (
 (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own')) OR
 private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage'));
CREATE POLICY permission_gate_progress_delete ON public.assignment_progress AS RESTRICTIVE FOR DELETE TO authenticated USING (
 (user_id=auth.uid() AND private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.edit_own')) OR
 private.has_permission((SELECT a.classroom_id FROM public.assignments a WHERE a.id=assignment_id),'progress.manage'));

-- Storage has independent RLS. Keep object-path/metadata matching guards and
-- require the same effective permission for private content operations.
CREATE POLICY permission_gate_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
 bucket_id <> 'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND private.has_permission(a.classroom_id,'attachments.view')));
CREATE POLICY permission_gate_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 bucket_id <> 'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND a.uploaded_by=auth.uid() AND private.has_permission(a.classroom_id,'attachments.upload')));
CREATE POLICY permission_gate_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
 bucket_id <> 'lesson-attachments' OR EXISTS (SELECT 1 FROM public.lesson_attachments a WHERE a.file_path=name AND private.has_permission(a.classroom_id,'attachments.delete')));

