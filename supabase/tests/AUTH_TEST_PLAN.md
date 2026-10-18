# Phase 3 authentication verification plan

The repository currently has no frontend test runner or configured Supabase
project, so these checks are manual and have not been executed. Run them against
a disposable local Supabase stack after applying the migrations, deploying
`invite-member`, and configuring redirect URLs and email delivery.

## Session and routes

- With a signed-out browser, open `/`, `/lessons`, and `/assignments` directly.
  Each route should redirect to `/login`, and successful sign-in should return
  to the originally requested path.
- Sign in with a valid student, teacher, and administrator account. Confirm the
  displayed role and classroom come from the database membership, and that
  changing the URL or local storage cannot change the role.
- Refresh each dashboard and confirm the Supabase session is restored before
  protected content renders.
- Sign out, then use browser back and directly revisit a protected route. The
  route should return to sign-in.
- Expire/revoke a session in a disposable project and confirm protected content
  stops rendering and the user is prompted to sign in again.
- Sign in with an account whose profile is missing, then one with no membership,
  then one with a membership whose classroom is not visible. Each should show a
  setup/access error and offer retry and sign-out, without rendering a
  role-specific dashboard.
- Disable or misconfigure the frontend Supabase URL/key and confirm `/login`
  displays setup instructions and does not expose a demo sign-in.

## Password and invitation flows

- Request password recovery, use the delivered link before expiry, set a new
  password, and sign in with it. Also verify an expired recovery link cannot
  complete password setup.
- As a classroom administrator, invite a new student and teacher. Confirm each
  receives a link to `/login?flow=invite`, can set a password, and reaches the
  assigned classroom after setup.
- Call `invite-member` as a student, teacher, unauthenticated user, and
  administrator from a different classroom. Each request must be denied and
  must create neither an invitation nor a membership.
- Attempt to invite the `admin` role and confirm the request is rejected.
- Confirm the Edge Function fails closed when its server secrets or configured
  `APP_SITE_URL` are invalid. Verify no privileged secret appears in built
  frontend assets or `VITE_` variables.
