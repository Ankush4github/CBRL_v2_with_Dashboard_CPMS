# CBRL — Website, Content Dashboard & CPMS

Official web platform for the **Clinical Biomarker Research Laboratory (CBRL)** at the
**Indian Institute of Technology Kharagpur**, led by **Prof. Koel Chaudhury**.

🔗 **Live:** [cbrl.iitkgp.ac.in](https://cbrl.iitkgp.ac.in)

---

## Contents

- [What this repository contains](#what-this-repository-contains)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [1 · The public site](#1--the-public-site)
- [2 · The content dashboard (`/admin`)](#2--the-content-dashboard-admin)
- [3 · CPMS (`/cpms`)](#3--cpms-cpms)
- [The content model](#the-content-model)
- [Security model](#security-model)
- [Supabase](#supabase)
- [npm scripts](#npm-scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Troubleshooting](#troubleshooting)

---

## What this repository contains

**One Next.js application, one Node process, three distinct areas.**

| Area | Path | Who uses it | What it is |
|------|------|-------------|------------|
| **Public site** | `/` | Anyone | The lab's research, publications, team, facilities and gallery |
| **Content dashboard** | `/admin` | Lab editors | Edit every page of the site without touching code |
| **CPMS** | `/cpms` | Clinicians & staff | Clinical Patient Management System — patient records, prescription scanning, attendance |

This used to be two applications. CPMS ran as a second Next project on port 8080, with its
own build, its own `node_modules`, its own PM2 entry and an Apache `ProxyPass`. It is now a
route subtree at `src/app/cpms`.

**What that costs, stated plainly:** the three areas no longer fail independently. A bad
deploy or a crash takes down the public site and the patient system together, and every CPMS
change requires rebuilding and restarting the website.

**What it does not change is the security boundary.** CPMS still gets its own
Content-Security-Policy and its own `Permissions-Policy` — camera and geolocation granted
there, denied everywhere else — from a second header block in `next.config.js`. That split is
load-bearing; see [Security model](#security-model).

---

## Architecture

```
                                    ┌─────────────────────────────────────┐
                                    │  Next.js 16 · one Node process      │
                                    │                                     │
  Browser ──▶ Apache ──▶ PM2 ──────▶│  /        public site (static)      │
              (443)     (supervisor)│  /admin   content dashboard         │
                                    │  /cpms    clinical app              │
                                    │  /api/admin/*  dashboard endpoints  │
                                    │                                     │
                                    │  listens on 127.0.0.1:3200          │
                                    └──────────────┬──────────────────────┘
                                                   │
                                    ┌──────────────▼──────────────────────┐
                                    │  Supabase (one project)             │
                                    │                                     │
                                    │  auth          Google OAuth         │
                                    │  site_content  editable page copy   │
                                    │  site_editors  dashboard grants     │
                                    │  patient_*     clinical records     │
                                    │  storage       site-media (public)  │
                                    │                prescriptions (priv) │
                                    │  edge fns      OCR, push, mail, pdf │
                                    └─────────────────────────────────────┘
```

**Row-level security is the entire boundary** between a website editor and clinical data.
The application holds only Supabase's *publishable* key — never a service-role key — so the
worst an attacker gains from compromising the site is what an anonymous visitor already has.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org/) — App Router, Turbopack |
| **Language** | TypeScript 5.3 |
| **UI** | React 19, Tailwind CSS 3.4 |
| **Components** | shadcn/ui — Radix UI primitives + CVA |
| **Icons** | Lucide React (React Icons for social share) |
| **Fonts** | Inter (site), Space Grotesk + Space Mono (CPMS) — self-hosted via `next/font` |
| **Database & auth** | Supabase — Postgres, RLS, Google OAuth, Storage, Edge Functions |
| **Server data access** | `@supabase/ssr` (cookie sessions), `@supabase/supabase-js` |
| **Client data (CPMS)** | TanStack Query 5 |
| **Forms / mail** | EmailJS (contact form, client-side), Resend (CPMS reminder mail) |
| **Images** | Next.js Image + Sharp re-encoding to WebP |
| **Prescription OCR** | Google Gemini, via a Supabase Edge Function |
| **Notifications** | Web Push (VAPID) + Supabase Realtime |
| **Toasts** | Sonner |
| **Analytics** | Google Analytics (gtag.js, deferred) |
| **Process manager** | PM2 |
| **Reverse proxy** | Apache (`mod_proxy`, `mod_headers`, `mod_ssl`) |

---

## Quick start

### Prerequisites

- **Node.js ≥ 20.9** — required by Next.js 16. The project is built and tested on **22.x**
- **npm** (the committed lockfile is `package-lock.json`)
- Access to the lab's Supabase project, or one of your own

### Install and run

```bash
git clone https://github.com/Ankush4github/CBRL_v2_with_Dashboard_CPMS.git
cd CBRL_v2_with_Dashboard_CPMS

npm ci                       # exact locked versions — prefer over `npm install`
cp .env.example .env.local   # then fill it in (see below)

npm run dev
```

Everything runs at **`http://localhost:3200`** — the same port the production build uses, so
URLs match in every environment:

| | |
|---|---|
| Public site | http://localhost:3200 |
| Dashboard | http://localhost:3200/admin |
| CPMS | http://localhost:3200/cpms |

There is no second server to start for CPMS.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is gitignored — **never
commit real values.**

### Required

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Read **twice** at build time: inlined into the client bundle, and used by `next.config.js` to name the Supabase origin in both CSPs |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key. **Only ever this one** — see below |
| `ADMIN_SESSION_SECRET` | Signs the dashboard activity cookie. ≥ 16 characters of randomness; admin requests throw without it. Changing it signs every editor out |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **Only the publishable key, here or anywhere.** Row-level security is what separates
> website editors from patient records, and a service-role key bypasses RLS entirely. It must
> never appear in the application's environment.
>
> `scripts/migrate-content-to-supabase.mts` needs one exactly once, passed on the command
> line so it never lands in a file.

### Contact form

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_EMAILJS_SERVICE_ID` | Without these three the form renders but submission fails |
| `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID` | |
| `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY` | |

### Dashboard networking

| Variable | Default | Purpose |
|----------|---------|---------|
| `TRUSTED_PROXY_HOPS` | `1` | How many reverse proxies sit in front of Node. `1` behind Apache/nginx; `0` if Node is exposed directly and `X-Forwarded-For` should be ignored entirely. The client address is read this many entries from the **right** of `X-Forwarded-For`, because everything to the left of the proxy's own entry is caller-supplied and can say anything |
| `ADMIN_ORIGIN` | derived | Pins the origin dashboard writes must come from. Leave unset to derive it from `X-Forwarded-Proto` / `X-Forwarded-Host` |
| `ADMIN_ALLOWED_IPS` | unset | Optional allowlist (comma-separated IPs and CIDR, v4 and v6) restricting `/admin` and `/api/admin`. The public site is unaffected. **Check `/api/admin/whoami` first so you do not lock yourself out** |
| `ADMIN_IDLE_TIMEOUT_MINUTES` | `5` | Sliding idle timeout. The absolute 8-hour cap is not configurable |

Confirm `TRUSTED_PROXY_HOPS` after deploying: `GET /api/admin/whoami` must report your real
address **even when you send a forged `X-Forwarded-For` header**.

### ⚠️ The build-time trap

Every `NEXT_PUBLIC_*` value is **inlined into the client bundle when `next build` runs**.
Setting one in PM2's `env_production`, in a systemd unit, or in the shell afterwards has *no
effect* — the old value is already compiled into the JavaScript browsers download.

**Changing any `NEXT_PUBLIC_*` value means rebuilding, not restarting.** Server-side values
(`ADMIN_SESSION_SECRET`, `TRUSTED_PROXY_HOPS`, `ADMIN_ALLOWED_IPS`, `ADMIN_ORIGIN`) are read
at runtime, so a restart is enough for those.

### CPMS back-end secrets are *not* Next environment variables

Nothing in `src/` reads any of the values below. They are consumed by **Supabase Edge
Functions**, which run on Supabase, not on this server. Setting them in `.env.local` changes
nothing at runtime.

```bash
supabase secrets set GEMINI_API_KEY=… VAPID_PRIVATE_KEY=… --project-ref <project-ref>
```

| Secret | Used by |
|--------|---------|
| `GEMINI_API_KEY` | `extract-prescription` — prescription OCR |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `attendance-notifications`, `vapid-public-key` — web push |
| `RESEND_API_KEY`, `ATTENDANCE_EMAIL_FROM` | attendance reminder mail. The `FROM` domain must be verified in Resend or every send is refused |
| `CRON_SECRET` | guards the scheduled attendance endpoint |
| `APP_URL` | deep-link base for reminder mail and push. Must be `https` **and include the `/cpms` sub-path** — those links open patient screens |

---

## Project structure

```
content/                       # Migration seed + offline fallback (NOT the source of truth)
├── members.json               # Faculty, postdocs, scholars, staff, alumni
├── projects.json              # Ongoing projects, completed-projects PDF, sponsors
├── research.json              # Research areas and their disease topics
├── gallery.json               # Albums and categories
├── facilities.json            # Instruments, in-charges, stats, slot charges
└── .backups/                  # Rolling snapshots (gitignored)

docs/
├── DEPLOYMENT-SIMPLE-GUIDE.md # Beginner-friendly deployment runbook
├── DEPLOYMENT-LINUX-PM2.md    # Condensed technical runbook
├── CPMS-MERGE-PLAN.md         # Record of folding CPMS into this app
└── documentation.html         # Generated project documentation

shared/
└── supabase-types.ts          # Generated database types, shared by all three areas

src/
├── app/
│   ├── layout.tsx             # Root shell: html/body, fonts, theme provider
│   │
│   ├── (site)/                # ── THE PUBLIC WEBSITE ──
│   │   ├── layout.tsx         # Nav, footer, analytics, site-wide JSON-LD
│   │   ├── page.tsx           # Homepage (hero carousel, mission, collaborators)
│   │   ├── about-the-pi/      # Prof. Koel Chaudhury's profile
│   │   ├── research/          # Research areas
│   │   ├── projects/          # Funded research projects
│   │   ├── publications/      # Peer-reviewed publications (parsed from BibTeX)
│   │   ├── members/           # Lab team
│   │   ├── facilities/        # Equipment & instruments
│   │   ├── gallery/           # Photo gallery
│   │   ├── contact/           # Contact form (EmailJS)
│   │   └── not-found.tsx      # 404
│   │
│   ├── admin/                 # ── CONTENT DASHBOARD ──
│   │   ├── login/             # Google sign-in
│   │   ├── auth/callback/     # OAuth return
│   │   └── (dashboard)/       # Sidebar shell + one editor per section
│   │       ├── home/  about/  members/  research/
│   │       └── projects/  publications/  gallery/  facilities/  metrics/
│   │
│   ├── cpms/                  # ── CLINICAL APP ──
│   │   ├── page.tsx           # Sign-in
│   │   ├── onboarding/        # First-run setup
│   │   ├── dashboard/         # Clinician home
│   │   ├── patients/          # List, [id] detail, timeline
│   │   ├── scan/              # Prescription capture → Gemini OCR
│   │   ├── attendance/        # Geolocation check-in
│   │   ├── help/
│   │   └── admin/             # users/  hospitals/  attendance/
│   │
│   ├── api/admin/             # ── DASHBOARD ENDPOINTS ──
│   │   ├── content/[collection]/   # Read & write a content collection
│   │   ├── publications/           # + /[id] and /doi (add by DOI)
│   │   ├── upload/                 # Image upload → Sharp → WebP → site-media
│   │   ├── metrics/                # Citation figures
│   │   ├── heartbeat/              # Keeps the activity cookie sliding
│   │   ├── whoami/                 # Reports the client IP the app actually saw
│   │   └── logout/
│   │
│   ├── globals.css            # Tailwind layers + CSS variables
│   ├── robots.ts              # SEO robots.txt
│   └── sitemap.ts             # SEO sitemap.xml
│
├── proxy.ts                   # Auth gate on /admin and /api/admin
│
├── components/
│   ├── PageHeader.tsx         # Shared editorial page header (h1 band)
│   ├── Navigation.tsx         # Main nav + theme toggle
│   ├── HeroCarousel.tsx       # Homepage hero
│   ├── admin/                 # Dashboard shell, form fields, save bar
│   ├── cpms/                  # CPMS pages and its own ui/ primitives
│   └── ui/                    # shadcn/ui primitives
│
├── hooks/cpms/                # useAuth, useHospitals, …
├── context/                   # ThemeContext (dark mode)
├── lib/
│   ├── content.ts             # Server-side content read/write (Supabase + disk fallback)
│   ├── content-schema.ts      # Validation for every collection
│   ├── content-types.ts       # Shapes safe to import from client code
│   ├── admin-auth.ts          # Activity cookie, idle timeout, absolute cap
│   ├── admin-network.ts       # Proxy-hop-aware client IP, IP allowlist
│   ├── site-editor.ts         # The site_editors grant check
│   ├── bibtex-parser.ts       # BibTeX → publication records
│   ├── supabase/              # Server, browser and public clients
│   └── cpms/                  # CPMS domain logic, incl. errors.ts
│
├── styles/                    # Critical, dark-mode and compat CSS
├── assets/                    # Inline SVG
└── utils/

supabase/
├── migrations/                # 53 SQL migrations — schema, RLS, triggers, grants
└── functions/
    ├── _shared/
    ├── extract-prescription/       # Gemini OCR
    ├── generate-patient-pdf/       # Patient record PDF
    ├── attendance-notifications/   # Web push + reminder mail
    ├── send-test-attendance-email/
    └── vapid-public-key/           # Serves the public key so browsers can subscribe

public/
├── images/                    # Facilities, gallery, team, logos, og/
├── data/                      # publications.bib, metrics.json, completed-projects PDF
└── …                          # Favicons, manifest, service worker, theme-init.js

scripts/
├── migrate-content-to-supabase.mts  # One-time content/*.json → site_content
├── optimize-images.js               # Bulk image optimisation
└── test-*.mts                       # See Testing

ecosystem.config.js           # PM2 — WINDOWS ONLY. Linux needs its own; see docs
```

---

## 1 · The public site

Server-rendered and statically generated. Pages read the `site_content` table with the
publishable key and **no session**, which is what keeps them static.

| Page | Source of its content |
|------|----------------------|
| Homepage | `site_content` → `home` |
| About the PI | `site_content` → `about` |
| Research | `site_content` → `research` |
| Projects | `site_content` → `projects` |
| Members | `site_content` → `members` |
| Facilities | `site_content` → `facilities` (in-charges resolved from `members`) |
| Gallery | `site_content` → `gallery` |
| Publications | `public/data/publications.bib`, parsed at build; edited one entry at a time |
| Citation metrics | `site_content` → `metrics`, with OpenAlex for live figures |
| Contact | Static, submits via EmailJS from the browser |

---

## 2 · The content dashboard (`/admin`)

Sign in at `/admin` to edit the site without touching code. Sign-in is **Google via
Supabase**, and `src/proxy.ts` gates every `/admin` page and `/api/admin` endpoint.

**Two separate things must be true to get in:** a valid Google session **and** a row in
`public.site_editors`. Anyone can create an account on the Supabase project by signing in
with Google — that grants nothing on its own.

| Section | What it edits |
|---------|---------------|
| **Home** | Hero slides, mission, collaborators |
| **About the PI** | Profile, positions, honours |
| **Members** | All five groups — add, reorder, remove, upload photos, profile links |
| **Publications** | Add by DOI, paste BibTeX, or fill the form; edit and delete entries |
| **Projects** | Ongoing projects, objectives, the completed-projects PDF, sponsor logos |
| **Research areas** | Areas, disease topics, and their paragraphs |
| **Gallery** | Albums, categories, cover image, bulk photo upload |
| **Facilities** | Instruments, features, in-charges, headline figures, slot charges |
| **Citation metrics** | Citations, h-index, source link, last-updated date |

### How a save reaches the live site

A save writes the `site_content` row and calls `revalidatePath()` on the pages that depend on
it. **The change is live on the next request — no rebuild, no redeploy.**

### Safety

- Every save **validates the whole document first** — a bad email or an off-site image path
  is rejected before anything is written.
- The previous version of the row is snapshotted into `site_content_versions` by a database
  trigger, which keeps **the last 20 per collection**.
- Publications are edited **one entry at a time**, so fields the public page does not render
  (`keywords`, `issn`, `abstract`) survive untouched — as does every other entry in the file,
  byte for byte.

### Images

Uploads are re-encoded to WebP, resized, given a **content-hashed filename**, and stored in
the `site-media` Supabase bucket with a one-year immutable cache — so a replaced photo has to
arrive at a new URL to be seen. Images committed under `public/images/` still work and are
still referenced by existing content; nothing had to be migrated.

### Granting dashboard access

Only a CPMS **master** can appoint an editor. The account must have signed in to the Supabase
project at least once, so that `auth.users` has a row for it:

```sql
insert into public.site_editors (user_id, granted_by, note)
select u.id, auth.uid(), 'Website content editor'
from auth.users u
where u.email = 'person@example.com';
```

Revoke by setting `is_enabled = false` (keeps the audit trail) or deleting the row. Either
takes effect on the editor's next request.

### First-time setup

1. Add `https://cbrl.iitkgp.ac.in/admin/auth/callback` to **Supabase → Authentication → URL
   Configuration → Redirect URLs**, or Google returns a redirect mismatch. Add
   `http://localhost:3200/admin/auth/callback` too for local work.
2. Grant the first editor with the SQL above.

---

## 3 · CPMS (`/cpms`)

The Clinical Patient Management System. Served by the same process, under its own layout,
theme and security headers.

| Screen | What it does |
|--------|--------------|
| **Dashboard** | Clinician home; notification bell driven by Supabase Realtime |
| **Patients** | List, detail, and a per-patient timeline of records |
| **Scan prescription** | Camera capture → `extract-prescription` Edge Function → Gemini OCR → reviewable fields |
| **Attendance** | Geolocation check-in, geofenced and working-hours enforced in the database |
| **Attendance reports** | Per-user and per-period reporting |
| **User management** | Roles and permissions (master / staff) |
| **Hospital management** | Hospitals and their geofences |
| **Onboarding** | First-run setup for a new account |

**Documents** — prescription scans and patient files are fetched with
`supabase.storage.download()` and rendered as **object URLs**, never as direct links. The
`prescriptions` bucket is private, and the Supabase origin is deliberately absent from CPMS's
`img-src`, so no signed storage URL can be dropped into an `<img>`. PDFs preview in an iframe
pointed at the same blob, which is why `frame-src` must include `blob:`.

**HTTPS is mandatory.** Geolocation, `getUserMedia` (camera) and Web Push are all blocked by
browsers outside a secure context. Over plain HTTP, attendance, scanning and notifications
fail outright rather than degrading.

---

## The content model

Editable content lives in the **`site_content` table**, not on disk.

It used to live in `content/*.json`, which tied it to the deployment artifact: those files are
tracked in git, so a deploy overwrote anything the dashboard had saved since the last commit,
and uploaded images landed in a directory the next release replaced. **Content in the database
means a redeploy from a stale checkout can no longer overwrite an editor's work** — that is
the main reason for moving it.

| | |
|---|---|
| **Reads** | Publishable key, no session. `site_content` is world-readable because the site it renders is public — which is what keeps pages statically generated |
| **Writes** | The **editor's own session**. The `is_site_editor()` check in the table's RLS policy is what authorises them |
| **Fallback** | If the database is unreachable, reads fall back to the committed copy in `content/*.json` and log a warning naming the collection |

The fallback exists because Supabase projects on the free tier pause after inactivity, and a
network blip during a deploy should not fail the build or render an empty site. **It is only
as fresh as the last commit**, so a warning in the build log is worth acting on.

Collections: `home`, `about`, `members`, `research`, `projects`, `gallery`, `facilities`,
`metrics`, plus `publications` (BibTeX, in `public/data/`).

---

## Security model

### Dashboard

| Layer | What it does |
|-------|--------------|
| **Identity** | Google via Supabase. `getUser()` on every gated request, which revalidates the token against the auth server rather than trusting the cookie |
| **Authorisation** | A row in `public.site_editors`. Checked at the gate **and** re-checked by RLS on every write, so the gate is not the only thing standing between an account and the data |
| **Activity cookie** | HMAC-SHA256 signed, `httpOnly`, `Secure`, `__Host-cbrl_admin_session` in production. Carries a sliding 5-minute idle timeout and a fixed 8-hour cap — neither of which Supabase provides, since it refreshes its own token indefinitely |
| **Origin check** | Writes to `/api/admin/*` must carry an `Origin` matching the site. `SameSite=Lax` alone is not enough: it counts every `*.iitkgp.ac.in` host as same-site |
| **IP allowlist** | Optional `ADMIN_ALLOWED_IPS`, applied to the sign-in flow too. The public site is untouched |
| **Uploads** | Re-encoded through Sharp to `.webp`. Anything Sharp cannot decode is refused — the caller's `Content-Type` and filename are never trusted. The bucket accepts `image/webp` only, so even a bug in the route cannot land a caller-chosen file type in a public bucket |
| **Writes** | Validated before anything is stored; previous 20 versions per collection retained by trigger |

There is no shared dashboard password and no login throttle — Google owns authentication.

### Sharing one Supabase project between the dashboard and CPMS

The dashboard and the patient system are now the same application **and the same Node
process**, which makes this more important rather than less: **row-level security is the
entire boundary.**

- **This application holds only the publishable key.** Adding a service-role key would undo
  the whole model: it bypasses RLS, so a bug or an RCE in the website would become full access
  to clinical data.
- **A website editor has no clinical access.** Every clinical policy is gated on
  `user_is_enabled()`, which is `COALESCE(…, false)` and so false for an account holding only
  a `site_editors` grant. Verified against the live database with an authenticated session
  that has no roles or permissions:

  ```
  patient_records      -> blocked      hospitals          -> blocked
  patient_record_audit -> 0 rows       attendance_records -> 0 rows
  profiles             -> own row only
  ```

- **The grant is a separate table, not a new `app_role`.** `handle_new_user` hardcodes
  `'staff'` and `get_user_role` is a CASE ladder over the enum; a new label would have to be
  reasoned about against every existing policy. A table they have never heard of cannot widen
  any of them.
- **Signing out is `scope: 'local'`.** The default would revoke the account's refresh tokens
  everywhere, ejecting a clinician from CPMS mid-shift.
- **Website editors appear in CPMS's user list.** `handle_new_user` creates a `profiles` row
  for every new account, so an editor shows up with the default `staff` role and no
  permissions. Cosmetic, but expected rather than a bug.

### Two Content-Security-Policies on one hostname

`next.config.js` serves **different** headers to `/cpms` than to everything else. This is by
design and is load-bearing:

| Directive | Public site | CPMS |
|-----------|-------------|------|
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | `geolocation=(self), camera=(self), microphone=()` |
| `connect-src` | EmailJS, OpenAlex, Google Analytics, Supabase | Supabase **+ its `wss:` form** (Realtime) |
| `img-src` | `self data: blob:`, GA, Supabase | `self data: blob:`, `lh3.googleusercontent.com` — **no Supabase origin** |
| `frame-src` | `https://www.google.com` (embedded map) | `'self' blob:` (PDF previews) |

The site block excludes `/cpms` explicitly (`source: '/:path((?!cpms$|cpms/).*)'`). A union of
the two would hand the public site camera and geolocation access and hand CPMS the analytics
origins — the opposite of what either should get.

> ⚠️ **Never add these headers at the Apache level.** An Apache-level `Permissions-Policy`
> would flatten the distinction and break attendance check-in and prescription scanning.

---

## Supabase

### Migrations

53 SQL migrations under `supabase/migrations/` cover the schema, RLS policies, triggers and
function grants for both the website content tables and the clinical tables.

```bash
supabase db push --project-ref <project-ref>          # apply
supabase gen types typescript --project-ref <ref> > shared/supabase-types.ts
```

### Edge Functions

| Function | Purpose |
|----------|---------|
| `extract-prescription` | Sends a captured prescription to Gemini and returns structured fields |
| `generate-patient-pdf` | Renders a patient record to PDF |
| `attendance-notifications` | Web push + reminder mail; guarded by `CRON_SECRET` when scheduled |
| `send-test-attendance-email` | Diagnostic for the mail path |
| `vapid-public-key` | Serves the VAPID public key so browsers can create a push subscription |
| `_shared` | Shared helpers |

```bash
supabase functions deploy extract-prescription --project-ref <project-ref>
supabase secrets list --project-ref <project-ref>
```

### Redirect URLs

Both callbacks must be registered under **Authentication → URL Configuration → Redirect
URLs**, or Google returns a redirect mismatch:

```
https://cbrl.iitkgp.ac.in/admin/auth/callback     # dashboard
https://cbrl.iitkgp.ac.in/cpms/dashboard          # CPMS
```

---

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Dev server on port 3200 — site, `/admin` and `/cpms` |
| `npm run build` | Production build. Expect ~24 routes across all three areas |
| `npm start` | Serve the production build on port 3200 |
| `npm run lint` | ESLint over `src` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Network, error-message and upload-validation suites |
| `npm run test:network` | Dashboard network behaviour |
| `npm run test:errors` | Error messages stay generic and leak nothing |
| `npm run test:uploads` | Upload validation and re-encoding |
| `npm run test:api` | API response shapes |
| `npm run optimize-images` | Bulk image optimisation |
| `npm run migrate:content` | One-time `content/*.json` → `site_content` |

---

## Testing

The suites in `scripts/` exercise the dashboard's security posture rather than its UI —
they assert that error messages stay generic, that uploads cannot smuggle a file type past
Sharp, and that no response leaks a stack trace, a Postgres `sqlstate`, a local filesystem
path, or the strings `service_role` / `patient_records`.

```bash
npm run dev     # in one terminal — the suites drive a running server
npm test        # in another
```

---

## Deployment

The site runs from a normal `next build` under PM2, behind Apache, on
`https://cbrl.iitkgp.ac.in`.

| Guide | For whom |
|-------|----------|
| **[`docs/DEPLOYMENT-SIMPLE-GUIDE.md`](docs/DEPLOYMENT-SIMPLE-GUIDE.md)** | A step-by-step runbook in plain language — 16 steps, each with the command and how to tell it worked. Start here if you are not a Linux regular |
| **[`docs/DEPLOYMENT-LINUX-PM2.md`](docs/DEPLOYMENT-LINUX-PM2.md)** | The same procedure, condensed for someone who knows Linux |

The short version:

```bash
sudo -u cbrl -i && cd /var/www/cbrl
git pull
npm ci                # only if the lockfile changed
npm run build
pm2 restart ecosystem.linux.config.js --env production --update-env
```

Apache needs no reload — it only proxies.

> ⚠️ **`ecosystem.config.js` in this repository is Windows-only.** It runs `next.cmd` through
> `cmd.exe`, because `.cmd` shims are not executable by Node, and it will not start on Linux.
> Create `ecosystem.linux.config.js` as the deployment guides describe — critically with
> `-H 127.0.0.1`, without which port 3200 answers on every interface and clients can bypass
> TLS entirely.

---

## Conventions

### Page layout

Every interior page opens with the shared `<PageHeader>` component — an eyebrow, `<h1>`, and
lead paragraph in a full-bleed band (`py-16 sm:py-20`) closed by a hairline rule. It supplies
its own `container mx-auto px-4 sm:px-6`, so pages render it **outside** their own container
and let it own the top spacing.

All containers site-wide use `px-4 sm:px-6`, so every page shares one left edge.

The homepage and About-the-PI pages are the deliberate exceptions: both open with an image
hero instead, aligned to the same left edge and vertical rhythm.

### Server-only modules

`src/lib/content.ts` must never be imported from a `'use client'` module. Client code wanting
the shapes should import `src/lib/content-types.ts` instead.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `502` on everything | The Node process is down | `pm2 list`, then `pm2 logs cbrl --lines 50` |
| `503` on RHEL/Rocky | SELinux blocks Apache's outbound connection | `sudo setsebool -P httpd_can_network_connect 1` |
| `/cpms` returns `503`, rest of site fine | A leftover `ProxyPass /cpms` to port 8080 from the two-app layout | Delete those lines from the vhost |
| Camera/geolocation dead in CPMS | An Apache header block overriding the app's `Permissions-Policy` | Remove it; the app sets its own per-path |
| Sign-in fails everywhere, CSP blocks Supabase | `NEXT_PUBLIC_SUPABASE_URL` was unset **at build time** | Fix `.env.local`, then **rebuild** — a restart will not do it |
| A key change had no effect | `NEXT_PUBLIC_*` is inlined at build time | Rebuild, do not restart |
| Dashboard saves fail: *"did not come from the dashboard"* | `X-Forwarded-Proto` missing, or `ADMIN_ORIGIN` wrong | Add the `RequestHeader` lines, or pin `ADMIN_ORIGIN` |
| *"not available from your network"* on `/admin` | `ADMIN_ALLOWED_IPS` excludes you | Check `/api/admin/whoami`; the 403 names the address it saw |
| Signed out every few minutes | `ADMIN_IDLE_TIMEOUT_MINUTES` defaults to 5 | Raise it, restart |
| Everyone signed out after a deploy | `ADMIN_SESSION_SECRET` changed | Keep it stable across deploys |
| Apps gone after a reboot | `pm2 save` not re-run, or `nvm`-installed Node | See the deployment guides |
| Local production build over plain HTTP: every asset fails with `ERR_FAILED` after the first page load | Not a bug. `/sw.js` inherits the site CSP with `upgrade-insecure-requests`, so the service worker's own `fetch()` is upgraded to `https://` and cannot reach an `http://` dev server | Cannot happen over HTTPS. Locally, bypass the worker in DevTools → Application → Service Workers, or use an incognito window |

---

## Credits

Built for the **Clinical Biomarker Research Laboratory**, School of Medical Science and
Technology, **IIT Kharagpur** — omics-driven biomarker discovery and insights into the
pathogenesis of diseases of complex etiology.

Principal Investigator: **Prof. Koel Chaudhury**.
