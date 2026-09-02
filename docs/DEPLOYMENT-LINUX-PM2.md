# Deploying CBRL on Linux with PM2 and Apache

This runbook takes a bare Debian/Ubuntu (or RHEL/Rocky) server to a working
`https://cbrl.iitkgp.ac.in` serving the site, the content dashboard and CPMS
from one Next app under PM2, behind Apache.

Commands are Debian/Ubuntu. On RHEL/Rocky, `apache2` becomes `httpd`, `a2enmod`
is not needed (modules load from `/etc/httpd/conf.modules.d/`), and see the
SELinux note in section 10.

---

## 1. What you are deploying

One Next application, one Node process, one hostname:

```
                            ┌─ /        public site
  cbrl.iitkgp.ac.in ─ Apache┼─ /admin   content dashboard   →  127.0.0.1:3200
     (443, TLS)             └─ /cpms    CPMS clinical app
```

**This changed.** CPMS used to be a second Next application on port 8080, with
its own build, its own `node_modules`, its own PM2 entry and its own Apache
`ProxyPass`. It is now a route subtree of this app at `src/app/cpms`. If you are
upgrading a server that ran the old layout, see section 18.

What that costs is worth stating plainly: the two no longer fail independently.
A bad deploy or a crash takes down the public site and the patient system
together, and every CPMS change requires rebuilding and restarting the website.

What it does not change is the security boundary. CPMS still gets its own
Content-Security-Policy and its own `Permissions-Policy` — camera and
geolocation granted there, denied everywhere else — from a second header block
in `next.config.js`. That split is load-bearing and section 13 checks it.

### Why PM2 rather than systemd

Both work. PM2 gives you one operator-facing tool (`pm2 list`, `pm2 logs`,
`pm2 restart cbrl`), live metrics, and log rotation without writing a unit file.
systemd is the right pick if the server is centrally managed and everything else
on it is already a unit. The app runs from the normal build via `next start`
either way, so the repository plus `node_modules` lives on the server.

---

## 2. Prerequisites

### 2.1 A service account

Do not run this as `root`, and do not run it as your own login. PM2 keeps a
per-user daemon; whichever user starts the apps is the user that must own the
boot hook in section 8.

```sh
sudo adduser --system --group --home /var/www/cbrl --shell /bin/bash cbrl
sudo mkdir -p /var/www/cbrl
sudo chown -R cbrl:cbrl /var/www/cbrl
```

Everything from here runs as `cbrl` unless prefixed with `sudo`:

```sh
sudo -u cbrl -i          # become the service user
```

### 2.2 Node.js 22

Match the version the apps were developed against (Next 16 requires 20.9 or
newer; this repo is built and tested on 22.x).

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v          # v22.x
```

**Install Node system-wide, not through `nvm`.** PM2's boot hook (section 8)
records an absolute interpreter path; an `nvm` install lives under a user's home
and is not on `PATH` during early boot, so the apps silently fail to come back
after a reboot.

### 2.3 PM2

```sh
sudo npm install -g pm2
pm2 -v           # 6.x or 7.x
```

### 2.4 Apache modules

```sh
sudo apt-get install -y apache2
sudo a2enmod proxy proxy_http headers ssl
```

### 2.5 Build headroom

`next build` runs TypeScript and Turbopack over the whole app. Give the box
**2 GB RAM or more**, or add swap before the first build:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Get the code onto the server

```sh
cd /var/www/cbrl
git clone <repository-url> .
```

Then install. `npm ci`, not `npm install`, so the lockfile is honoured exactly:

```sh
npm ci
```

Do **not** pass `--omit=dev` here. TypeScript, ESLint and the Tailwind toolchain
are `devDependencies` and the build needs them. You may prune afterwards if disk
is tight, but the saving is small and the next build only reinstalls them.

---

## 4. Environment files

One file, `/var/www/cbrl/.env.local`, not in git (`.gitignore` covers
`.env*.local`). Create it by hand on the server.

There used to be three: a `.env.shared` read by both apps through
`shared-env.cjs`, plus one `.env.local` each. That existed only because Next
reads `.env` files from its own project root and there were two roots. One root
now, one file.

### 4.1 Supabase — needed by the dashboard and CPMS alike

```sh
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

> **Only the publishable key — here or anywhere.** Row Level Security is what
> separates website editors from patient records, and a service-role key
> bypasses RLS entirely. It must never appear in the app's environment.

### 4.2 The rest of `/var/www/cbrl/.env.local`

```sh
# Contact form. Without these the form renders but submission fails.
NEXT_PUBLIC_EMAILJS_SERVICE_ID=<service id>
NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=<template id>
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=<public key>

# Signs the dashboard's activity cookie. At least 16 characters of randomness;
# admin requests throw if it is missing or shorter. Rotating it signs every
# editor out. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_SESSION_SECRET=<64 hex characters>

# How many reverse proxies sit in front of Node. Behind this Apache: 1.
# The login throttle reads the client address this many entries from the RIGHT
# of X-Forwarded-For — everything to the left of Apache's own entry is
# supplied by the caller and can say anything. Getting this wrong silently
# weakens the throttle without breaking anything visibly.
TRUSTED_PROXY_HOPS=1

# Pins the origin that dashboard writes must come from. Optional — leave unset
# to derive it from X-Forwarded-Proto / X-Forwarded-Host, which the vhost in
# section 10 sets correctly.
ADMIN_ORIGIN=https://cbrl.iitkgp.ac.in

# Optional. Restricts /admin and /api/admin to these addresses; the public site
# is unaffected. Comma-separated IPs and CIDR ranges, v4 and v6.
# CHECK /api/admin/whoami FIRST so you do not lock yourself out.
# ADMIN_ALLOWED_IPS=10.111.0.0/16, 203.0.113.5

# Optional. Idle timeout in minutes; default 5. The absolute cap is 8 hours and
# is not configurable.
# ADMIN_IDLE_TIMEOUT_MINUTES=15
```

### 4.3 CPMS's back-end secrets do not belong here

CPMS has secrets of its own — Gemini for prescription OCR, VAPID for web push,
Resend for reminder email, a shared secret guarding the cron endpoint. **None of
them are Next environment variables.** They are consumed by Supabase Edge
Functions, which run on Supabase, not on this server. Nothing in the source
reads any of them.

They belong in the project's secret store:

```sh
supabase secrets set GEMINI_API_KEY=... VAPID_PRIVATE_KEY=... --project-ref <project-ref>
```

They previously sat in `cpms-next/.env.local`, which was misleading — it looked
like app configuration and was not. If you are upgrading a server that ran the
old layout, that file is about to be deleted with the directory; make sure these
are set in Supabase first.

### 4.4 The build-time trap

Every `NEXT_PUBLIC_*` value is **inlined into the client bundle when
`next build` runs**. Setting one in PM2's `env_production`, in a systemd unit or
in the shell afterwards has *no effect* — the old value is already compiled into
the JavaScript that browsers download.

**Changing any `NEXT_PUBLIC_*` value means rebuilding, not restarting.**

Server-side values (`ADMIN_SESSION_SECRET`, `TRUSTED_PROXY_HOPS`,
`ADMIN_ALLOWED_IPS`, `ADMIN_ORIGIN`) are read at runtime, so for those a restart
is enough.

Lock the file down — it is readable by anything running as `cbrl`:

```sh
chmod 600 .env.local
```

---

## 5. Build

```sh
cd /var/www/cbrl
npm run build
```

`NEXT_PUBLIC_SUPABASE_URL` is read twice during the build: once to inline into
the client bundle, and once by `next.config.js` to name the Supabase origin in
CPMS's `connect-src`. If it is missing, the CSP silently blocks every API call
in CPMS while the build itself appears to succeed — so check section 4.1 first
if sign-in works nowhere.

Expect under a minute. Success is one route table of about twenty-four routes
covering all three areas: the public pages, `/admin/*` and `/api/admin/*`, and
`/cpms/*`.

---

## 6. The PM2 ecosystem file

The `ecosystem.config.js` committed at the repo root is **Windows-specific**: it
runs `next.cmd` through `cmd.exe`, because `.cmd` shims are not executable by
Node. On Linux that config will not start.

Create `ecosystem.linux.config.js` at the repository root:

```js
// PM2 process definitions for the Linux deployment.
//
// The app is started by pointing Node straight at Next's CLI entrypoint
// rather than at `npm start` or a shell wrapper. That matters: PM2 supervises
// whatever it spawns, so a wrapper would leave PM2 watching a shell while the
// real server runs as its child — metrics then measure the wrapper, and
// `max_memory_restart` never fires.
const NEXT = './node_modules/next/dist/bin/next';

module.exports = {
  apps: [
    {
      // ─── CBRL main website + /admin dashboard ──────────────────────────
      // Apache proxies / here. Bound to loopback: `next start` listens on
      // 0.0.0.0 by default, which would expose this port to the campus
      // network and let clients bypass TLS and the X-Forwarded-* headers the
      // admin gate depends on.
      name: 'cbrl',
      script: NEXT,
      args: 'start -p 3200 -H 127.0.0.1',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '768M',
      // Back off instead of hammering a process that crashes on startup — a
      // bad .env.local otherwise produces a restart loop and a full disk.
      exp_backoff_restart_delay: 200,
      max_restarts: 10,
      min_uptime: '20s',
      // Give in-flight requests time to finish before SIGKILL on restart.
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      out_file: '/var/log/cbrl/cbrl-out.log',
      error_file: '/var/log/cbrl/cbrl-error.log',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3200,
      },
    },
  ],
};
```

One app, not two. CPMS is served by this process at `/cpms`; there is no second
entry and no port 8080. `max_memory_restart` is worth a second look now that one
process carries both workloads — 768M was sized for the site alone.

Create the log directory first, owned by the service user:

```sh
sudo mkdir -p /var/log/cbrl && sudo chown cbrl:cbrl /var/log/cbrl
```

### Why `-H 127.0.0.1` is not optional

`next start` binds `0.0.0.0` unless told otherwise. Without `-H`, port 3200
answers on every interface, and anyone on the network can reach the app
directly — no TLS, no `X-Forwarded-Proto`, and CPMS's patient screens served
over plain HTTP. Bind to loopback and let Apache be the only door. A firewall
rule is a second layer, not a substitute.

---

## 7. Start it

```sh
cd /var/www/cbrl
pm2 start ecosystem.linux.config.js --env production
pm2 list
```

The `cbrl` entry should read `online` with zero restarts. Then confirm the
process itself is healthy before involving Apache:

```sh
curl -sI http://127.0.0.1:3200/       | head -1     # HTTP/1.1 200 OK
curl -sI http://127.0.0.1:3200/cpms   | head -1     # HTTP/1.1 200 OK
curl -sI http://127.0.0.1:3200/admin  | head -2     # 307 → /admin/login
```

That last one is the admin gate turning away an unauthenticated request. A
`200` there means the gate is not running — stop and investigate.

If the app is `errored`, read the reason before anything else:

```sh
pm2 logs cbrl --lines 50 --nostream
```

---

## 8. Survive a reboot

Two steps, and both are required. `pm2 save` records the current process list;
`pm2 startup` installs the systemd unit that replays it at boot.

```sh
# Run as the service user. The command it prints must then be run as root.
pm2 save
pm2 startup systemd -u cbrl --hp /var/www/cbrl
# → prints a `sudo env PATH=... pm2 startup ...` line. Run exactly that.
```

Verify rather than trusting it:

```sh
systemctl is-enabled pm2-cbrl        # enabled
sudo reboot
# after it comes back:
pm2 list                             # both online
curl -sI https://cbrl.iitkgp.ac.in/ | head -1
```

**Re-run `pm2 save` after any change to the process list** — adding an app,
deleting one, changing the ecosystem file and restarting. The boot hook replays
the last *saved* list, not the current one, so a forgotten `pm2 save` surfaces
as "it worked until we rebooted three weeks later".

---

## 9. Log rotation

PM2 writes to the files named in the ecosystem config and never truncates them.
On a server that stays up for months, that fills a disk.

```sh
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

`pm2 flush` empties the current logs on demand. It only touches apps that are
currently registered — files belonging to deleted entries stay behind in
`/var/log/cbrl` and have to be removed by hand.

---

## 10. Apache

One vhost, one backend. There is no `/cpms` rule any more — Apache forwards
everything to 3200 and Next decides what `/cpms` means.

> **Upgrading from the two-app layout: the old `/cpms` `ProxyPass` must be
> removed.** It points at port 8080, where nothing is listening now, so leaving
> it in place makes CPMS return 503 while the rest of the site works fine.
> This is the single most likely way to break this upgrade.

```apache
<VirtualHost *:443>
    ServerName cbrl.iitkgp.ac.in

    SSLEngine on
    SSLCertificateFile    /etc/ssl/certs/cbrl.iitkgp.ac.in.crt
    SSLCertificateKeyFile /etc/ssl/private/cbrl.iitkgp.ac.in.key

    # --- everything: public site, /admin, and /cpms ---
    ProxyPass        / http://127.0.0.1:3200/
    ProxyPassReverse / http://127.0.0.1:3200/

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port  "443"

    ErrorLog  ${APACHE_LOG_DIR}/cbrl-error.log
    CustomLog ${APACHE_LOG_DIR}/cbrl-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName cbrl.iitkgp.ac.in
    Redirect permanent / https://cbrl.iitkgp.ac.in/
</VirtualHost>
```

```sh
sudo apachectl configtest && sudo systemctl reload apache2
```

### Do not add security headers here

Both apps set their own Content-Security-Policy, Permissions-Policy,
X-Frame-Options and HSTS in their `next.config`. Adding them in Apache
duplicates or overrides them — and the override is the dangerous direction.

`Permissions-Policy: geolocation=(self), camera=(self)` on `/cpms` is
load-bearing: attendance check-in and prescription scanning stop working without
it. The main site sets `camera=(), geolocation=()` origin-wide, which is why its
`next.config.js` deliberately excludes `/cpms` from that header block
(`source: '/:path((?!cpms$|cpms/).*)'`). The two apps serve **different** CSPs
and Permissions-Policies on one hostname, by design. An Apache-level header
would flatten that distinction and break the clinical features.

### `X-Forwarded-Proto` is load-bearing too

The admin gate derives the origin it expects on writes from
`X-Forwarded-Proto` / `X-Forwarded-Host`. Drop those `RequestHeader` lines and
dashboard saves start failing with *"This request did not come from the
dashboard"*, because Node sees `http://127.0.0.1:3200` while the browser sent
`https://cbrl.iitkgp.ac.in`.

### SELinux (RHEL / Rocky only)

Apache is forbidden from opening network connections by default, so every proxy
request returns 503:

```sh
sudo setsebool -P httpd_can_network_connect 1
```

---

## 11. HTTPS is mandatory

Geolocation, `getUserMedia` (camera) and Web Push are all blocked by browsers
outside a secure context. Over plain HTTP, CPMS attendance, scanning and
notifications fail outright rather than degrading. The site certificate covers
`/cpms` — there is no second certificate to issue.

---

## 12. Supabase configuration

In **Supabase → Authentication → URL Configuration → Redirect URLs**, add both
apps' callbacks or Google returns a redirect mismatch:

```
https://cbrl.iitkgp.ac.in/admin/auth/callback     # website dashboard
https://cbrl.iitkgp.ac.in/cpms/dashboard          # CPMS
```

Dashboard access is **not** granted by being able to sign in with Google. It
needs a row in `public.site_editors`; see the README for the grant SQL. Revoke
by setting `is_enabled = false`, which takes effect on the editor's next
request.

CPMS edge functions need the deep-link base, including the sub-path:

```sh
supabase secrets set APP_URL=https://cbrl.iitkgp.ac.in/cpms --project-ref <project-ref>
```

---

## 13. Verify the whole stack

```sh
# All three areas answer through Apache
curl -sI https://cbrl.iitkgp.ac.in/             | head -1    # 200
curl -sI https://cbrl.iitkgp.ac.in/cpms         | head -1    # 200
curl -sI https://cbrl.iitkgp.ac.in/publications | head -1    # 200
curl -sI https://cbrl.iitkgp.ac.in/nope         | head -1    # 404

# 404, not 503. A 503 here means the old /cpms ProxyPass to port 8080 is still
# in the vhost — see section 10.
curl -sI https://cbrl.iitkgp.ac.in/cpms/nope    | head -1    # 404

# The admin gate turns away anonymous requests
curl -sI https://cbrl.iitkgp.ac.in/admin        | head -2    # 307 → /admin/login

# The two Permissions-Policies are distinct — this is the check that catches
# an Apache header block someone helpfully added
curl -sI https://cbrl.iitkgp.ac.in/cpms | grep -i permissions-policy
#   → geolocation=(self), camera=(self), microphone=()
curl -sI https://cbrl.iitkgp.ac.in/     | grep -i permissions-policy
#   → camera=(), microphone=(), geolocation=()

# CPMS assets resolve under the prefix
curl -sI https://cbrl.iitkgp.ac.in/cpms/cbrl-logo.png | head -1
curl -sI https://cbrl.iitkgp.ac.in/cpms/sw.js | grep -i service-worker-allowed   # /cpms/

# The Node port is not reachable from off-box (run from ANOTHER machine)
curl -sI --connect-timeout 5 http://cbrl.iitkgp.ac.in:3200/   # must fail

# Nothing should be listening on 8080 any more
ss -lntp | grep 8080                                          # no output
```

Then sign in at `/admin` and save an edit — that exercises Google OAuth, the
`site_editors` grant, the origin check and the activity cookie together. Confirm
the proxy-hop setting while you are there:

```
GET https://cbrl.iitkgp.ac.in/api/admin/whoami
```

The reported `clientIp` must be your real address **even when you send a forged
`X-Forwarded-For` header**. If a forged value shows up, `TRUSTED_PROXY_HOPS` is
wrong and the login throttle can be evaded.

Finally, open CPMS and use Attendance — auth, geolocation and the service worker
in one action.

---

## 14. Redeploying

```sh
sudo -u cbrl -i
cd /var/www/cbrl
git pull
npm ci                                   # only if the lockfile changed
npm run build
pm2 restart ecosystem.linux.config.js --env production --update-env
pm2 save                                 # only if the process list changed
```

Apache needs no reload — it only proxies.

There is no longer a way to redeploy one part without the other. A CPMS fix and
a typo on the About page now ship together, and restarting for either drops
in-flight requests to both. That is the trade the merge made.

`--update-env` is what makes PM2 re-read `env_production`. Without it a
restarted process inherits the environment it was originally started with, and a
changed server-side variable appears not to take effect.

Remember section 4.4: a changed `NEXT_PUBLIC_*` value needs a **rebuild**, not a
restart.

---

## 15. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502 Bad Gateway` on everything | The Node process is down | `pm2 list`, then `pm2 logs cbrl --lines 50` |
| `503 Service Unavailable`, RHEL/Rocky | SELinux blocks Apache's outbound connection | `sudo setsebool -P httpd_can_network_connect 1` |
| `/cpms` returns `503` but the site works | A leftover `ProxyPass /cpms` to port 8080 from the two-app layout | Delete those two lines from the vhost (sections 10, 18) |
| Camera/geolocation dead in CPMS | An Apache header block is overriding the app's `Permissions-Policy` | Remove it; the app sets its own per-path (section 10) |
| Camera/geolocation dead, no Apache header block | The `/cpms` block in `next.config.js` was merged into the site's | They must stay separate; check `curl -sI .../cpms` against section 13 |
| An unmatched `/cpms/…` URL shows the public site's 404 | Expected. Next resolves `notFound()` to the root boundary | None; documented in `CPMS-MERGE-PLAN.md` |
| Testing a **local** production build over plain HTTP: every script, stylesheet, font and image fails with `net::ERR_FAILED` after the first page load | Not a bug in the build. `/sw.js` inherits the site CSP, which sets `upgrade-insecure-requests`, so the service worker's own `fetch()` is upgraded to `https://` and cannot reach an `http://` dev server. The first page looks fine; the worker then claims the origin and every later navigation breaks | Nothing to fix — it cannot happen over HTTPS, which is how this is served. To test locally, bypass the worker (DevTools → Application → Service Workers → *Bypass for network*) or use an incognito window |
| Dashboard saves fail: *"did not come from the dashboard"* | `X-Forwarded-Proto` missing, or `ADMIN_ORIGIN` wrong | Add the `RequestHeader` lines, or pin `ADMIN_ORIGIN` |
| *"not available from your network"* on `/admin` | `ADMIN_ALLOWED_IPS` excludes you | Check `/api/admin/whoami`; the 403 names the address it saw |
| Signed out every few minutes | `ADMIN_IDLE_TIMEOUT_MINUTES` defaults to 5 | Raise it in `.env.local`, restart |
| Everyone signed out after a deploy | `ADMIN_SESSION_SECRET` changed or was regenerated | Keep it stable across deploys |
| Sign-in fails everywhere, CSP blocks Supabase | `NEXT_PUBLIC_SUPABASE_URL` was unset at build time | Section 4.1, then rebuild — a restart will not do it |
| A Supabase/EmailJS key change had no effect | `NEXT_PUBLIC_*` is inlined at build time | Rebuild, do not restart (section 4.4) |
| Apps gone after a reboot | `pm2 save` not re-run, or `nvm`-installed Node | Sections 8 and 2.2 |
| PM2 shows ~9 MB for a busy app | PM2 is measuring a wrapper, not Node | Use the section 6 config — it execs Node directly |
| Logs fill the disk | No rotation configured | Section 9 |

---

## 16. Operator cheat-sheet

| Command | Does |
|---|---|
| `pm2 list` | Status, restarts, memory, uptime |
| `pm2 logs` | Tail the app live |
| `pm2 logs cbrl --lines 100 --nostream` | Last 100 lines, no follow |
| `pm2 restart cbrl` | Restart the app |
| `pm2 restart all --update-env` | Restart, re-reading `env_production` |
| `pm2 stop all` / `pm2 delete all` | Stop / deregister |
| `pm2 monit` | Live CPU and memory dashboard |
| `pm2 save` | Persist the current list for boot |
| `pm2 resurrect` | Restore the saved list manually |
| `pm2 flush` | Empty the logs of registered apps |
| `pm2 describe cbrl` | Full resolved config for one app — the fastest way to confirm which environment a process actually got |

---

## 17. Local Windows development, for contrast

The repo's Windows `ecosystem.config.js` exists for production-fidelity testing
on a developer machine and runs `next.cmd` through `cmd.exe`. Both configs use
port 3200, so `https://cbrl.iitkgp.ac.in/cpms` and `http://localhost:3200/cpms`
exercise the same routing.

For day-to-day work PM2 is not involved at all:

```sh
npm run dev          # everything on 3200, /cpms included
```

`npm run dev` uses the same port as `npm start` so that URLs, the Supabase
redirect allowlist and this document all agree.

---

## 18. Upgrading a server that ran the two-app layout

In order. The first two steps are what actually break if skipped.

```sh
sudo -u cbrl -i
cd /var/www/cbrl
git pull
```

**1. Remove the `/cpms` ProxyPass from the vhost** (section 10). It targets port
8080, where nothing will be listening. Leaving it means CPMS returns 503 while
every other page works — the failure looks like a CPMS bug rather than a stale
proxy rule.

```sh
sudo apachectl configtest && sudo systemctl reload apache2
```

**2. Confirm CPMS's Edge Function secrets are set in Supabase** before deleting
anything (section 4.3). `cpms-next/.env.local` held Gemini, VAPID, Resend and
the cron secret, and `git pull` removes the directory it lives in.

```sh
supabase secrets list --project-ref <project-ref>
```

**3. Fold `.env.shared` into `.env.local`.** Move the two `NEXT_PUBLIC_SUPABASE_*`
lines across; `shared-env.cjs` no longer exists to read them, and the build will
produce a CSP that blocks every Supabase call without them.

**4. Drop the second PM2 app and rebuild.**

```sh
pm2 delete cpms
npm ci
npm run build
pm2 restart ecosystem.linux.config.js --env production --update-env
pm2 save                     # the process list changed — this one matters
```

**5. Verify with section 13**, paying attention to the two `Permissions-Policy`
lines and to `/cpms/nope` returning 404 rather than 503.

Then clean up: `rm -f .env.shared`, and confirm `ss -lntp | grep 8080` is empty.
