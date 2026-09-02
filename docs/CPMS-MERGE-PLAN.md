# Merging CPMS into the CBRL app

Plan to collapse the two Next processes (`.` on :3200 and `cpms-next/` on :8080)
into a single Next application, deployed as one PM2 app, with no change to any
public URL.

Written 2026-08-30 against commit `d1499e3`.

---

## The finding that sizes this job

The obvious blocker is React: CBRL is on 19.2, CPMS pins 18.3.1, and one app
means one React. The packages that refuse React 19 are `react-day-picker@8`
(peer: react 16–18) and `vaul@0.9`.

Both are dead code.

**30 of CPMS's 49 shadcn components are unreachable from any route**, and every
React-19-hostile dependency lives only in those dead files.

Established by transitive import closure from the `app/**` entry points, not a
flat grep — a flat grep cannot tell a live component from one imported only by
another dead component. The two false positives that closure surfaced are worth
recording, because both would have been damaging: `react-dom` (never imported
by name, required by Next) and `tailwindcss-animate` (a Tailwind *plugin*,
loaded by `require()` in `tailwind.config.ts`, which is not part of the import
graph). Neither was removed.

Live (19):
`accordion, alert-dialog, badge, button, card, dialog, input, label, popover,
progress, scroll-area, select, sonner, switch, table, textarea, toast, toaster,
tooltip`.

Note that `components/ui/use-toast.ts` is itself dead — a two-line re-export
shim with no callers. Every consumer imports `@/hooks/use-toast` directly, and
that file stays.

Dead, and the dependencies they carry out with them:

| Dead component | Dependency freed |
|---|---|
| `calendar.tsx` | `react-day-picker@8` — **React 19 blocker** |
| `drawer.tsx` | `vaul@0.9` — **React 19 blocker** |
| `form.tsx` | `react-hook-form`, `@hookform/resolvers`, `zod` |
| `chart.tsx` | `recharts` |
| `command.tsx` | `cmdk` |
| `carousel.tsx` | `embla-carousel-react` |
| `resizable.tsx` | `react-resizable-panels` |
| `input-otp.tsx` | `input-otp` |
| `alert, aspect-ratio, avatar, breadcrumb, checkbox, collapsible, context-menu, dropdown-menu, hover-card, menubar, navigation-menu, pagination, radio-group, separator, sheet, sidebar, skeleton, slider, tabs, toggle, toggle-group, use-toast` | 15 `@radix-ui/*` packages |

Delete those first and the React 18 → 19 upgrade becomes a version bump across
12 Radix packages plus `sonner`, `lucide-react` and `tailwind-merge`. That is
why Phases 1 and 2 below happen *before* anything moves, and inside
`cpms-next/` where they are trivially reversible.

Remaining non-Radix runtime deps in live CPMS code: `@tanstack/react-query`,
`sonner`, `date-fns` (one call, in `NotificationBell.tsx`), `next-themes`
(only `ui/sonner.tsx` reads it), `@supabase/supabase-js`.

---

## Invariants

These are assumptions the plan is built on. Say so if any is wrong — several
phases change shape if they are.

1. **URLs do not change.** Everything stays at `/cpms/*`. The Supabase OAuth
   redirect (`/cpms/dashboard`), the service-worker scope (`/cpms/`), and every
   existing bookmark depend on it.
2. **Two design systems stay separate.** The goal is one process and one build,
   not one design language. All 17 same-named components differ between the two
   trees, and the token *values* differ throughout (CBRL primary is blue
   `213 99% 47%`, CPMS is teal `168 76% 36%`; radius `0.625rem` vs `0.75rem`).
   Unifying them is a cosmetic project with visual-regression risk on both
   sides, and is out of scope.
3. **CPMS stays light-only**, exactly as today. It has no theme toggle and
   nothing ever sets the `.dark` class inside it; the `.dark` block in its
   `globals.css` is currently dead. Scoping (Phase 4) preserves this.
4. **Session storage is unchanged.** CPMS keeps `localStorage` sessions, the
   dashboard keeps `@supabase/ssr` cookies. They already coexist on this origin
   today. Unifying them is Phase 8 — optional, separable, and not required for
   the merge.

---

## Target structure

```
src/app/
  layout.tsx                  <html>, Inter, ThemeProvider, ServiceWorkerManager
  not-found.tsx               unchanged
  globals.css                 CBRL tokens + [data-app="cpms"] scoped CPMS tokens
  (site)/                     unchanged — GA lives in its layout, so /cpms is
  admin/                      unchanged        already outside analytics
  api/admin/                  unchanged
  cpms/
    layout.tsx                AppProviders + <div data-app="cpms"> + metadata
    page.tsx                  login          (was cpms-next/app/page.tsx)
    dashboard/ patients/ scan/ attendance/ help/ onboarding/ admin/
    not-found.tsx

src/components/ui/            site design system (unchanged)
src/components/cpms/          CPMS components — ui/ (20 files) + pages/ + rest
src/hooks/cpms/               useAuth, useRole, useHospitals, useInactivityTimeout, use-mobile, use-toast
src/lib/cpms/                 base-path, document-processor, geo, push, utils
src/lib/supabase/cpms-client.ts   was integrations/supabase/client.ts

public/cpms/                  cbrl-logo.png, favicon.png, placeholder.svg, sw.js
shared/supabase-types.ts      unchanged
```

Deleted: `cpms-next/` entirely, `shared-env.cjs`, `.env.shared`,
`cpms-next/DEPLOYMENT.md` (folded into `docs/DEPLOYMENT-LINUX-PM2.md`).

**Why CPMS is a plain nested route, not a second root layout.** Next allows
multiple root layouts only if `src/app/layout.tsx` is removed and every route
moves into a group. That would relocate `(site)/`, `admin/` and — the risk —
`not-found.tsx`, which commit `d1499e3` just fixed. A nested
`src/app/cpms/layout.tsx` inherits three things from the root layout, and each
is handled cheaply:

- **Inter font** — overridden by an explicit `font-family` in the `[data-app="cpms"]` scope.
- **ThemeProvider / `.dark` on `<html>`** — irrelevant once CPMS tokens are
  scoped to a descendant element (custom properties resolve to the nearest
  ancestor that declares them, so the scoped values win regardless of `.dark`).
- **`ServiceWorkerManager`** — genuinely needs a guard. It registers `/sw.js` at
  scope `/`; it must not run on CPMS pages. Add a `usePathname()` early-return.

Google Analytics needs no guard: it is in `src/app/(site)/layout.tsx:110`, not
the root layout, so `/cpms` (and `/admin`) are already outside it.

---

## Phases

Each phase is one commit on a `merge-cpms` branch. Phases 1–2 touch only
`cpms-next/` and are revertible without affecting the live site.

### Phase 0 — Baseline

- Branch from `main`. Note: the working tree currently has ~30 modified files
  and several untracked directories — commit or stash first, so the merge diff
  is readable.
- Record a working baseline of both apps: `npm run build:all`, then
  `npm run start:all`, and walk the verification checklist at the end of this
  document. Anything already broken must be known now, not discovered in Phase 5.

### Phase 1 — Delete dead code (still standalone) — **DONE**

- Delete the 30 unreachable files from `cpms-next/components/ui/`.
- Drop the freed dependencies from `cpms-next/package.json` (the table above:
  `react-day-picker`, `vaul`, `recharts`, `cmdk`, `embla-carousel-react`,
  `input-otp`, `react-resizable-panels`, `react-hook-form`,
  `@hookform/resolvers`, `zod`, and the 15 unused `@radix-ui/*`) — 25 packages,
  50 dependencies down to 25.
- Keep these 12 Radix packages: `accordion, alert-dialog, dialog, label,
  popover, progress, scroll-area, select, slot, switch, toast, tooltip`.

**Gate — met.** `npm run build` compiles, TypeScript passes, all 13 routes
build. Runtime smoke test on the production server: `/cpms` 200 with the correct
`<title>`, and `/cpms/dashboard`, `/cpms/scan`, `/cpms/attendance`,
`/cpms/admin/users` all 200. (Those pages render a loading spinner server-side —
their content is behind client-side auth guards reading `localStorage`. That is
pre-existing behaviour, not a Phase 1 regression.)

**Rollback:** `git revert` does *not* work — `cpms-next/` is untracked, so none
of this is in git history. A copy of all 49 original `ui/` files plus the
original `package.json` and lockfile is in the session scratchpad at
`phase1-backup/`. Committing `cpms-next/` is the durable fix and should happen
before Phase 2.

### Phase 2 — React 19 + strict-mode measurement (still standalone) — **DONE**

Bump `cpms-next/package.json` to match the root app:

| Package | From | To |
|---|---|---|
| `react`, `react-dom` | 18.3.1 | ^19.2.3 |
| `@types/react`, `@types/react-dom` | 18.x | ^19.2 |
| `lucide-react` | 0.462 | ^0.525 |
| `tailwind-merge` | ^2.6 | ^3.6 |
| `@supabase/supabase-js` | ^2.89 | ^2.111 |
| `sonner` | ^1.7 | ^2 |
| `next-themes` | ^0.3 | remove — see below |
| `@radix-ui/*` (the 12 kept) | mixed | latest |

`tailwind-merge` v2 → v3 is safe here: `cn()` is a plain `twMerge(clsx(...))`
with no custom config.

`next-themes` exists solely so `ui/sonner.tsx` can call `useTheme()`. There is
no `ThemeProvider` in `AppProviders`, so it already returns `undefined` and
CPMS is light-only by accident. Replace the call with a literal `"light"` and
drop the package — this makes Invariant 3 explicit rather than incidental.

**Also in this phase, measure the type-checking gap before committing to the
move.** `cpms-next/tsconfig.json` sets `strict: false` and
`noImplicitAny: false`; the root sets `strict: true`. After the merge there is
one tsconfig. Run the CPMS tree against the root's settings and count the
errors.

**Measured: 5 errors.** Small enough that the fallback (scoped
`@ts-expect-error`, burn down later) was unnecessary. `cpms-next/tsconfig.json`
is now `strict: true` with the `noImplicitAny: false` override removed, so the
remaining phases cannot regress it and Phase 6 inherits nothing to decide.

All five were one defect class: a Supabase column typed nullable by the
generated types, against a hand-written local interface that declared it
non-null. They were latent runtime bugs, not type noise:

- `Dashboard.tsx` — `filter(Boolean)` does not narrow, so `uploaderIds` stayed
  `(string | null)[]`. Runtime was already correct; a type predicate states it.
- `Dashboard.tsx` — `getTimeAgo(created_at)` with a null fell through to
  `new Date(null)`, the epoch, rendering the row as "20000 days ago". Now
  returns "Unknown".
- `ScanPrescription.tsx` — `PriorVisitSummary.created_at` widened to
  `string | null`. Selected by the query, never rendered.
- `UserManagement.tsx` and `useRole.tsx` — `can_scan` / `can_upload` /
  `is_enabled` are nullable columns. Both now collapse null to `false`, which is
  what `user_is_enabled()` and `user_can_scan()` already do via `COALESCE`.

That last one is a **deliberate behaviour change**: a null column previously
rendered as "Active" in the user table while every write it implied was refused
by the database. It now reads "Disabled", matching what is actually enforced.
`useRole` is unaffected in practice — its consumer already tested `=== true`.

**Gate — met.** Build compiles, TypeScript passes under `strict`, all 13 routes
build, and all 10 reachable URLs return 200 from the production server with no
server-side errors. Still to be exercised by hand in a browser, which a curl
cannot cover: camera (scan), geolocation (attendance check-in), toasts,
react-query loading states, and Google sign-in.

**Rollback:** `git revert`. The site is still untouched.

### Phase 3 — Move the files — **DONE**

Pure relocation, no edits beyond import paths — plus three repairs that the move
itself made necessary, pulled forward from Phase 6 (recorded below).

**Result:** 67 files moved with `git mv`, 184 import specifiers rewritten across
59 files, every local specifier verified to resolve, and `tsc --noEmit` over the
*whole merged tree* under the root's strict config reports **0 errors**. The root
`next build` compiles and emits all 24 routes, CPMS's 13 among them at their
existing `/cpms/*` URLs.

**Three things the move broke, repaired here rather than left in the commit:**

1. Nine packages (`sonner`, `@tanstack/react-query`, `date-fns` and six
   `@radix-ui/*`) lived in `cpms-next/node_modules` and not the root, so the
   moved code could not typecheck at all — 27 errors, of which the 10
   `TS7006` implicit-anys were downstream of the 17 missing modules rather than
   real defects. Root `package.json` now carries them.
2. `next.config.js` still rewrote `/cpms/:path*` to `http://127.0.0.1:8080`.
   Filesystem routes win over an `afterFiles` rewrite so the real pages were
   unaffected, but any unmatched `/cpms/*` URL was proxied to a dead port and
   returned **500**. Rewrites and `CPMS_ORIGIN` deleted; that URL now 404s.
3. With `cpms-next/next.config.mjs` no longer running, **`/cpms` was being served
   with no CSP and no Permissions-Policy at all** — the site block excludes it by
   design. Its policy is ported into `next.config.js` as a second header block.
   Leaving this to Phase 6 would have meant committing a patient-management app
   with its security headers switched off.

**Still outstanding, and exactly Phase 4's job:** `/cpms` renders **two**
`<html>` and two `<body>` tags, because the moved `app/layout.tsx` is still
written as a root layout. It builds and serves 200, but the markup is invalid.

Two more files are unreachable from any route and were left in place in Phase 1
because they sit outside `components/ui/`: `components/NavLink.tsx` and
`hooks/use-mobile.tsx` (the latter existed only for the now-deleted
`sidebar.tsx`). Delete them rather than move them, unless `NavLink` is being
kept deliberately.

- `cpms-next/app/*` → `src/app/cpms/*` (drop `globals.css` and `layout.tsx`,
  handled in Phase 4).
- `cpms-next/components/ui/*` → `src/components/cpms/ui/*`
- `cpms-next/components/pages/*` and the rest → `src/components/cpms/*`
- `cpms-next/hooks/*` → `src/hooks/cpms/*`
- `cpms-next/lib/*` → `src/lib/cpms/*`
- `cpms-next/integrations/supabase/client.ts` → `src/lib/supabase/cpms-client.ts`;
  `integrations/supabase/types.ts` is a re-export of `@shared/supabase-types`
  and can be deleted once its importers point at the shared file directly.

Import rewrite: CPMS's alias is `@/*` → `./` (repo-relative to `cpms-next/`);
the root's is `@/*` → `./src/*`. So `@/components/ui/button` becomes
`@/components/cpms/ui/button`, `@/hooks/useAuth` becomes `@/hooks/cpms/useAuth`,
and so on — a mechanical sed across the moved tree, then `tsc --noEmit` to
catch what it missed.

Route file placement means `/cpms/dashboard` etc. resolve to the same URLs the
`basePath` produced, so no public URL moves.

### Phase 4 — Layout, theme scoping, fonts — **DONE**

Two things came out differently from the plan below:

**The Tailwind config needed no changes at all.** The plan called for porting
CPMS's `sidebar` colours, `float` animation and `boxShadow` scale into it. The
first two have zero usages — `sidebar.tsx` was deleted in Phase 1 and nothing
ever used `animate-float` — so adding them would have been dead config. The
third was actively dangerous: `theme.extend.boxShadow` is global, CPMS's scale
redefines `sm`/`md`/`lg`, and the site uses those three utilities in 43 places.
Carrying it over would have repointed every one of them at `var(--shadow-*)`,
which is only declared inside the CPMS scope — so all 43 would have rendered
with no shadow at all. The shadows are scoped in CSS instead, the same way
`font-mono` is.

**Lora is gone.** It was one of three Google Font imports and mapped to
`font-serif`, which nothing uses. Space Grotesk and Space Mono moved to
`next/font`, so both Google Fonts origins are out of the CPMS CSP.

**`src/app/cpms/layout.tsx`** — from the old root layout, minus `<html>`/`<body>`:

```tsx
export default function CpmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app="cpms" className="min-h-screen bg-background text-foreground">
      <AppProviders>{children}</AppProviders>
    </div>
  );
}
```

Keep its `metadata` and `viewport` exports, with one required change: the root
layout sets `title.template = '%s | CBRL, IIT Kharagpur'`, which would render
CPMS's title as *"CPMS - CBRL Patient Management System | CBRL, IIT Kharagpur"*.
Use `title: { absolute: 'CPMS — CBRL Patient Management System' }`.

**`src/app/globals.css`** — append CPMS's `:root` token block, re-scoped:

```css
@layer base {
  /* existing CBRL :root and .dark blocks, unchanged */

  [data-app="cpms"] {
    --background: 210 20% 98%;
    --primary: 168 76% 36%;
    /* …the rest of CPMS's :root: sidebar-*, chart-*, success, warning,
       shadow-*, --radius: 0.75rem… */
    font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  }
}
```

CPMS's `.dark` block is dropped (Invariant 3). Because these are custom
properties on a descendant of `<html>`, they beat the site's `:root`/`.dark`
values for the whole CPMS subtree by cascade proximity — no `!important`, no
specificity fight.

**`tailwind.config.ts`** — one config. The existing `./src/**` globs already
cover the moved files, so `content` needs nothing new. Add CPMS's extras to
`theme.extend`: `colors.sidebar`, `keyframes.float` / `animation.float`, and
`boxShadow` (the `var(--shadow-*)` set). Keep the site's
`container.padding: '1rem'` — CPMS uses the `container` class in zero files, so
CPMS's `2rem` is a non-conflict. Keep both plugins (`tailwindcss-animate`,
`@tailwindcss/typography`).

Do **not** add CPMS's `fontFamily` block to the config — it would repoint
`font-sans` site-wide. Instead, grep the moved CPMS tree for
`font-sans|font-serif|font-mono` and, for any that are used, add scoped
overrides under `[data-app="cpms"]`.

**Fonts** — CPMS pulls Space Grotesk, Lora and Space Mono via three
`@import url(https://fonts.googleapis.com/...)` at the top of its `globals.css`.
Recommended (low risk, do it here): convert to `next/font/google` in
`src/app/cpms/layout.tsx`, matching how the site self-hosts Inter. That removes
three render-blocking imports and lets the `/cpms` CSP drop
`fonts.googleapis.com` and `fonts.gstatic.com` entirely.

### Phase 5 — Assets, service worker, base path — **DONE**

- Move `cpms-next/public/*` → `public/cpms/*`. No collisions: the site's
  `/sw.js` and `/cbrl-logo.png` stay at the root, CPMS's become `/cpms/sw.js`
  and `/cpms/cbrl-logo.png`.
- **`src/lib/cpms/base-path.ts` barely changes.** `asset()` prefixes `/cpms`,
  and after the move that prefix maps to real files and real routes:
  `asset('/cbrl-logo.png')` → `public/cpms/cbrl-logo.png`; `asset('/sw.js')` →
  `public/cpms/sw.js`; `asset('/dashboard')` → the `/cpms/dashboard` route.
  Only two edits: hardcode `export const basePath = '/cpms'` (the
  `NEXT_PUBLIC_BASE_PATH` env var disappears with the CPMS config), and rewrite
  the doc comment — it is no longer Next's `basePath`, it is a literal mount
  path, and that distinction is now load-bearing.
- **Add `/cpms` to router calls.** Next no longer prefixes them. All reachable
  by grep:
  - `router.push(...)` / `router.replace(...)` — 33 occurrences, 16 distinct
    targets (`/`, `/dashboard`, `/patients`, `/patients/${id}`, `/scan`,
    `/attendance`, `/help`, `/onboarding`, `/admin/attendance`,
    `/admin/hospitals`, `/admin/users`).
  - `src/components/cpms/guards.tsx` — the computed `redirectTo` strings at
    lines ~59, ~84, ~108.
  - `src/components/cpms/pages/NotFound.tsx:22` — `<Link href="/">`.

  Wrap each in the existing `asset()` rather than hardcoding, so the mount path
  stays a single constant.
- **Guard `ServiceWorkerManager`**: early-return when
  `usePathname().startsWith('/cpms')`.
- Verify `public/sw.js` (the site worker, scope `/`) does not cache or intercept
  `/cpms/*`. This is a pre-existing condition — the two apps already share an
  origin — but the merge is the right moment to confirm it.
- **Known behaviour change, and the catch-all does not fix it.** An unmatched
  URL like `/cpms/nope` renders the *site's* 404 — "Specimen Not Found", with
  site navigation — handed to a signed-in clinician. It does at least inherit
  the CPMS layout, so it carries CPMS's theme.

  This plan originally suggested `src/app/cpms/[...catchAll]/page.tsx` calling
  `notFound()`. That was tried and **does not work** in Next 16: the catch-all
  matches and the CPMS layout runs, but `notFound()` resolves to the *root*
  `not-found.tsx` regardless. Putting a `not-found.tsx` in the catch-all's own
  segment does not change it either. Both files were reverted rather than left
  in place adding complexity for nothing.

  Living with it is the accepted outcome. A real fix would mean teaching the
  root `not-found.tsx` to branch on the path, which coupled the site's 404 to
  CPMS for a cosmetic gain and was judged not worth it.

### Phase 6 — Configuration — **DONE**

**`next.config.js`**
- Delete the `rewrites` block and the `CPMS_ORIGIN` constant — there is nothing
  to proxy to.
- Replace `loadSharedEnv()` / `env: sharedEnv` with ordinary `.env.local`
  reads. `shared-env.cjs` and `.env.shared` are deleted; fold their two values
  into `.env.local` and `.env.example`.
- **Keep two `headers()` blocks.** The existing negative-lookahead source
  (`/:path((?!cpms$|cpms/).*)`) stays exactly as-is; add a `/cpms` + `/cpms/:path*`
  block carrying CPMS's policy. The split is still load-bearing and now more so,
  because a mistake takes down both apps:
  - `Permissions-Policy: geolocation=(self), camera=(self), microphone=()` —
    without it, attendance check-in and prescription scanning stop working.
    The site block sets `camera=(), geolocation=()`.
  - CSP: `connect-src` needs the Supabase origin *and* its `wss:` form
    (realtime); `img-src` needs `blob:` (prescription scans and documents are
    downloaded and rendered as object URLs) and `https://lh3.googleusercontent.com`
    (Google avatars); `worker-src 'self' blob:`. Drop the Google Fonts origins
    if Phase 4's `next/font` conversion was done.
  - Keep the `Service-Worker-Allowed: /cpms/` header, now on `/cpms/sw.js`.
- Decide on `output`. The root app does not set it; CPMS used
  `output: 'standalone'`. One app, one answer — recommend dropping standalone
  and keeping `next start`, matching how the site deploys today. Flag it to
  whoever owns the Linux box, since the CPMS deploy steps change.

**`tsconfig.json`** — remove `"exclude": ["cpms-next"]` and its comment. Apply
the Phase 2 decision on strictness. `target` moves ES2020 → ES2017 for the CPMS
code, which is harmless.

**`package.json`** — union of both dependency sets at single versions (the
Phase 2 table is the reconciliation). Scripts collapse to `dev` / `build` /
`start`; delete `dev:cpms`, `build:cpms`, `start:cpms`, `dev:all`, `build:all`,
`start:all` and the `concurrently` devDependency.

Delete `cpms-next/` — including its `package-lock.json`, whose presence is the
reason CPMS needed `turbopack.root` and `outputFileTracingRoot` pins at all.
Both can go.

**What actually happened, beyond the list above:**

- **`env: sharedEnv` was doing real work and is not simply deleted.** It existed
  because Next inlines `NEXT_PUBLIC_*` only from its own project root, and the
  values lived in a third file. With one root they are ordinary `.env.local`
  entries and Next inlines them itself — verified by grepping the built client
  chunks for the Supabase URL and key rather than assuming, since a miss here
  would not show up in any page-level smoke test: CPMS pages render a loading
  spinner server-side either way, and the failure would only appear at sign-in.
- **`scripts/migrate-content-to-supabase.mts` read `.env.shared` directly** and
  would have silently lost the Supabase URL. It reads `.env.local` now.
- **`ecosystem.config.js` pointed `cwd` into the deleted directory.** Pulled
  forward from Phase 7 — deleting a directory while leaving a PM2 config that
  starts a process inside it is not a finished change. It now declares one app.
- `robots.ts` and the `@shared/*` comment in `tsconfig.json` described the
  two-process layout and were corrected.
- **`cpms-next/.env.local` held eight secrets that are not Next environment
  variables at all** — Gemini (prescription OCR), VAPID (web push), Resend
  (email), a cron guard. Nothing in the source reads any of them; they belong to
  Supabase Edge Functions. They were preserved to `.env.cpms-edge.local` at the
  repository root (gitignored by `.env*.local`) rather than destroyed with the
  directory. Confirm they are set in the Supabase secret store, then delete that
  file.

Still referencing the old two-app layout, and left for Phase 7: `README.md`,
`docs/DEPLOYMENT-LINUX-PM2.md`, and `docs/CPMS-DEPLOYMENT.md` (moved here from
`cpms-next/DEPLOYMENT.md` so it survived the deletion). Two `supabase/migrations`
comments mention `cpms-next/` paths; those are applied migrations and are left
alone deliberately.

### Phase 7 — Deployment — **DONE**

- `ecosystem.config.js`: delete the `cpms` app. One process on 3200.
  (Separately worth noting: this file uses Windows paths and `cmd.exe` while
  `docs/DEPLOYMENT-LINUX-PM2.md` describes a Linux deploy. Out of scope here,
  but they disagree.)
- Apache: remove the `ProxyPass /cpms → 127.0.0.1:8080` pair. Everything goes
  to 3200.
- `cpms-next/DEPLOYMENT.md` was **deleted, not folded**. Every section of it —
  the standalone bundle, the systemd unit, its own Apache ProxyPass, its own
  environment file — described the two-process architecture. The only content
  not already in the PM2 guide was the Supabase redirect-URL list, which
  section 12 there already carried.
- The PM2 guide gains a **section 18** for upgrading a server that ran the old
  layout. The ordering matters: remove the Apache ProxyPass and confirm the Edge
  Function secrets are in Supabase *before* `git pull` deletes the directory
  holding them.
- Free port 8080.

### Phase 8 — Sessions — **DONE, deliberately narrowed**

This phase was going to convert CPMS from `localStorage` sessions to
`@supabase/ssr` cookie sessions, so that one sign-in spanned both apps and
`proxy.ts` could gate `/cpms` server-side.

**That was not done, and should not be done without a reason better than the one
written here.** Investigating it turned up a cost the plan had not accounted
for: CPMS's session token currently lives in `localStorage` and leaves the
browser only as an `Authorization` header to Supabase. In a cookie it would be
attached to *every* same-origin request — the public marketing pages, their
assets, `/admin` — and would appear in the access logs of a public website. For
a patient system that is a worse position than the one it started in.

Set against that: RLS is the enforcement boundary either way, the gating was
always defence-in-depth rather than a hole being closed, and the "one sign-in
for both apps" convenience serves a user overlap of roughly the administrators.
The migration would also have signed every clinician out on deploy.

A middle option was considered and rejected as not worth its own complexity:
cookies under a distinct name scoped to `path=/cpms`, which would allow the
gating without broadening exposure, but still forces the re-authentication and
does not unify sign-in.

**What this phase did fix** is a real bug found while reading the code.
`useAuth.tsx` called `supabase.auth.signOut()` with no arguments, and the
default scope is `'global'` — it revokes the account's refresh tokens
*everywhere*. The dashboard's logout route goes to explicit trouble to avoid
exactly this, `scope: 'local'`, with a comment explaining that signing out of
the website must not eject a clinician from the patient system. The care was
one-way. Worse, CPMS reaches that call from its five-minute inactivity timeout,
so an unattended CPMS tab was signing the account out of every other device it
had. Both sides now pass `scope: 'local'`.

The two apps therefore still keep independent sessions on one origin, which is
what `src/proxy.ts:154` already reasons about ("that account may well be a CPMS
clinician who simply opened the wrong URL"). That is the intended end state, not
an unfinished one.

---

## Verification checklist

Run against a production build (`npm run build && npm run start`), not `next dev`.

**Public site** — every `(site)` route; the 404 page; dark-mode toggle and its
persistence; contact form (EmailJS); publications page (OpenAlex fetch, citation
counts); images served from the Supabase `site-media` bucket.

**Content dashboard** — Google sign-in; the `site_editors` gate (an account
without a grant is refused); idle timeout and the heartbeat that defers it; each
dashboard section; image upload; logout.

**CPMS** — Google sign-in landing on `/cpms/dashboard`; onboarding redirect for
a new profile; patients list, detail, and timeline; **scan (camera permission)**;
**attendance check-in (geolocation permission)**; notification bell; the three
`/cpms/admin/*` pages; help; sign-out; 5-minute inactivity timeout; service
worker registration at scope `/cpms/`.

**Headers** — confirm the two policies are still distinct. Fetch `/` and
`/cpms/dashboard` and compare `Permissions-Policy` and
`Content-Security-Policy`. The first must show `camera=(), geolocation=()`; the
second `geolocation=(self), camera=(self)`. If they match, the header split
broke and scanning/attendance are dead.

**Cross-app** — the site's service worker must not be registered on `/cpms`
pages, and CPMS's must not claim scope outside `/cpms/`.

---

## What this actually buys

One `npm install`, one build, one PM2 process (~one Node process of RAM back on
the box), and the disappearance of the `/cpms` rewrite hop, the Apache
`ProxyPass`, `CPMS_ORIGIN`, `shared-env.cjs`, `.env.shared`, and the duplicate
`node_modules`.

## What it costs

Process isolation. Today a CPMS crash or bad deploy leaves the public site
serving, and vice versa. After the merge they share a process and a config: one
`headers()` mistake reaches both, and every CPMS change requires rebuilding and
restarting the public website. That trade is the whole decision, and it is made
— this document just makes sure it is made with the consequence written down.
