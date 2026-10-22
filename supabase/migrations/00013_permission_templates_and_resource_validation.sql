-- Validate all record-scoped overrides against the selected classroom.
CREATE OR REPLACE FUNCTION private.validate_member_permission_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_classroom uuid; v_key text := NEW.permission_key;
BEGIN
  IF NEW.resource_id IS NULL THEN RETURN NEW; END IF;
  IF v_key LIKE 'subjects.%' THEN SELECT classroom_id INTO v_classroom FROM public.subjects WHERE id=NEW.resource_id;
  ELSIF v_key LIKE 'lessons.%' OR (v_key='contributions.create') THEN SELECT classroom_id INTO v_classroom FROM public.lessons WHERE id=NEW.resource_id;
  ELSIF v_key LIKE 'contributions.%' THEN SELECT l.classroom_id INTO v_classroom FROM public.lesson_contributions c JOIN public.lessons l ON l.id=c.lesson_id WHERE c.id=NEW.resource_id;
  ELSIF v_key IN ('attachments.view','attachments.upload') THEN SELECT classroom_id INTO v_classroom FROM public.lessons WHERE id=NEW.resource_id;
  ELSIF v_key LIKE 'attachments.%' THEN SELECT classroom_id INTO v_classroom FROM public.lesson_attachments WHERE id=NEW.resource_id;
  ELSIF v_key LIKE 'assignments.%' OR v_key LIKE 'progress.%' THEN SELECT classroom_id INTO v_classroom FROM public.assignments WHERE id=NEW.resource_id;
  ELSE RAISE EXCEPTION 'This permission does not support record-scoped overrides.' USING ERRCODE='22023';
  END IF;
  IF v_classroom IS DISTINCT FROM NEW.classroom_id THEN RAISE EXCEPTION 'Permission scope must reference a record in the target classroom.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_member_permission_scope() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION private.validate_member_permission_scope() OWNER TO postgres;
DROP TRIGGER IF EXISTS member_permission_scope_guard ON public.member_permission_overrides;
CREATE TRIGGER member_permission_scope_guard BEFORE INSERT OR UPDATE ON public.member_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION private.validate_member_permission_scope();

CREATE OR REPLACE FUNCTION private.guard_non_delegable_permissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.effect='allow' AND NEW.permission_key IN (
    'members.create','members.edit','members.delete','members.change_roles','members.reset_passwords',
    'classroom.manage_settings','permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates'
  ) THEN RAISE EXCEPTION 'This administrative permission cannot be delegated.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_non_delegable_permissions() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION private.guard_non_delegable_permissions() OWNER TO postgres;
DROP TRIGGER IF EXISTS member_permission_delegation_guard ON public.member_permission_overrides;
CREATE TRIGGER member_permission_delegation_guard BEFORE INSERT OR UPDATE ON public.member_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION private.guard_non_delegable_permissions();

CREATE OR REPLACE FUNCTION public.save_role_permission_template(p_classroom_id uuid,p_role public.user_role,p_permissions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_actor uuid := auth.uid(); v_item jsonb; v_key text; v_allowed boolean; v_old boolean;
BEGIN
  IF v_actor IS NULL OR NOT private.has_classroom_role(p_classroom_id,ARRAY['admin']::public.user_role[]) THEN RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501'; END IF;
  IF p_role NOT IN ('teacher','student') THEN RAISE EXCEPTION 'Administrator defaults cannot be modified.' USING ERRCODE='42501'; END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions)<>'array' OR jsonb_array_length(p_permissions)>128 THEN RAISE EXCEPTION 'Invalid template.' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_permissions) LOOP
    v_key:=v_item->>'permission'; v_allowed:=(v_item->>'allowed')::boolean;
    IF NOT EXISTS (SELECT 1 FROM public.permission_registry WHERE permission_key=v_key) THEN RAISE EXCEPTION 'Unknown permission.' USING ERRCODE='22023'; END IF;
    IF v_key IN ('members.create','members.edit','members.delete','members.change_roles','members.reset_passwords','classroom.manage_settings','permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates') AND v_allowed THEN
      RAISE EXCEPTION 'Administrator-only permissions cannot be placed in a role template.' USING ERRCODE='42501';
    END IF;
    SELECT allowed INTO v_old FROM public.classroom_role_permissions WHERE classroom_id=p_classroom_id AND role=p_role AND permission_key=v_key;
    INSERT INTO public.classroom_role_permissions(classroom_id,role,permission_key,allowed) VALUES(p_classroom_id,p_role,v_key,v_allowed)
      ON CONFLICT (classroom_id,role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed;
    IF v_old IS DISTINCT FROM v_allowed THEN
      INSERT INTO public.permission_audit_log(classroom_id,actor_id,target_user_id,permission_key,old_effect,new_effect)
      SELECT p_classroom_id,v_actor,m.user_id,v_key,CASE WHEN v_old THEN 'allow' ELSE 'deny' END,CASE WHEN v_allowed THEN 'allow' ELSE 'deny' END
      FROM public.memberships m WHERE m.classroom_id=p_classroom_id AND m.role=p_role;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_role_permission_template(uuid,public.user_role,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_role_permission_template(uuid,public.user_role,jsonb) TO authenticated;
ALTER FUNCTION public.save_role_permission_template(uuid,public.user_role,jsonb) OWNER TO postgres;
