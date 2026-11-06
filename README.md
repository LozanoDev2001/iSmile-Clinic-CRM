# iSmile Clinic CRM

A customer relationship management system for iSmile Dental Clinic. It brings patient inquiries from Facebook, Instagram, WhatsApp, Viber, and other channels into one inbox, then tracks each one from first message to booked dental appointment — with follow-ups, staff assignment, and conversion reports.

![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

> **Status:** early development. The foundation (staff accounts, roles, branches, patient records, audit trail) is in place; the CRM modules below are on the roadmap.

---

## Table of contents

- [Roadmap](#roadmap)
- [Supported channels](#supported-channels)
- [Lead pipeline](#lead-pipeline)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [User roles](#user-roles)
- [Contributing](#contributing)
- [Data privacy](#data-privacy)
- [License](#license)

---

## Roadmap

| Module | Status |
|---|---|
| Staff accounts, invites, password reset | ✅ Done |
| Roles, permissions, multi-branch access | ✅ Done |
| Patient records | ✅ Done |
| Audit trail | ✅ Done |
| Unified inbox | 🔜 Planned |
| Lead capture & pipeline | 🔜 Planned |
| Follow-ups & tasks | 🔜 Planned |
| Appointments | 🔜 Planned |
| Reports | 🔜 Planned |

**Unified inbox**
- Messages from Facebook Messenger, Instagram DMs, WhatsApp, Viber, and other channels in one place
- Reply to patients without switching apps
- Saved reply templates (prices, clinic hours, location, promos, aftercare)

**Lead capture**
- New conversations automatically create a lead and contact
- Leads also added from phone calls, walk-ins, website forms, and referrals
- Source and campaign tagging, so you know which ad or post brought the inquiry
- Duplicate detection by phone number across channels

**Dental treatment interest**
- Tag leads by treatment: cleaning, braces, clear aligners, whitening, veneers, implants, extraction, root canal, dentures, pediatric dentistry
- Filter and report by treatment

**Pipeline management**
- Kanban board of leads by stage
- Won/lost tracking with lost reasons (price, distance, no reply, chose another clinic)

**Follow-ups & tasks**
- Follow-up tasks with due dates, assigned to staff
- Today, overdue, and upcoming views
- Reminders for unanswered leads and leads stuck in a stage
- Recall lists for cleanings, adjustments, and check-ups

**Appointments**
- Book consultations and treatments directly from a conversation
- Branch and dentist assignment
- Show / no-show tracking

**Team**
- Manual or round-robin assignment to front desk staff
- Internal notes (not visible to the patient)
- Workload view per staff member

**Reports**
- Inquiries by channel, source, and campaign
- Conversion rate per stage and per channel
- First response time
- Most requested treatments
- Staff performance

---

## Supported channels

Planned integrations:

| Channel | Type |
|---|---|
| Facebook Messenger | Meta messaging |
| Instagram | Meta messaging |
| WhatsApp | WhatsApp Business Platform |
| Viber | Viber bot |
| Facebook Lead Ads | Lead form |
| Website | Contact / booking form |
| Phone, walk-in, referral | Manual entry |

---

## Lead pipeline

Planned default stages (configurable):

```
New Inquiry → Replied → Consultation Booked → Consultation Done → Treatment Accepted → Won
                                                                                     ↘ Lost
```

| Stage | Meaning |
|---|---|
| New Inquiry | Message received, not yet replied to |
| Replied | Staff has responded |
| Consultation Booked | Dental consultation scheduled |
| Consultation Done | Patient attended the consultation |
| Treatment Accepted | Patient agreed to a treatment plan |
| Won | Converted to a paying patient |
| Lost | Did not convert (reason recorded) |

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), React |
| Language | TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| ORM | Prisma |
| Database | MySQL / MariaDB |
| Auth | Auth.js |
| Testing | Vitest, Playwright |

---

## Getting started

**Prerequisites:** Node.js 20.9+, npm, MySQL 8+ or MariaDB 10.6+

```bash
npm install
cp .env.example .env   # fill in your own values — never commit .env
npm run db:migrate
npm run db:seed        # optional: sample clinic and staff accounts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `start` | Build and run for production |
| `npm run lint` / `typecheck` | Lint and type-check |
| `npm run test` | Run tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Browse the database |

---

## User roles

| Role | Access |
|---|---|
| Super Admin | Full access |
| Clinic Admin | All branches of their clinic: patients, appointments, staff, settings, reports, audit log |
| Dentist | Assigned patients (including medical records), their appointments and treatments |
| Receptionist | Patients and appointment booking in their branches |
| Finance Staff | Billing and financial reports |
| CRM Staff | Leads |

---

## Contributing

1. Branch from `main`: `git checkout -b feature/short-description`
2. Commit with clear messages
3. Run `npm run lint` and `npm run typecheck` before pushing
4. Open a pull request for review

---

## Data privacy

This system stores patient names, contact details, message history, and dental information. Keep credentials private, restrict database access, take regular backups, and comply with applicable data privacy laws (e.g. the Philippine Data Privacy Act of 2012) and each messaging platform's policies.

---

## License

Private project. All rights reserved. © iSmile Dental Clinic.
