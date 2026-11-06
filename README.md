# iSmile Clinic CRM

Clinic management for iSmile dental clinics — a single Next.js application
(modular monolith) on MySQL.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 (MariaDB driver adapter) · MySQL ·
Auth.js v5 · Zod 4 · React Hook Form · Tailwind CSS 4 · shadcn/ui · Sonner · Vitest · Playwright

---

## Getting started

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in the values (see below)
npm run db:migrate               # create tables in your dev database (review backend/prisma/migrations first)
SEED_PASSWORD="choose-a-long-one" npm run db:seed
npm run dev                      # http://localhost:3000
```

Seeded accounts (all use `SEED_PASSWORD`): `superadmin@`, `admin@`, `dentist@`, `reception@`,
`finance@`, `crm@` — all `…@ismile.test`.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `mysql://user:pass@host:3306/db` — MySQL 8+ / MariaDB 10.6+ |
| `AUTH_SECRET` | yes | ≥ 32 chars. `npx auth secret` or `openssl rand -base64 33` |
| `APP_URL` | yes (prod) | Public URL; used in reset/invite links. `https://…` enables `upgrade-insecure-requests` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | prod | Without SMTP in development, emails are printed to the server console |
| `DB_CONNECTION_LIMIT` | no | Pool size per instance (default 10) |
| `SESSION_MAX_AGE_HOURS` | no | Absolute session lifetime (default 8) |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error` |
| `DATABASE_URL_TEST` | tests | **Separate, disposable** DB for integration tests — they wipe it |

Environment variables are validated at startup (`backend/src/lib/env.ts`); the server refuses to start with
invalid configuration and prints which keys are wrong (never their values).

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (frontend workspace) |

Run every script from the `iSmile-CRM/` root; they delegate to the right workspace.
| `npm run typecheck` / `lint` | `tsc --noEmit` in both workspaces / ESLint |
| `npm run test` | Unit tests (+ integration tests when `DATABASE_URL_TEST` is set) |
| `npm run test:integration` | MySQL-backed tests only (applies migrations to `DATABASE_URL_TEST` first) |
| `npm run test:e2e` | Playwright; needs a seeded DB and `E2E_PASSWORD=<SEED_PASSWORD>`. First run `npx playwright install chromium` |
| `npm run db:generate` / `db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |

---

## Architecture

The repository is an npm workspace with two packages. They are developed and deployed together
(`npm run dev` runs one Next.js server), but the code lives in separate top-level folders.

```
iSmile-CRM/
├── backend/   @ismile/backend  — controllers, services, repositories, types, auth, database
├── frontend/  @ismile/frontend — Next.js pages, UI components, hooks (imports the backend)
├── docs/  scripts/
├── .env       one environment file for both (read by Next.js and the Prisma CLI)
└── package.json  workspaces + root scripts
```

The frontend imports backend code through the `@backend/*` alias (e.g.
`import { requireAuth } from "@backend/lib/authorization"`); the backend never imports the frontend.

```
frontend: pages / thin app/api route files / client components
        ↓   frontend/src/proxy.ts — request ID, CSP nonce, optimistic login redirect (no DB)
backend: controllers            backend/src/features/<feature>/*.controller.ts
        ↓   authentication + authorization (backend/src/lib/auth*.ts, authorization.ts)
backend: services               backend/src/features/<feature>/*.service.ts
        ↓
backend: repositories → Prisma → MySQL   *.repository.ts, backend/src/lib/prisma.ts

Shared at the boundaries: Zod validation, AppError + central handlers, structured logs, audit trail.
```

```
backend/
├── prisma/                   schema.prisma, migrations/, seed.ts
├── prisma.config.ts  vitest.config.mts  tsconfig.json  package.json
├── src/
│   ├── features/<name>/
│   │   ├── <name>.controller.ts      entry layer: Server Actions ("use server")
│   │   ├── <name>.api.controller.ts  entry layer: HTTP Route Handlers (when the feature has both)
│   │   ├── <name>.service.ts         business logic, permissions, validation
│   │   ├── <name>.repository.ts      Prisma queries (scoped)
│   │   ├── <name>.types.ts           input types (z.infer of schemas), DTOs, result types
│   │   └── <name>.schema.ts          Zod schemas (also used by frontend forms)
│   ├── lib/
│   │   ├── auth.ts, auth.config.ts   Auth.js (full / DB-free for the proxy)
│   │   ├── authorization.ts          requireAuth/Role/Permission/ClinicAccess/BranchAccess, recordScope
│   │   ├── errors/  api/  logging/  security/  email/
│   │   └── env.ts  prisma.ts  request-context.ts
│   ├── config/                       permissions.ts (RBAC), security.ts (limits, public paths)
│   ├── types/                        Auth.js type augmentation
│   └── generated/prisma/             generated client (git-ignored)
└── tests/                            unit/, integration/, helpers/

frontend/
├── next.config.ts  playwright.config.ts  components.json  tsconfig.json  package.json
├── public/
├── src/
│   ├── app/                          pages; app/api/**/route.ts are one-line re-exports of backend controllers
│   │   ├── (auth)/  (dashboard)/  api/
│   │   └── error.tsx  global-error.tsx  not-found.tsx  layout.tsx
│   ├── features/<name>/components/   feature UI (forms, buttons)
│   ├── components/                   ui/ (shadcn), shared/, forms/, layout/
│   ├── hooks/use-action-form.ts      RHF + Zod + Server Action + toasts
│   ├── lib/utils.ts
│   └── proxy.ts
└── tests/e2e/                        Playwright
```

### Authentication

- Email + password via Auth.js Credentials provider; **no public sign-up** — admins invite staff
  (`/users`), the invite email contains a single-use link to set a password.
- Passwords: Argon2id (m=19 MiB, t=2, p=1). Unknown emails still run a dummy hash (constant timing).
- Sessions: Auth.js JWT in an HttpOnly, SameSite=Lax cookie (Secure + `__Secure-` prefix on HTTPS),
  8 h absolute lifetime, renewed every 30 min of activity. Nothing is stored in `localStorage`.
- **Revocation:** every user has a `sessionVersion`, copied into the JWT at login and compared with the
  database on every server request (`getCurrentUser`, one indexed query, cached per request).
  Incrementing it ends all sessions — used by logout-everywhere, password change/reset, and
  deactivation. A stale cookie is cleared via `/api/session/expired`.
- Reset tokens: 256-bit random, only the SHA-256 is stored, 30 min TTL (invites: 72 h), consumed
  atomically (`UPDATE … WHERE usedAt IS NULL`) so they are single-use even under races.
- Rate limits (MySQL-backed, `rate_limits` table): login 5/15 min per email + 20/15 min per IP;
  reset 3/h per email + 5/h per IP. Tune in `backend/src/config/security.ts`.

### Authorization — how to protect a new module

1. Add permissions to `backend/src/config/permissions.ts` and grant them to roles.
2. In the service, check the permission and **scope every query**:

```ts
export async function listInvoices(user: AuthUser, raw: unknown) {
  assertPermission(user, "billing.read");          // what the role may do
  const query = listInvoicesSchema.parse(raw);      // validate input (ids, paging)
  return invoicesRepository.list(recordScope(user), query); // which rows: clinic → branches → assigned
}
```

3. Expose it through the feature's **controller**:
   - forms → `billing.controller.ts` with `"use server"`:
     `runAction(async () => service(await requireAuth(), input))`
   - JSON API → `export const listInvoicesHandler = withApiHandler(async (req) => ok(await service(await requireAuth(), …)))`,
     mounted by a one-line `frontend/src/app/api/.../route.ts`: `export { listInvoicesHandler as GET } from "…"`.
     (A `"use server"` file may only export Server Actions, so a feature with both uses
     `<name>.controller.ts` for actions and `<name>.api.controller.ts` for HTTP handlers.)
   - Server Component pages are already on the server and call the service directly:
     `const { user, allowed } = await pageCan("billing.read"); if (!allowed) return <AccessDenied />`.
4. Audit sensitive changes with `audit({...}, tx)` inside the same transaction.

`backend/src/features/patients` is the reference implementation (clinic/branch/dentist-assignment scoping,
medical fields only with `patients.medical.read`, medical reads audited).

### Errors

Throw `AppError` (or `Errors.notFound("patient")` etc.) for expected failures. Boundaries
(`withApiHandler`, `runAction`, error.tsx) convert anything else into a generic message plus a
request ID; Zod and Prisma/MySQL errors are mapped centrally (unique → 409, missing → 404,
connection/pool → 503, deadlock → 409 and retryable). Stack traces, SQL and patient data never reach
the client. Responses use `{ success, data, message }` / `{ success: false, error: { code, message, fields } }`.

### Logging & audit

- **Application logs** (`logger`): JSON lines to stdout/stderr with timestamp, level, request ID;
  sensitive keys are redacted. Security events are tagged `security.*`.
- **Audit trail** (`audit_logs` table): actor, clinic, action, resource, IP, request ID, small
  non-sensitive metadata. Append-only by design; enforce it in the database with
  `scripts/db/audit-log-immutability.sql`.

### Security baseline

Nonce-based CSP (scripts) set per request in `frontend/src/proxy.ts`; HSTS (prod), `X-Frame-Options: DENY`,
`nosniff`, strict referrer and permissions policies in `frontend/next.config.ts`; Origin check for mutating
Route Handlers (Server Actions are checked by Next.js); open-redirect-safe callback URLs; Prisma
parameterized queries; `verifyHmacSignature` helper for future webhooks
(`backend/src/lib/security/webhook.ts`). Patient documents must go to private object storage — never `frontend/public/`.

---

## Known limitations / next steps

- `X-Forwarded-For` is trusted for client IPs (rate limiting, audit). Deploy behind a proxy/platform
  that sets it; otherwise IP-based limits can be bypassed (per-email limits still apply).
- Cache Components is disabled deliberately (per-user medical data); all pages render per request.
- `next-auth` v5 is still published as a beta; it is pinned to `5.0.0-beta.32`.
- No MFA yet — recommended next step for admin roles.
- Integration and E2E tests require a MySQL database (see Scripts).
