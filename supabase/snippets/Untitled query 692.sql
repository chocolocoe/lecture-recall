SELECT
    u.email,
    p.full_name,
    m.role,
    c.name AS classroom_name,
    m.classroom_id
FROM auth.users u
LEFT JOIN public.profiles p
    ON p.id = u.id
LEFT JOIN public.memberships m
    ON m.user_id = u.id
LEFT JOIN public.classrooms c
    ON c.id = m.classroom_id
WHERE u.email = 'admin.local@example.test';