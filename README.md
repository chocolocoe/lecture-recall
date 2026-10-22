# Lecture Recall

**An open-source classroom learning platform designed to help students catch up on missed lectures.**

Lecture Recall is a self-hosted web application that organizes daily classroom lessons, study notes, homework, and assignments in one place. It is designed for classrooms where students may miss a lesson and need a reliable way to find out what was taught and what work they need to complete.

The project is intended for technically capable hosts who can configure the source code, database, authentication, storage, and deployment environment.

> **Project status:** In development. Features, setup instructions, and configuration requirements may change as development progresses.

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Features](#features)
- [User Roles](#user-roles)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Authentication and Classroom Setup](#authentication-and-classroom-setup)
- [File Storage](#file-storage)
- [Security](#security)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Reporting Bugs](#reporting-bugs)
- [Security Vulnerabilities](#security-vulnerabilities)
- [License](#license)

---

## Overview

Lecture Recall provides a centralized space for classroom learning resources.

Instead of relying on scattered messages, personal notebooks, or classmates remembering everything, students can access an organized record of daily lessons and the work associated with them.

Each classroom has its own members, subjects, lessons, contributions, and assignments. Access is restricted to authorized members of that classroom.

Lecture Recall is designed as a self-hosted project rather than a ready-to-use hosted service. The person deploying it is responsible for configuring the required services and maintaining the deployment.

## The Problem

When students miss school, they can miss important explanations, lesson topics, homework instructions, and assignment deadlines.

Catching up often depends on contacting classmates, searching through chat messages, or collecting notes from multiple sources. Information can be incomplete, outdated, or difficult to organize.

This becomes especially challenging when several lessons and assignments need to be recovered at once.

## The Solution

Lecture Recall organizes classroom information around individual lessons and dates.

Students can review what was taught, find associated learning resources, check assignments, and contribute their own notes. Teachers and authorized classroom administrators can manage lessons and review student-submitted resources.

The goal is simple: make catching up on missed classroom learning more organized and reliable.

## Features

The following describes the intended feature set. Availability depends on the current development stage.

### Classroom Management

- Create and configure a classroom.
- Create username/password accounts through an authenticated classroom administrator.
- Assign classroom roles.
- Organize subjects and learning resources.
- Keep classroom information private to authorized members.
- Manage membership through authorized actions.

### Daily Lecture Archive

- Organize lessons by date and subject.
- Record lesson titles, topics, and explanations.
- View previous lessons in chronological order.
- Associate lessons with relevant notes and attachments.
- Find the material needed to catch up on a missed day.

### Notes and Learning Resources

- Allow students to submit supplementary notes.
- Keep student contributions separate from approved resources.
- Let authorized teachers or administrators review submissions.
- Approve or reject contributions.
- Display approved contributions to classroom members.
- Support relevant attachments where configured.

### Homework and Assignments

- Create assignments with descriptions and due dates.
- Associate assignments with a subject or lesson.
- Display upcoming deadlines.
- Let students track their own completion status.
- Keep assignment progress associated with the correct student.

### Accounts and Profiles

- Username/password authentication through Supabase Auth.
- Administrator-managed account creation and password reset without email delivery.
- Profile information and display names.
- Password management through supported authentication flows.
- Role-based access to classroom features.

### Administration

- Configure classroom membership and permissions.
- Manage lesson and assignment content.
- Review student contributions.
- Maintain classroom resources and settings.

### Privacy and Access Control

- Separate data by classroom.
- Restrict unauthorized access using database-level access policies.
- Keep uploaded classroom resources private.
- Validate permissions for sensitive operations.

---

## User Roles

Lecture Recall uses three intended classroom roles.

| Role | Intended permissions |
|---|---|
| **Admin** | Manage all classroom accounts, membership, classroom settings, and academic data. |
| **Teacher** | Manage lessons and assignments, and review student contributions. |
| **Student** | View classroom resources, contribute notes, and track personal assignment progress. |

Exact permissions will be enforced by the backend and database policies, not merely by hiding interface elements.

A user should not be able to grant themselves a higher role by modifying a request or changing frontend code.

Each account is intended to belong to one classroom. This constraint must be enforced in the database and onboarding logic.

---

## How It Works

A typical classroom workflow looks like this:

1. **Set up the application:** A host configures the source code, backend services, database, and deployment.
2. **Create a classroom:** An authorized administrator establishes the classroom and its initial settings.
3. **Create accounts:** The administrator creates usernames, temporary passwords, and roles.
4. **Record lessons:** Teachers or authorized members add daily lesson information.
5. **Share resources:** Members access approved notes and relevant attachments.
6. **Contribute notes:** Students submit supplementary material for review.
7. **Review submissions:** An authorized reviewer approves or rejects contributions.
8. **Track assignments:** Students check deadlines and update their own completion status.

---

## Technology Stack

The intended stack is:

| Component | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Development server and build tool | Vite |
| Styling | Tailwind CSS |
| Authentication | Supabase Auth |
| Database | PostgreSQL through Supabase |
| File storage | Supabase Storage |
| Sensitive server-side operations | Supabase Edge Functions or other trusted backend functions |
| Source control | Git and GitHub |
| Deployment | Vercel or another compatible hosting platform |

The implementation may evolve as the project develops. Refer to the actual dependencies and configuration files in the repository for the authoritative stack.

## Architecture

Lecture Recall separates the user interface from backend services.

- **Frontend:** Displays lessons, assignments, profiles, and classroom management interfaces.
- **Authentication:** Handles username/password sign-in and authenticated password changes.
- **Database:** Stores classroom membership, lessons, contributions, assignments, and progress.
- **Storage:** Stores uploaded learning resources in private storage.
- **Server-side operations:** Handle privileged actions that must not be performed using public frontend credentials.

The frontend communicates with backend services through their supported client APIs. Database policies and trusted server-side code enforce authorization.

---

## Requirements

Before installation, prepare the following:

- [Node.js](https://nodejs.org/) — use a version compatible with the project's `package.json` and Vite requirements.
- npm, included with Node.js.
- [Git](https://git-scm.com/).
- A [Supabase](https://supabase.com/) project, or an appropriately configured compatible development environment.
- A GitHub account for accessing or contributing to the source repository.
- A hosting environment if deploying the application publicly.

Basic knowledge of JavaScript or TypeScript, environment variables, SQL, authentication, and web deployment is recommended.

---

## Installation

These are the intended local development steps. Adjust them if the actual project scripts or directory structure differ.

### 1. Obtain the source code

Clone the repository:

```bash
git clone <REPOSITORY_URL>
cd lecture-recall
```

Replace `<REPOSITORY_URL>` with the actual repository URL.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Fill in the values required by your backend configuration. See [Configuration](#configuration).

### 4. Configure the backend

Set up the Supabase project, apply the required database migrations, configure authentication, and create the private storage bucket.

Do not start public deployment until database access policies and sensitive server-side operations have been configured and tested.

### 5. Start the development server

```bash
npm run dev
```

Open the local URL printed by Vite in the terminal.

### 6. Create a production build

```bash
npm run build
```

If the repository provides a type-checking or linting script, run those checks as well.

**Important:** These commands describe the intended workflow. They will only work as written once the corresponding scripts, files, and backend configuration exist in the repository.

---

## Configuration

See [`supabase/DEPLOYMENT_READINESS.md`](supabase/DEPLOYMENT_READINESS.md) for
the current Windows local verification steps, Auth redirect configuration,
Edge Function secrets, migration order, Storage setup, and frontend deployment
checklist. Database schema and trusted first-administrator setup are in
[`supabase/README.md`](supabase/README.md).

Configuration may include:

- Frontend environment variables.
- Supabase project URL and public client key.
- Database migrations and access policies.
- Authentication site URL and local username-login function configuration.
- Private storage bucket settings.
- File upload restrictions.
- Server-side function configuration.
- Local development and production URLs.
- Hosting environment variables.

### Environment variables

The intended frontend configuration uses:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Only public client configuration belongs in variables exposed to the frontend.

**Never put a Supabase service-role key, database password, private API token, or other secret in a `VITE_` variable.** Frontend environment variables are included in the browser build and must be treated as public.

Trusted backend secrets must be configured separately in the appropriate server-side environment.

The app accepts `VITE_SUPABASE_PUBLISHABLE_KEY` (recommended) and the legacy
`VITE_SUPABASE_ANON_KEY`. Both are public browser credentials. The local
database, Auth, Storage, Edge Function, and deployment instructions are in
[`supabase/DEPLOYMENT_READINESS.md`](supabase/DEPLOYMENT_READINESS.md).

---

## Database Setup

The planned database schema includes the following entities:

| Entity | Purpose |
|---|---|
| `profiles` | User profile information. |
| `classrooms` | Classroom details and ownership. |
| `memberships` | User membership and role assignments. |
| `subjects` | Subjects belonging to a classroom. |
| `lessons` | Daily lessons and topics. |
| `lesson_contributions` | Student-submitted notes and review status. |
| `lesson_attachments` | Metadata for uploaded lesson resources. |
| `assignments` | Homework and assignment information. |
| `assignment_progress` | Individual student completion status. |

The implementation should use database migrations to create and update the schema consistently.

Database configuration must also include:

- Appropriate primary and foreign keys.
- Uniqueness constraints.
- Indexes for common queries.
- Referential integrity between classroom-owned records.
- Row Level Security (RLS) policies.
- Tests verifying access permissions.

Migration order, local verification, RLS notes, and trusted project-owner
setup are documented in [`supabase/README.md`](supabase/README.md). Do not run
local reset commands against a linked or hosted project.

---

## Authentication and Classroom Setup

Lecture Recall uses administrator-created username accounts. There are no
user-facing email, invitation, verification, or password-recovery workflows.

1. An authorized administrator supplies a username, temporary password, and role.
2. A protected Edge Function creates the Supabase Auth user and classroom membership.
3. The user signs in with their username and password and can change their password in Settings.
4. The backend verifies that the account cannot join another classroom or change its own privileges.

Supabase may store an internal email-shaped Auth identifier for compatibility.
It is never shown to users or exposed through browser profile queries.

Never distribute shared passwords or store plaintext passwords. Privileged account creation and role assignment must not rely on untrusted frontend input.

The precise onboarding procedure will be documented after the authentication implementation is finalized.

---

## File Storage

Uploaded notes and lesson attachments are intended to use private object storage.

The storage implementation should:

- Restrict access to authorized classroom members.
- Validate file types and file sizes.
- Store file metadata separately from the file itself.
- Verify classroom membership when uploading or accessing files.
- Prevent users from accessing resources by guessing storage paths.
- Avoid exposing private files through permanent public URLs.

The final supported file types, maximum upload size, bucket configuration, and access policies will be documented after implementation.

---

## Security

Security is a core requirement because classroom content and account information should not be publicly accessible.

The project should follow these principles:

- **Least privilege:** Give each role only the permissions it needs.
- **Database-level authorization:** Use RLS policies for classroom-owned data.
- **Trusted privileged operations:** Perform sensitive actions in secure server-side code.
- **Protected credentials:** Never commit secrets to source control.
- **Input validation:** Validate user input on the backend as well as in the interface.
- **Safe authentication:** Use Supabase Auth with server-side username mapping and authenticated password changes.
- **Private storage:** Protect attachments with access policies.
- **Auditable review actions:** Record the reviewer and time for contribution decisions.
- **Tested isolation:** Verify that users from one classroom cannot access another classroom's data.

The UI is not a security boundary. Hiding a button does not prevent an unauthorized API request.

### Responsible use

Deployers are responsible for keeping dependencies updated, protecting deployment credentials, configuring access policies, and following applicable privacy requirements.

See [SECURITY.md](SECURITY.md) for the project's security reporting instructions once established.

---

## Development

### Recommended workflow

1. Fork the repository or create a development branch.
2. Install the project dependencies.
3. Configure a separate development backend.
4. Make focused changes.
5. Run available checks and tests.
6. Review database and permission changes carefully.
7. Submit a pull request with a clear description.

### Useful commands

The following are common commands for a Vite-based project; check `package.json` for the commands actually supported.

```bash
npm run dev
npm run build
npm run preview
```

If linting and automated tests are configured, their commands will be documented here.

### Development guidelines

- Use TypeScript types consistently.
- Keep components and feature logic organized.
- Validate inputs at the appropriate boundaries.
- Avoid duplicating authorization logic in ways that create inconsistencies.
- Use migrations for database changes.
- Never disable RLS as a shortcut to make a feature work.
- Keep secrets and local environment files out of commits.
- Add tests for new permissions and sensitive workflows.

---

## Testing

Testing should cover both functionality and security.

### Functional testing

- Account onboarding and sign-in.
- Classroom creation and membership.
- Lesson creation and date-based browsing.
- Contribution submission and review.
- Assignment creation and deadline display.
- Student-specific progress updates.
- Attachment upload and retrieval.

### Authorization testing

- Anonymous users cannot access protected classroom data.
- A student cannot read another classroom's private records.
- Students cannot promote themselves to teacher or administrator.
- Students cannot approve their own pending contributions.
- Students cannot update another student's assignment progress.
- Users cannot bypass restrictions by calling backend APIs directly.
- Private attachments remain protected.

Tests should use separate accounts with different roles and, where possible, separate classrooms.

---

## Deployment

Lecture Recall is intended to be deployable to a compatible web host with a separately configured backend.

A typical deployment process is:

1. Create and configure the backend project.
2. Apply database migrations.
3. Configure authentication URLs and redirect settings.
4. Create the private storage bucket and apply storage policies.
5. Deploy trusted backend functions.
6. Import the repository into the chosen hosting provider.
7. Configure production environment variables.
8. Build and deploy the frontend.
9. Test onboarding, classroom isolation, file access, and role permissions using separate accounts.
10. Review logs, deployment settings, and secret handling before inviting real users.

For Vercel, the expected Vite output directory is typically `dist`, but confirm this against the project's build configuration.

A successful frontend build alone does not mean the application is ready for use. The backend, authentication, storage, and authorization policies must also work correctly.

---

## Project Structure

The intended structure is organized by application features and backend responsibilities.

```text
lecture-recall/
├── public/
│   ├── favicon.svg
│   └── images/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── layout/
│   │   ├── ui/
│   │   ├── lessons/
│   │   ├── assignments/
│   │   └── forms/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── classrooms/
│   │   ├── lessons/
│   │   ├── contributions/
│   │   ├── assignments/
│   │   └── members/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   ├── styles/
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   └── seed.sql
├── e2e/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

This is a proposed structure. Directories and files will appear as their corresponding parts of the application are implemented.

---

## Roadmap

The roadmap describes planned development, not a guarantee that every item is already available.

- [ ] Establish the frontend and development tooling.
- [ ] Implement the database schema and constraints.
- [ ] Configure Row Level Security and authorization tests.
- [x] Implement administrator-managed username/password accounts.
- [x] Add classroom membership and role management.
- [x] Build the lesson archive and lesson detail pages.
- [x] Implement student note contributions and moderation.
- [x] Add private lesson attachments.
- [x] Implement assignments, due dates, and student responses.
- [x] Add individual assignment progress tracking.
- [x] Add database security and authenticated local integration tests.
- [x] Document configuration and deployment.
- [ ] Publish a reproducible demonstration deployment.

Progress should be updated as features become functional.

---

## Limitations

- Lecture Recall requires technical setup before it can be used.
- A compatible backend and database must be configured.
- Deployment and backend services may have their own costs, usage limits, and terms.
- Features may change during active development.
- The project is not a replacement for a school's official learning management system.
- Availability, backups, access control, and maintenance depend on the deployment configuration.

---

## Contributing

Contributions, bug reports, documentation improvements, and suggestions are welcome.

Before contributing:

1. Check the existing issues and discussions, if enabled.
2. Describe the problem or proposed improvement clearly.
3. Keep changes focused and provide context for non-obvious decisions.
4. Test changes locally.
5. Include relevant tests, especially for authorization or database changes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines once the file is available.

## Reporting Bugs

When reporting a bug, include:

- A concise description of the issue.
- Steps to reproduce it.
- Expected and actual behavior.
- Relevant browser or runtime information.
- Error messages or logs with credentials and personal data removed.

Do not include passwords, access tokens, private keys, or other secrets in bug reports.

## Security Vulnerabilities

Please do not publish exploitable vulnerabilities or sensitive credentials in public issues.

Use the private reporting method documented in `SECURITY.md` once one has been established. If no private reporting method is available, contact the repository owner privately.

## License

The project is intended to use the MIT License. The repository's `LICENSE` file determines the actual licensing terms.

---

**Lecture Recall — making missed lessons easier to recover.**
