-- Keep future classrooms aligned with the reconciled student role defaults.
CREATE OR REPLACE FUNCTION private.seed_classroom_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  INSERT INTO public.classroom_role_permissions(classroom_id,role,permission_key,allowed)
  SELECT NEW.id,r.role,p.permission_key,
    CASE WHEN r.role='admin' THEN true
      WHEN r.role='teacher' THEN p.permission_key NOT IN ('members.create','members.edit','members.delete','members.change_roles','members.reset_passwords','classroom.manage_settings','permissions.view','permissions.grant','permissions.revoke','permissions.manage_templates')
      WHEN r.role='student' THEN p.permission_key IN ('subjects.view','lessons.view','contributions.view','contributions.create','attachments.view','assignments.view','progress.view_own','progress.create','progress.edit_own','members.view','classroom.view')
      ELSE false END
  FROM (VALUES ('admin'::public.user_role),('teacher'::public.user_role),('student'::public.user_role)) r(role)
  CROSS JOIN public.permission_registry p;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.seed_classroom_permissions() OWNER TO postgres;
