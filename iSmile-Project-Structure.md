# iSmile CRM — Project Structure

Frontend and backend live in separate top-level folders (npm workspaces).
They run together as one Next.js app: `npm run dev` from `iSmile-CRM/`.
The frontend imports the backend via `@backend/*`; the backend never imports the frontend.
See `README.md` for architecture, conventions and setup.

```
iSmile-CRM/
├── backend/                         # @ismile/backend — all server logic + database
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema (MySQL / MariaDB)
│   │   ├── migrations/              # Versioned schema changes (20261106000000_init)
│   │   └── seed.ts                  # Development demo data
│   ├── src/
│   │   ├── features/                # One folder per business module
│   │   │   ├── auth/                # login, sessions, password reset, profile, demo accounts
│   │   │   │   ├── auth.controller.ts          # Server Actions
│   │   │   │   ├── auth.api.controller.ts      # HTTP handlers (session expiry)
│   │   │   │   ├── auth.service.ts  password-reset.service.ts  demo-accounts.service.ts
│   │   │   │   ├── auth.repository.ts  auth.types.ts
│   │   │   │   └── login.schema.ts  password.schema.ts  reset-password.schema.ts
│   │   │   ├── users/               # staff accounts, invitations, activation
│   │   │   ├── patients/            # reference implementation of scoped data access
│   │   │   ├── health/              # /api/health (controller, service, types)
│   │   │   └── <feature>/           # planned: appointments, treatments, billing, leads,
│   │   │       │                    #   inventory, notifications, reports …
│   │   │       ├── <feature>.controller.ts   # entry: Server Actions / HTTP handlers
│   │   │       ├── <feature>.service.ts      # business logic + permissions
│   │   │       ├── <feature>.repository.ts   # database queries
│   │   │       ├── <feature>.types.ts        # inputs, DTOs, results
│   │   │       └── <entity>.schema.ts        # Zod validation (shared with forms)
│   │   ├── lib/
│   │   │   ├── auth.ts  auth.config.ts       # Auth.js setup (edge-safe config split out)
│   │   │   ├── authorization.ts              # permission checks / scoped access
│   │   │   ├── prisma.ts  env.ts  request-context.ts
│   │   │   ├── api/                          # response.ts — standard API response shape
│   │   │   ├── email/                        # mailer.ts
│   │   │   ├── errors/                       # app-error, error-codes, api + prisma error handlers
│   │   │   ├── logging/                      # logger.ts, audit.ts (audit log)
│   │   │   └── security/                     # password.ts, rate-limit.ts, webhook.ts
│   │   ├── config/                  # permissions.ts (RBAC), security.ts
│   │   ├── types/                   # next-auth.d.ts (Auth.js type augmentation)
│   │   └── generated/prisma/        # Generated Prisma Client (git-ignored)
│   ├── tests/
│   │   ├── unit/                    # auth, authorization, permissions, protected-endpoints,
│   │   │                            #   error-handler, rate-limit, webhook
│   │   ├── integration/             # auth, authorization (+ global-setup.ts) — needs a test DB
│   │   ├── helpers/                 # db.ts, fixtures.ts, empty-module.ts
│   │   └── setup.ts
│   ├── prisma.config.ts  vitest.config.mts  tsconfig.json  package.json
│
├── frontend/                        # @ismile/frontend — Next.js UI
│   ├── public/                      # Static assets only — never patient documents
│   ├── src/
│   │   ├── app/                     # Routes
│   │   │   ├── (auth)/              # login, forgot-password, reset-password (+ layout)
│   │   │   ├── (dashboard)/         # Authenticated area: dashboard, profile, users
│   │   │   │                        #   (+ layout, loading, error)
│   │   │   ├── api/                 # One-line re-exports of backend controllers:
│   │   │   │                        #   auth/[...nextauth], health, patients, patients/[id],
│   │   │   │                        #   session/expired
│   │   │   ├── page.tsx  layout.tsx  globals.css  favicon.ico
│   │   │   └── error.tsx  global-error.tsx  not-found.tsx
│   │   ├── features/<feature>/components/   # Feature UI — auth/ (login, reset, profile,
│   │   │                                    #   change-password, session buttons), users/
│   │   │                                    #   (invite form, status toggle)
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn primitives (button, card, input, table, sonner …)
│   │   │   ├── shared/              # brand, empty/error/loading states, access-denied,
│   │   │   │                        #   route-error, service-unavailable
│   │   │   ├── forms/               # form-field, submit-button
│   │   │   └── layout/              # dashboard-nav
│   │   ├── hooks/                   # use-action-form.ts
│   │   ├── lib/utils.ts
│   │   └── proxy.ts                 # Request ID, CSP, auth redirects
│   ├── tests/e2e/                   # Playwright (auth.spec.ts)
│   ├── AGENTS.md                    # Notes for AI agents working on the frontend
│   ├── next.config.ts  playwright.config.ts  components.json  tsconfig.json  package.json
│
├── docs/                            # requirements/ architecture/ api/ user-guides/ (placeholders)
├── scripts/db/                      # audit-log-immutability.sql (audit-log hardening)
├── .env  .env.example               # One environment file for both (.env is git-ignored)
├── eslint.config.mjs                # Lints both workspaces
├── README.md
└── package.json                     # Workspaces + root scripts (dev, build, lint, typecheck,
                                     #   test, test:unit/integration/e2e, db:*)
```
