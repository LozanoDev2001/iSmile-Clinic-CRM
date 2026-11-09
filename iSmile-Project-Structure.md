# iSmile Clinic CRM — Project Generation Prompt

## ROLE

Act as a Senior Full-Stack Software Architect, Next.js Developer, Database Engineer, and UI/UX Engineer.

Your task is to generate the complete **iSmile Clinic CRM** project structure, create all required directories and source files, configure the application, and establish a working foundation based on the supplied dashboard screenshot.

**Generate the actual project directly inside the working directory. Do not create a ZIP archive.**

## 1. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| Frontend | React |
| Styling | Tailwind CSS |
| UI Library | shadcn/ui + Radix UI |
| Database | MySQL |
| ORM | Prisma |
| Authentication | Auth.js |
| Validation | Zod |
| Forms | React Hook Form |
| Charts | Recharts |
| Data Tables | TanStack Table |
| State Management | Zustand |
| Package Manager | npm |

### Mandatory Requirements

- Use Next.js for frontend and backend.
- Do not use NestJS or a separate backend server.
- Use MySQL with Prisma.
- Use npm exclusively.
- Generate `package.json` and `package-lock.json`.
- Enable TypeScript strict mode.
- Follow feature-based architecture.
- Use Server Components, Server Actions, and Next.js Route Handlers appropriately.
- Keep database operations server-side.
- Do not generate ZIP files or archive-generation scripts.

## 2. Project Structure

Create the following directory architecture:

```text
ismile-clinic-crm/
├── public/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── patients/
│   │   │   ├── appointments/
│   │   │   ├── leads/
│   │   │   ├── contacts/
│   │   │   ├── providers/
│   │   │   ├── messaging/
│   │   │   ├── calendar/
│   │   │   ├── billing/
│   │   │   ├── treatments/
│   │   │   ├── reports/
│   │   │   ├── notifications/
│   │   │   └── settings/
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── patients/
│   │   │   ├── appointments/
│   │   │   ├── leads/
│   │   │   ├── contacts/
│   │   │   ├── providers/
│   │   │   ├── messaging/
│   │   │   ├── invoices/
│   │   │   ├── treatments/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   │
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── features/
│   │   ├── dashboard/
│   │   ├── patients/
│   │   ├── appointments/
│   │   ├── leads/
│   │   ├── contacts/
│   │   ├── providers/
│   │   ├── messaging/
│   │   ├── calendar/
│   │   ├── billing/
│   │   ├── treatments/
│   │   ├── reports/
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── auth/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── shared/
│   │
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── permissions.ts
│   │   ├── env.ts
│   │   └── utils.ts
│   │
│   ├── hooks/
│   ├── providers/
│   ├── stores/
│   ├── config/
│   ├── constants/
│   └── types/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── security.md
│   └── setup.md
│
├── .env.example
├── .gitignore
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── prisma.config.ts
├── package.json
├── package-lock.json
└── README.md
```

## 3. Mandatory Feature Architecture

Every feature inside `src/features/` must have its own frontend, backend, and schema directories.

```text
feature-name/
├── frontend/
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── styles/
│
├── backend/
│   ├── feature.service.ts
│   ├── feature.repository.ts
│   └── feature.actions.ts
│
└── schemas/
    └── feature.schema.ts
```

Create actual, valid files for implemented features and meaningful placeholder pages for planned features. Use `.gitkeep` for intentionally empty directories.

### Architectural Rules

- Frontend components must not directly access Prisma.
- Server-only repositories must handle database operations.
- Services must handle business logic.
- Server Actions must validate inputs and authorization.
- API Route Handlers must reuse feature services.
- Shared UI components belong in `src/components`.
- Feature-specific components belong in the corresponding feature's `frontend/components`.
- Keep App Router page files lightweight.
- Do not create unnecessary empty TypeScript modules or fake working implementations.

## 4. Dashboard UI

Use the attached iSmile dashboard screenshot as the primary design reference.

Implement:

- Blue navigation sidebar
- Header with global search and user profile
- Weekly appointment metrics
- Lead and revenue KPIs
- Today's worklist
- Revenue vs expenses chart
- Booking sources donut chart
- Treatment revenue chart
- Active patient metrics
- Mia assistant card

Match the reference image's layout, color palette, spacing, visual hierarchy, and overall professional healthcare SaaS appearance.

Make the dashboard responsive for desktop, tablet, and mobile.

Use fictional demonstration data until the actual database services are connected.

## 5. MySQL and Prisma

Create the MySQL database foundation for:

- Clinic and branches
- Users and permissions
- Patients and medical histories
- Providers and schedules
- Appointments
- Leads and contacts
- Treatments and treatment plans
- Invoices and payments
- Conversations and messages
- Notifications
- Audit logs

Use proper foreign keys, indexes, timestamps, clinic-level scoping, and fixed-precision decimal types for monetary values.

Configure the appropriate Prisma version and MySQL driver adapter.

Store database credentials in environment variables and provide an `.env.example` with placeholder values.

Never include real credentials or real patient data in the project.

## 6. Authentication and Security

Use Auth.js for the authentication foundation.

Prepare these roles:

- Super Admin
- Clinic Admin
- Dentist
- Receptionist
- Finance Staff
- Marketing / CRM Staff

Implement protected routes, secure sessions, server-side permission checks, input validation, and audit logging foundations.

Sensitive medical records require stricter authorization than ordinary CRM contact information.

Do not claim healthcare regulatory compliance without a separate assessment.

## 7. npm Commands

Use npm exclusively.

```bash
npm install
npm run dev
npm run db:generate
npm run db:migrate
npm run db:seed
npm run typecheck
npm run lint
npm run test
npm run build
```

Configure the corresponding scripts in `package.json` and install their actual dependencies.

Do not generate or use pnpm, Yarn, or Bun lockfiles.

## 8. Development Execution

Follow this order:

1. Inspect the existing workspace.
2. Initialize the Next.js application if it does not exist.
3. Install the dependencies using npm.
4. Create the project folder structure.
5. Create the feature-specific frontend and backend directories.
6. Configure Tailwind CSS and shadcn/ui.
7. Build the shared layout and navigation.
8. Implement the dashboard based on the screenshot.
9. Configure MySQL and Prisma.
10. Create database models and seed data.
11. Establish authentication and authorization foundations.
12. Prepare API routes and feature services.
13. Create meaningful placeholder pages for unimplemented modules.
14. Add README and developer documentation.
15. Validate TypeScript, linting, tests, and production build where possible.
16. Fix any detected implementation errors.

Do not modify or migrate an unknown production database. Database-dependent commands must run only against a configured development database.

## 9. Final Requirements

The project must:

- Exist as a normal, editable Next.js source-code directory.
- Contain all required folders and configuration files.
- Have a working application shell and dashboard.
- Follow the feature-based frontend/backend architecture.
- Use MySQL and Prisma.
- Use npm exclusively.
- Include fictional demonstration data.
- Document any unimplemented functionality.
- Be ready to open in VS Code.
- Be runnable using `npm install` and `npm run dev`, subject to the documented environment setup.

At completion, report the generated directory structure, implemented features, remaining placeholders, database status, and actual verification results.

**IMPORTANT: Generate all project files directly in the working directory. Do not create, export, compress, or package the project into a ZIP or any other archive.**

**Project:** iSmile-CRM  
**Framework:** Next.js  
**Database:** MySQL  
**Package manager:** npm  
**Architecture:** Feature-based frontend and backend

**Begin implementation now.**