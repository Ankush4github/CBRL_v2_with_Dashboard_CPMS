# Putting the CBRL website online — a step-by-step guide

**Who this is for:** anyone who has been handed this project and a server, and
told to make `https://cbrl.iitkgp.ac.in` work. You do not need to understand the
code. You need to be able to copy a command, press Enter, and read what comes
back.

**How long it takes:** about an hour the first time, mostly waiting.

**A promise about this guide:** every step tells you three things — what you are
doing, the exact command to type, and how to tell it worked. If what you see on
screen does not match "How to know it worked", **stop there** and jump to
[Part 14: When something goes wrong](#part-14--when-something-goes-wrong). Do not
carry on hoping it sorts itself out later. It will not.

> There is a shorter, more technical version of this same process in
> [`DEPLOYMENT-LINUX-PM2.md`](./DEPLOYMENT-LINUX-PM2.md). If you already know
> Linux well, read that one instead — it says the same things in a quarter of
> the words.

---

## Part 0 — What you are actually building

Three pieces have to cooperate. Here is the whole picture in one diagram:

```
   A visitor's                                          Your server
    browser
       |
       |  https://cbrl.iitkgp.ac.in
       v
  +----------+         +--------------+        +------------------------+
  |  Apache  |-------->|     PM2      |------->|  The website (Node.js) |
  |          |         |              |        |                        |
  | Takes the|         | Babysits the |        |  /        the public   |
  | request, |         | website. If  |        |           site         |
  | handles  |         | it crashes,  |        |  /admin   content      |
  | HTTPS,   |         | PM2 restarts |        |           dashboard    |
  | hands it |         | it. If the   |        |  /cpms    patient      |
  | inward   |         | server       |        |           system       |
  |          |         | reboots, PM2 |        |                        |
  |          |         | brings it    |        |  Listens on port 3200  |
  |          |         | back.        |        |                        |
  +----------+         +--------------+        +------------------------+
```

In plain words:

- **The website** is a Node.js program. It does all the real work, but it only
  listens on an internal address (`127.0.0.1:3200`) that nobody outside the
  server can reach. That is deliberate — see Part 6.
- **PM2** is a babysitter for that program. On its own, a Node.js program stops
  the moment you close your terminal, and stays stopped if it crashes. PM2 keeps
  it running, restarts it when it falls over, brings it back after a reboot, and
  keeps its logs tidy.
- **Apache** is the front door. It is the only thing the outside world talks to.
  It handles HTTPS (the padlock in the browser) and passes every request inward
  to the website.

**One important thing to understand up front:** this is *one* program serving
*three* areas. The public site, the content dashboard at `/admin`, and the CPMS
patient system at `/cpms` are all the same Node.js process. There is nothing
separate to start for CPMS, and no second port. It also means they rise and fall
together: if the website is down, CPMS is down too.

---

## Part 1 — What you need before you start

Tick all six off before typing anything.

| # | What | How to check you have it |
|---|------|--------------------------|
| 1 | **A Linux server** running Ubuntu or Debian, with at least **2 GB of RAM** | Ask whoever gave you the server. Part 2.5 adds a workaround if RAM is short |
| 2 | **A way to log in to it** — an SSH username and password, or a key file | Try it: `ssh yourname@your-server-address` |
| 3 | **Permission to run `sudo`** (administrator commands) | Type `sudo echo ok`. If it prints `ok`, you have it |
| 4 | **The website's address pointed at the server** | `ping cbrl.iitkgp.ac.in` should show your server's IP address |
| 5 | **An HTTPS certificate** for that address — a `.crt` file and a `.key` file | Your institute's IT department issues these. Part 10.1 covers the alternative |
| 6 | **The secret settings** — Supabase keys and EmailJS keys | Whoever ran this before you has them. Part 4 lists exactly which |

You cannot skip #6. The site will build and start without those values, and then
quietly fail: sign-in will not work and the contact form will not send.

### How to read the commands in this guide

Every command is in a grey box. Type it (or copy-paste it) and press Enter.

- Anything in `<angle brackets>` is a placeholder — **replace it, brackets and
  all**, with your real value. `<project-ref>` might become `abcdefgh` for you.
- A `#` at the start of a line is a note to you, not a command. It is safe to
  paste along with the rest.
- If a command prints nothing at all, that usually means it worked. Linux is
  quiet when it succeeds.

---

## Part 2 — Prepare the server

Log in to the server first:

```sh
ssh yourname@cbrl.iitkgp.ac.in
```

### 2.1 Create an account for the website to run under

**Why:** programs reachable from the internet should not run as the
administrator. If the website is ever compromised, you want the damage limited to
the website's own files. We create a restricted account called `cbrl` that owns
nothing but the site.

```sh
sudo adduser --system --group --home /var/www/cbrl --shell /bin/bash cbrl
sudo mkdir -p /var/www/cbrl
sudo chown -R cbrl:cbrl /var/www/cbrl
```

**How to know it worked:**

```sh
ls -ld /var/www/cbrl
```

The line it prints should contain `cbrl cbrl` in the middle — that is the folder
saying it belongs to the new account.

### 2.2 Install Node.js

**Why:** Node.js is the engine that runs the website. Version 22 is what this
project is tested against.

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**How to know it worked:**

```sh
node -v
```

It should print something starting with `v22.` — for example `v22.14.0`. The
exact numbers after `22.` do not matter.

> **Do not install Node.js using a tool called `nvm`**, even if a web search
> suggests it. `nvm` installs Node inside one user's home folder, which is not
> visible when the server is starting up. Everything will work perfectly until
> the first reboot, and then the site will silently fail to come back. Use the
> two commands above.

### 2.3 Install PM2

**Why:** this is the babysitter from Part 0.

```sh
sudo npm install -g pm2
```

**How to know it worked:**

```sh
pm2 -v
```

It should print a version number like `6.0.5`.

### 2.4 Install Apache and switch on the parts we need

**Why:** Apache ships with most of its features switched off. We need four of
them: the ability to pass requests inward (`proxy`, `proxy_http`), the ability to
set a couple of headers (`headers`), and HTTPS (`ssl`).

```sh
sudo apt-get install -y apache2
sudo a2enmod proxy proxy_http headers ssl
sudo systemctl restart apache2
```

**How to know it worked:**

```sh
sudo systemctl status apache2
```

Look for the words **`active (running)`** in green. Press `q` to get your prompt
back.

### 2.5 Give the server breathing room (only if it has under 2 GB of RAM)

**Why:** building the website is the single most memory-hungry thing you will do.
On a small server it can run out of memory and stop with a confusing error.
"Swap" lets the server borrow disk space as emergency memory.

First check how much you have:

```sh
free -h
```

If the number under `total` on the `Mem:` line is less than `2.0Gi`, run this:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**How to know it worked:** run `free -h` again. The `Swap:` line now shows `2.0Gi`.

---

## Part 3 — Copy the website's code onto the server

From here on, most commands run as the `cbrl` account rather than as you. Switch
over:

```sh
sudo -u cbrl -i
```

Your prompt changes to show you are now `cbrl`. **Stay in this mode for Parts 3
to 9.** If you ever get confused about who you are, type `whoami`.

Now download the code:

```sh
cd /var/www/cbrl
git clone <repository-url> .
```

The `.` at the end matters — it means "put the files here", not "make a new
folder inside here".

Then install the building blocks the project depends on:

```sh
npm ci
```

**Why `npm ci` and not `npm install`:** `ci` installs the exact versions the
project was tested with, listed in a file called `package-lock.json`. `install`
is free to pick newer ones, which is how a site that worked yesterday breaks
today.

This takes two to five minutes and prints a lot of scrolling text. That is normal.

**How to know it worked:** the last line says something like
`added 512 packages in 2m`. Then check:

```sh
ls
```

You should see a `node_modules` folder listed among the others.

---

## Part 4 — Create the settings file

**Why:** passwords and keys must never be stored in the code, because the code is
in git and git history is forever. Instead they live in a single file on the
server called `.env.local`, which git is told to ignore.

Create it:

```sh
cd /var/www/cbrl
nano .env.local
```

`nano` is a simple text editor. Type or paste the block below, replacing every
`<placeholder>`. When you are done, press **Ctrl+O** then **Enter** to save, then
**Ctrl+X** to quit.

```sh
# --- Supabase - the database behind the dashboard and CPMS ---
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>

# --- Contact form ---
NEXT_PUBLIC_EMAILJS_SERVICE_ID=<service id>
NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=<template id>
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=<public key>

# --- Dashboard session security ---
ADMIN_SESSION_SECRET=<paste the long random string from step 4.2>

# --- Networking ---
TRUSTED_PROXY_HOPS=1
ADMIN_ORIGIN=https://cbrl.iitkgp.ac.in
```

### 4.1 What each line is for

| Setting | What it does | What happens if it is wrong |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The address of the database | Nobody can sign in, anywhere. See the warning in Part 5 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The key the site uses to read that database | Same |
| `NEXT_PUBLIC_EMAILJS_*` | The contact form's email service | The form appears but sending fails |
| `ADMIN_SESSION_SECRET` | Signs the cookie that logs editors out after they go idle | The dashboard refuses every request |
| `TRUSTED_PROXY_HOPS` | Tells the app that exactly one thing (Apache) sits in front of it | The app misidentifies visitors' IP addresses |
| `ADMIN_ORIGIN` | The address dashboard edits must come from | Saving in the dashboard fails with *"This request did not come from the dashboard"* |

> **Only ever use the *publishable* Supabase key here.** Supabase also issues a
> "service role" key. That key ignores all the database's access rules — the same
> rules that stop a website editor reading patient records. It must never appear
> in this file, or anywhere else in this project.

### 4.2 Generate the session secret

Do not invent this one. Run:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It prints 64 random letters and numbers. Copy that into `ADMIN_SESSION_SECRET`.

**Keep it forever.** Changing it later logs every editor out.

### 4.3 Lock the file down

**Why:** the file now holds keys. This makes it readable only by the `cbrl`
account.

```sh
chmod 600 .env.local
```

**How to know it worked:**

```sh
ls -l .env.local
```

The line starts with `-rw-------`. Any letters after the first three dashes mean
it is readable by others — run the `chmod` again.

### 4.4 The one rule that catches everybody

Read this twice.

> **Any setting whose name starts with `NEXT_PUBLIC_` is baked into the website
> when you build it in Part 5.** Changing one later and restarting does
> *nothing* — the old value is already frozen inside the files browsers download.
>
> **Change a `NEXT_PUBLIC_` value, and you must rebuild (Part 5), not restart.**
>
> The other settings (`ADMIN_SESSION_SECRET`, `TRUSTED_PROXY_HOPS`,
> `ADMIN_ORIGIN`) are read fresh every time, so a restart is enough for those.

### 4.5 What does *not* go in this file

CPMS uses several other secrets — Google Gemini for reading prescriptions, VAPID
for phone notifications, Resend for reminder emails. **None of them belong here.**
They are used by code that runs on Supabase's servers, not yours. Putting them in
this file changes nothing at all.

They are set once, from any machine with the Supabase command-line tool:

```sh
supabase secrets set GEMINI_API_KEY=<value> --project-ref <project-ref>
```

---

## Part 5 — Build the website

**Why:** the code as written is for humans to read. Building converts it into the
compact, fast version that actually gets served.

```sh
cd /var/www/cbrl
npm run build
```

This takes under a minute. It prints a table of about two dozen web addresses at
the end.

**How to know it worked:** the final table appears and there is no red `Error`
text. The table should include the homepage `/`, some `/admin/...` rows and some
`/cpms/...` rows.

> **If you got the Supabase address wrong in Part 4, this build still succeeds.**
> It just quietly produces a site where nobody can sign in anywhere. If that is
> your symptom later, come back here: fix `.env.local`, then build again. A
> restart will not fix it (Part 4.4).

---

## Part 6 — Write the PM2 instruction file

**Why:** PM2 needs to be told what to run, on which port, and what to do when
things go wrong. That goes in a file.

> The project already contains a file called `ecosystem.config.js`. **Do not use
> it here.** It is written for Windows and will not start on Linux. We are making
> a second one alongside it.

First, make somewhere for the logs to go:

```sh
exit                      # briefly stop being the cbrl account
sudo mkdir -p /var/log/cbrl && sudo chown cbrl:cbrl /var/log/cbrl
sudo -u cbrl -i           # and back again
```

Now create the file:

```sh
cd /var/www/cbrl
nano ecosystem.linux.config.js
```

Paste this in exactly as it is — nothing here needs changing:

```js
// Tells PM2 how to run the CBRL website on Linux.
const NEXT = './node_modules/next/dist/bin/next';

module.exports = {
  apps: [
    {
      name: 'cbrl',
      script: NEXT,
      args: 'start -p 3200 -H 127.0.0.1',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '768M',
      exp_backoff_restart_delay: 200,
      max_restarts: 10,
      min_uptime: '20s',
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

Save with **Ctrl+O**, **Enter**, **Ctrl+X**.

### What the important lines mean

| Line | In plain words |
|---|---|
| `name: 'cbrl'` | What you will call it in commands: `pm2 restart cbrl` |
| `-p 3200` | Listen on port 3200 |
| `-H 127.0.0.1` | **Only** accept connections from the server itself — see below |
| `autorestart: true` | If it crashes, start it again |
| `max_memory_restart: '768M'` | If it ever uses more than 768 MB of memory, restart it |
| `max_restarts: 10` plus `min_uptime` | If it crashes ten times right after starting, give up rather than loop forever |
| `kill_timeout: 5000` | On restart, give visitors mid-request 5 seconds to finish |

> **`-H 127.0.0.1` is the single most important detail in this file.** Without
> it, the website answers on *every* network connection, and anyone on the campus
> network could reach it directly at `http://cbrl.iitkgp.ac.in:3200` — skipping
> Apache, skipping HTTPS, and viewing patient screens over an unencrypted
> connection. Leave it exactly as written.

---

## Part 7 — Start the website

```sh
cd /var/www/cbrl
pm2 start ecosystem.linux.config.js --env production
pm2 list
```

**How to know it worked:** `pm2 list` shows a table with one row named `cbrl`.
The `status` column says **`online`** in green and the restart column says `0`.

If it says `errored` or the restart number is climbing, read the reason:

```sh
pm2 logs cbrl --lines 50 --nostream
```

### Now test it before involving Apache

**Why:** if you skip this and something is wrong, you will not know whether to
blame the website or Apache. Test the smaller piece first.

```sh
curl -sI http://127.0.0.1:3200/      | head -1
curl -sI http://127.0.0.1:3200/cpms  | head -1
curl -sI http://127.0.0.1:3200/admin | head -2
```

**What you should see:**

| Command | Expected | What it means |
|---|---|---|
| First | `HTTP/1.1 200 OK` | The public site is alive |
| Second | `HTTP/1.1 200 OK` | CPMS is alive |
| Third | `HTTP/1.1 307 Temporary Redirect` and a line mentioning `/admin/login` | The dashboard's security gate is turning away a stranger — correct |

> If the third one says `200 OK`, **stop**. That means the dashboard is not
> protected. Do not continue to Part 10 until it redirects.

---

## Part 8 — Make it survive a reboot

**Why:** right now, if the server restarts, the website stays down until someone
notices and logs in. Two commands fix that permanently. **Both are required.**

```sh
pm2 save
pm2 startup systemd -u cbrl --hp /var/www/cbrl
```

The second command does not do the work itself — it *prints* a long command
starting with `sudo env PATH=...`. **Copy that printed line, and run it.** You
will need to leave the `cbrl` account first (`exit`) because it starts with
`sudo`.

**How to know it worked:**

```sh
systemctl is-enabled pm2-cbrl
```

It prints `enabled`.

If you can afford the downtime, prove it properly:

```sh
sudo reboot
# wait a minute, log back in, then:
pm2 list
```

The site should be `online` without you doing anything.

> **Remember this for later:** PM2 restores whatever list you last *saved*, not
> whatever is running now. Any time you add, remove, or reconfigure an app, run
> `pm2 save` again. Forgetting shows up as "everything worked fine until we
> rebooted three weeks later".

---

## Part 9 — Stop the logs filling the disk

**Why:** PM2 writes a log of everything the site does and never deletes any of
it. On a server left alone for months, that eventually fills the hard drive and
takes the site down. These commands cap it at 20 MB per file, keep 14 days, and
compress the old ones.

```sh
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

**How to know it worked:** `pm2 list` now shows a second entry called
`pm2-logrotate`. That is expected — it is a helper, not a second website.

---

## Part 10 — Point Apache at the website

You need administrator rights again, so leave the `cbrl` account:

```sh
exit
```

### 10.1 A note on the certificate

You need two files from your IT department: a certificate (`.crt`) and a private
key (`.key`). Put them where the configuration below expects them, or edit the
two paths to match where yours actually are.

If you have no institutional certificate and the server is reachable from the
public internet, you can get a free one:

```sh
sudo apt-get install -y certbot python3-certbot-apache
sudo certbot --apache -d cbrl.iitkgp.ac.in
```

Certbot writes the configuration for you. If you take that route, still read
10.2 to check the `ProxyPass` and `RequestHeader` lines ended up in the file.

### 10.2 Write the configuration

```sh
sudo nano /etc/apache2/sites-available/cbrl.conf
```

Paste this, adjusting `ServerName` and the two certificate paths:

```apache
<VirtualHost *:443>
    ServerName cbrl.iitkgp.ac.in

    SSLEngine on
    SSLCertificateFile    /etc/ssl/certs/cbrl.iitkgp.ac.in.crt
    SSLCertificateKeyFile /etc/ssl/private/cbrl.iitkgp.ac.in.key

    # Hand everything to the website: public pages, /admin and /cpms alike.
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

Save and switch it on:

```sh
sudo a2ensite cbrl
sudo apachectl configtest
```

**How to know it worked:** `configtest` prints `Syntax OK`. If it prints an error
it names the line number — go back and fix that line. Then:

```sh
sudo systemctl reload apache2
```

### 10.3 Two rules about this file

**Rule one: do not add security headers here.** You will find plenty of advice
online saying to add `Content-Security-Policy` or `Permissions-Policy` lines to
Apache. **Do not.** The website already sets its own, and it deliberately sets
*different* ones for `/cpms` than for everything else: CPMS is allowed to use the
camera and location (for prescription scanning and attendance check-in), and the
public site is not. An Apache header would flatten that distinction and silently
break the clinical features.

**Rule two: do not delete the two `RequestHeader` lines.** They are how Apache
tells the website "the visitor arrived over HTTPS at cbrl.iitkgp.ac.in". Without
them the website only sees `http://127.0.0.1:3200`, decides that saves are coming
from the wrong place, and rejects every dashboard edit.

### 10.4 If you are on RHEL, Rocky or CentOS instead

Everything works the same except that a security system called SELinux forbids
Apache from making outbound connections, so every page returns `503`. One command
fixes it permanently:

```sh
sudo setsebool -P httpd_can_network_connect 1
```

---

## Part 11 — Tell Supabase about your web address

**Why:** signing in sends the user to Google and back. Supabase will only send
them back to addresses it has been told about in advance; anything else is
rejected as a security risk.

In the Supabase dashboard, go to **Authentication > URL Configuration > Redirect
URLs** and add both of these:

```
https://cbrl.iitkgp.ac.in/admin/auth/callback
https://cbrl.iitkgp.ac.in/cpms/dashboard
```

Then set the address CPMS uses when it emails people links:

```sh
supabase secrets set APP_URL=https://cbrl.iitkgp.ac.in/cpms --project-ref <project-ref>
```

The `/cpms` on the end is not optional — those links open patient screens.

### Granting someone dashboard access

Being able to sign in with Google is **not** enough to edit the site. That is
intentional: anyone with a Google account can sign in to Supabase, and it grants
them nothing. Access needs a row in a table, added by a CPMS master account:

```sql
insert into public.site_editors (user_id, granted_by, note)
select u.id, auth.uid(), 'Website content editor'
from auth.users u
where u.email = 'person@example.com';
```

The person must have signed in at least once before you run this. To take access
away later, set that row's `is_enabled` to `false`.

---

## Part 12 — Check the whole thing works

Run these from the server. Each one should print exactly what the comment says.

```sh
# The three areas all answer through Apache
curl -sI https://cbrl.iitkgp.ac.in/             | head -1   # 200
curl -sI https://cbrl.iitkgp.ac.in/cpms         | head -1   # 200
curl -sI https://cbrl.iitkgp.ac.in/publications | head -1   # 200

# A page that does not exist gives 404 - NOT 503
curl -sI https://cbrl.iitkgp.ac.in/cpms/nope    | head -1   # 404

# The dashboard turns away strangers
curl -sI https://cbrl.iitkgp.ac.in/admin        | head -2   # 307 to /admin/login

# CPMS and the public site have DIFFERENT camera/location rules.
# This is the check that catches an Apache header someone helpfully added.
curl -sI https://cbrl.iitkgp.ac.in/cpms | grep -i permissions-policy
#   expect: geolocation=(self), camera=(self), microphone=()
curl -sI https://cbrl.iitkgp.ac.in/     | grep -i permissions-policy
#   expect: camera=(), microphone=(), geolocation=()
```

Then one check **from a different computer**, not the server:

```sh
curl -sI --connect-timeout 5 http://cbrl.iitkgp.ac.in:3200/
```

**This one must FAIL.** A timeout or "connection refused" is the correct,
successful result. If it returns a web page, the `-H 127.0.0.1` from Part 6 is
missing — go back and fix it before the site goes live.

### Finally, test it as a human

1. Open `https://cbrl.iitkgp.ac.in` in a browser. Click through a few pages.
2. Go to `/admin`, sign in with a granted Google account, change something small,
   and save it. Then reload the public page and confirm the change is there.
   (This one action exercises sign-in, permissions, and saving all at once.)
3. Open `/cpms`, sign in, and use **Attendance**. That tests sign-in, location
   access, and notifications together.

---

## Part 13 — Updating the site later

This is the routine you will use most often. Five commands:

```sh
sudo -u cbrl -i
cd /var/www/cbrl
git pull
npm ci                # only needed if package-lock.json changed - harmless anyway
npm run build
pm2 restart ecosystem.linux.config.js --env production --update-env
```

**Apache needs nothing.** You never have to touch it again after Part 10.

Two things worth knowing:

- **`--update-env` matters.** Without it, the restarted site keeps the settings it
  had when it first started, and your change to `.env.local` appears to have been
  ignored.
- **Only run `pm2 save` if you changed `ecosystem.linux.config.js`.** For an
  ordinary content or code update, you do not need it.

### What does *not* need a deploy

Editing content through the `/admin` dashboard — members, publications, projects,
gallery, photos — saves straight to the database and appears on the site
immediately. No build, no restart, no `git pull`. Only changes to the *code*
need the steps above.

---

## Part 14 — When something goes wrong

**Always start here**, whatever the symptom:

```sh
pm2 list                             # is it online?
pm2 logs cbrl --lines 50 --nostream  # what did it say before it broke?
```

Then find your symptom below.

| What you see | What is actually wrong | What to do |
|---|---|---|
| **`502 Bad Gateway` on every page** | The website is not running; Apache has nothing to talk to | `pm2 list`, then read the logs. Usually a mistake in `.env.local` |
| **`503 Service Unavailable`** on RHEL/Rocky | SELinux is blocking Apache | `sudo setsebool -P httpd_can_network_connect 1` (Part 10.4) |
| **`/cpms` gives `503` but the rest of the site is fine** | An old `ProxyPass /cpms` rule left over from when CPMS was separate | Delete those lines from `cbrl.conf`. There must be only *one* `ProxyPass`, for `/` |
| **Camera or location dead in CPMS** | Someone added security headers to Apache | Remove them (Part 10.3), then re-run the two `permissions-policy` checks in Part 12 |
| **Nobody can sign in, anywhere** | The Supabase address was missing when you built | Fix `.env.local`, then **rebuild** — restarting will not help (Part 4.4) |
| **Dashboard saves fail: *"did not come from the dashboard"*** | The `RequestHeader` lines are missing from Apache, or `ADMIN_ORIGIN` is wrong | Part 10.2 and Part 4 |
| **Editors get signed out every few minutes** | Normal — the idle timeout defaults to 5 minutes | Add `ADMIN_IDLE_TIMEOUT_MINUTES=15` to `.env.local` and restart |
| **Everyone was signed out after a deploy** | `ADMIN_SESSION_SECRET` changed | Put the original value back. Never regenerate it |
| **You changed a key and nothing happened** | It starts with `NEXT_PUBLIC_`, so it was frozen at build time | Rebuild (Part 4.4) |
| **The site is gone after a reboot** | `pm2 save` was not re-run, or Node was installed with `nvm` | Part 8, and Part 2.2 |
| **The disk filled up** | Log rotation was never set up | Part 9 |
| **A page shows the public site's 404 instead of a CPMS one** | Expected behaviour, not a fault | Nothing to do |

### Two habits that save hours

1. **Test inward-out.** If the site is broken, first check
   `curl -sI http://127.0.0.1:3200/` on the server. If *that* works, the problem
   is Apache. If it does not, the problem is the website — and Apache is
   innocent. This one check halves your search area every time.
2. **Change one thing, then check.** Editing `.env.local`, the ecosystem file and
   the Apache config all at once, then restarting everything, means a failure
   tells you nothing about which change caused it.

---

## Part 15 — Command cheat sheet

Print this bit and stick it near your desk.

| Command | What it does |
|---|---|
| `sudo -u cbrl -i` | Become the website's account (needed for most commands below) |
| `pm2 list` | Is the site up? How much memory? How many crashes? |
| `pm2 logs cbrl` | Watch what the site is doing right now (**Ctrl+C** to stop) |
| `pm2 logs cbrl --lines 100 --nostream` | The last 100 log lines, then back to the prompt |
| `pm2 restart cbrl` | Restart the site (a few seconds of downtime) |
| `pm2 restart all --update-env` | Restart *and* pick up changes to `.env.local` |
| `pm2 stop cbrl` | Take the site offline deliberately |
| `pm2 start cbrl` | Bring it back |
| `pm2 monit` | Live dashboard of memory and processor use |
| `pm2 save` | Remember the current setup for the next reboot |
| `pm2 describe cbrl` | Everything PM2 knows about the site — best for "which settings did it actually get?" |
| `sudo systemctl reload apache2` | Apply an Apache configuration change |
| `sudo apachectl configtest` | Check the Apache config for typos *before* reloading |
| `curl -sI http://127.0.0.1:3200/ \| head -1` | Is the website itself alive, ignoring Apache? |

---

## Appendix — A short glossary

| Word | What it means here |
|---|---|
| **Node.js** | The engine that runs the website's code on the server |
| **PM2** | The tool that keeps that engine running and restarts it when needed |
| **Apache** | The web server that faces the internet and passes requests inward |
| **Reverse proxy** | What Apache is doing: taking requests and forwarding them to a program behind it |
| **Port** | A numbered door on the server. The website uses 3200; the web uses 443 for HTTPS and 80 for HTTP |
| **`127.0.0.1` / localhost** | "This server, talking to itself." Nothing outside can reach it |
| **Build** | Converting human-readable code into the fast version that gets served |
| **Deploy** | Getting a new version of the code onto the live server |
| **Environment variable** | A setting stored outside the code — the lines in `.env.local` |
| **Supabase** | The hosted database and sign-in service the site uses |
| **`sudo`** | "Run this as administrator" |
| **`curl -sI`** | Fetch just the summary of a web page, not the page itself — a quick "is it alive?" test |
| **HTTP status codes** | `200` = fine, `307` = redirecting you elsewhere, `404` = no such page, `502`/`503` = the server behind Apache is not answering |
