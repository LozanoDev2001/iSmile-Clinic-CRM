# iSmile CRM — Project Structure

Frontend and backend live in separate top-level folders (npm workspaces).
They run together as one Next.js app: `npm run dev` from `iSmile-CRM/`.
The frontend imports the backend via `@backend/*`; the backend never imports the frontend.
See `README.md` for architecture, conventions and setup.

```
iSmile-CRM/
├── backend/                         # @ismile/backend — all server logic + database
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema (MySQL)
│   │   ├── migrations/              # Versioned schema changes
│   │   └── seed.ts                  # Development demo data
│   ├── src/
│   │   ├── features/                # One folder per business module
│   │   │   ├── auth/                # login, sessions, password reset, profile
│   │   │   ├── users/               # staff accounts, invitations, activation
│   │   │   ├── patients/            # reference implementation of scoped data access
│   │   │   ├── health/              # /api/health
│   │   │   └── <feature>/           # appointments, treatments, billing, leads,
│   │   │       │                    #   inventory, notifications, reports …
│   │   │       ├── <feature>.controller.ts   # entry: Server Actions / HTTP handlers
│   │   │       ├── <feature>.service.ts      # business logic + permissions
│   │   │       ├── <feature>.repository.ts   # database queries
│   │   │       ├── <feature>.types.ts        # inputs, DTOs, results
│   │   │       └── <feature>.schema.ts       # Zod validation (shared with forms)
│   │   ├── lib/                     # auth, authorization, errors, logging, security, env, prisma
│   │   ├── config/                  # permissions.ts (RBAC), security.ts
│   │   ├── types/                   # Type augmentation (Auth.js)
│   │   └── generated/prisma/        # Generated Prisma Client (git-ignored)
│   ├── tests/                       # unit/, integration/, helpers/
│   ├── prisma.config.ts  vitest.config.mts  tsconfig.json  package.json
│
├── frontend/                        # @ismile/frontend — Next.js UI
│   ├── public/                      # Static assets only — never patient documents
│   ├── src/
│   │   ├── app/                     # Routes
│   │   │   ├── (auth)/              # login, forgot-password, reset-password
│   │   │   ├── (dashboard)/         # Authenticated area: dashboard, profile, users …
│   │   │   ├── api/                 # One-line re-exports of backend controllers
│   │   │   └── error.tsx  global-error.tsx  not-found.tsx  layout.tsx
│   │   ├── features/<feature>/components/   # Feature UI (forms, buttons)
│   │   ├── components/              # ui/ (shadcn), shared/, forms/, layout/
│   │   ├── hooks/                   # use-action-form.ts
│   │   ├── lib/utils.ts
│   │   └── proxy.ts                 # Request ID, CSP, auth redirects
│   ├── tests/e2e/                   # Playwright
│   ├── next.config.ts  playwright.config.ts  components.json  tsconfig.json  package.json
│
├── docs/                            # requirements/ architecture/ api/ user-guides/
├── scripts/db/                      # Operational SQL (audit-log hardening)
├── .env  .env.example               # One environment file for both
├── eslint.config.mjs                # Lints both workspaces
└── package.json                     # Workspaces + root scripts
```
