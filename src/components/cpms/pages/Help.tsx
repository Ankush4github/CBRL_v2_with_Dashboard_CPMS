"use client";

import { useState, useMemo, ReactNode } from "react";
import PageHeader from "@/components/cpms/PageHeader";
import { Input } from "@/components/cpms/ui/input";
import { Card, CardContent } from "@/components/cpms/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/cpms/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/cpms/ui/table";
import {
  Search,
  Info,
  LogIn,
  LayoutDashboard,
  ScanLine,
  Users,
  FileText,
  MapPin,
  Bell,
  Shield,
  LifeBuoy,
} from "lucide-react";

/**
 * In-app copy of docs/USER_GUIDE.md, available to every signed-in user.
 *
 * The content is duplicated from that file rather than imported: rendering the
 * markdown would need react-markdown, and `npm install` currently fails on a
 * pre-existing peer conflict (@vitejs/plugin-react-swc declares vite ^4–^7
 * against the installed vite 8). If that gets resolved, this page is a good
 * candidate for importing `docs/USER_GUIDE.md?raw` instead so there is a single
 * source of truth. Until then, edit both together.
 */

const P = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>
);

const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground mb-3">{children}</ul>
);

const Note = ({ children }: { children: ReactNode }) => (
  <div className="border-l-4 border-primary bg-accent/40 px-4 py-3 text-sm mb-3">{children}</div>
);

const Tip = ({ q, children }: { q: string; children: ReactNode }) => (
  <div className="border-2 border-border p-3 mb-3">
    <p className="font-semibold text-sm mb-1">{q}</p>
    <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
  </div>
);

interface Section {
  id: string;
  title: string;
  icon: typeof Info;
  keywords: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "what",
    title: "What CPMS is",
    icon: Info,
    keywords: "about overview intro what is cpms scan records attendance",
    body: (
      <>
        <P>
          CPMS captures and manages patient prescription records across multiple hospitals, plus
          GPS-verified staff attendance. The three things you&apos;ll use most:
        </P>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead>What it does</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Scan Prescription</TableCell>
              <TableCell>
                Photograph or upload a prescription; AI reads it and fills the patient form for you
                to check and save.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Patient Records</TableCell>
              <TableCell>Search, filter, view, and export the records you have access to.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Attendance</TableCell>
              <TableCell>
                Check in and out at your assigned hospital, verified against the hospital&apos;s GPS
                geofence and working hours.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <P>
          CPMS works in any modern browser on desktop and mobile. On phones you get a bottom
          navigation bar and card-style lists instead of wide tables.
        </P>
      </>
    ),
  },
  {
    id: "signin",
    title: "Signing in for the first time",
    icon: LogIn,
    keywords:
      "login sign in google onboarding profile setup logout timeout inactivity invite invitation pending activation activate waiting approval",
    body: (
      <>
        <P>
          CPMS uses <strong>Google sign-in only</strong>. There is no username/password option — if
          your Google account isn&apos;t the one your administrator registered, sign out of Google first
          and retry.
        </P>
        <P>
          Most people are <strong>invited</strong> before they ever open CPMS. A master
          administrator registers the Google address you will sign in with, together with your role
          and the hospitals you work at, and those are applied automatically the moment you first
          sign in. You do not need the invitation in your inbox — there is nothing to click, and no
          link to lose.
        </P>
        <P>
          Signing in is not the same as having access. You will land on a{" "}
          <strong>Pending activation</strong> screen, which shows the role and hospitals you were
          given and stays there until an administrator switches the account on. Nothing is lost
          while you wait: when they tell you it is done, press <strong>Check again</strong> on that
          screen and you go straight in, without signing in a second time.
        </P>
        <P>Once the account is active, you complete a short setup form:</P>
        <UL>
          <li>
            <strong>Laboratory / Hospital Name</strong> — free text, up to 100 characters.
          </li>
          <li>
            <strong>Your Role</strong> — Professor, Doctor, Nurse, Research Scholar, Administrator,
            Lab Technician, Sample Collector, or Other.
          </li>
        </UL>
        <Note>
          This is a descriptive profile only. It does <strong>not</strong> grant access to any
          hospital&apos;s records — that comes from the hospital assignments your administrator gives you.
        </Note>
        <P>
          <strong>Automatic logout:</strong> you&apos;re signed out after{" "}
          <strong>5 minutes of inactivity</strong>, with a warning one minute before. Any mouse
          movement, click, keypress, scroll, or touch resets the timer.
        </P>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "The Dashboard",
    icon: LayoutDashboard,
    keywords: "dashboard home statistics cards recent activity navigation",
    body: (
      <>
        <P>
          The Dashboard is your home screen. The top bar shows your role badge (USER / ADMIN /
          MASTER), your name, and a logout button.
        </P>
        <P>
          <strong>Statistics cards</strong> show total patients, scans recorded today, and hospitals
          configured. These counts reflect only records you&apos;re permitted to see.
        </P>
        <P>
          <strong>Action cards</strong> take you where you need to go:
        </P>
        <UL>
          <li>View Patient Details → the patient list</li>
          <li>Scan Prescription → the 3-step scan flow</li>
          <li>Attendance Check-in → attendance</li>
          <li>Attendance Reports → admins and masters only</li>
          <li>User Management → admins and masters only</li>
          <li>Hospital Management → masters only</li>
        </UL>
        <P>
          <strong>Recent Activity</strong> lists the five most recent patient records with who
          scanned them and how long ago.
        </P>
      </>
    ),
  },
  {
    id: "scan",
    title: "Scanning a prescription",
    icon: ScanLine,
    keywords:
      "scan prescription ocr ai extract camera photo upload crop enhance reference number confidence medicines pis icf trf",
    body: (
      <>
        <P>
          The flow has three steps: <strong>1 OCR → 2 Documents → 3 Review</strong>.
        </P>
        <p className="font-semibold text-sm mb-2">Step 1 — Upload the prescription</p>
        <UL>
          <li>Drag and drop a file, click to browse, or use Take Photo for the device camera.</li>
          <li>
            Accepted: <strong>JPG or PNG</strong>. Maximum <strong>10 MB</strong>. PDFs cannot be
            read by the extraction step, so photograph or screenshot the prescription instead; PDFs
            are still fine as additional documents in step 2.
          </li>
          <li>
            The document processor opens automatically for images — drag the corner handles to crop,
            then pick Original, Grayscale, B &amp; W, or Auto Enhance. Better cropping and contrast
            noticeably improve accuracy on handwriting.
          </li>
          <li>
            Fill in <strong>Patient ID / UHID</strong> and <strong>Select Hospital</strong> (only
            hospitals you&apos;re assigned to appear).
          </li>
        </UL>
        <P>
          A <strong>Reference Number</strong> preview appears once you pick a hospital — hospital&apos;s
          first letter + month + year + sequence (e.g. <code>F0720261</code>). The final number is
          generated at save time, so the preview may shift by one if a colleague saves first.
        </P>
        <p className="font-semibold text-sm mb-2">Step 2 — Additional documents (optional)</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Meaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">PIS</TableCell>
              <TableCell>Patient Information Sheet</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">ICF</TableCell>
              <TableCell>Signed Informed Consent Form</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">TRF</TableCell>
              <TableCell>Test Requisition Form</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">ADD_RX</TableCell>
              <TableCell>Additional Prescription</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <P>
          Pick the Document Type first — the upload area stays disabled until you do. Images are
          compressed automatically (max 1600 px, quality 70%); the limit is <strong>5 MB per file
          after compression</strong>.
        </P>
        <p className="font-semibold text-sm mb-2">Step 3 — Review and edit</p>
        <Note>
          <strong>Always check this screen.</strong> The AI extraction is a starting point, not the
          final word.
        </Note>
        <P>
          BMI is calculated automatically from height and weight. Patient ID and Hospital are
          read-only. The <strong>Confidence Score</strong> tells you how reliably the AI read the
          document:
        </P>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Score</TableHead>
              <TableHead>What to do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-green-600">85–100</TableCell>
              <TableCell>Spot-check and save</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-amber-600">70–84</TableCell>
              <TableCell>Read every field carefully</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-destructive">Below 70</TableCell>
              <TableCell>Verify every field against the original image</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>
    ),
  },
  {
    id: "records",
    title: "Browsing patient records",
    icon: Users,
    keywords: "patients search filter export csv pagination records list",
    body: (
      <>
        <P>
          <strong>Search</strong> matches patient name, Patient ID, or reference number.{" "}
          <strong>Hospital filter</strong> narrows to one hospital.
        </P>
        <P>
          <strong>Export</strong> downloads a CSV of everything matching your current search and
          filter — not just the page on screen. Columns: Reference No, Patient ID, Name, Age, Gender,
          Height, Weight, BMI, Diagnosis, Medicines, Visit Date, Doctor, Hospital.
        </P>
        <P>
          Results are paginated <strong>5 per page</strong>. Desktop shows a table; mobile shows
          tappable cards.
        </P>
        <Note>
          You only ever see records you have permission to see. A standard user sees records they
          uploaded themselves at hospitals they&apos;re assigned to. Admins see all records at their
          hospitals; masters see everything.
        </Note>
      </>
    ),
  },
  {
    id: "detail",
    title: "The patient detail page",
    icon: FileText,
    keywords: "patient detail diagnosis edit audit history export pdf delete prescription image",
    body: (
      <>
        <UL>
          <li>
            <strong>Diagnosis</strong> — click Edit to change it. Every change is recorded in the
            audit trail with your name and timestamp.
          </li>
          <li>
            <strong>Prescription Image</strong> — View opens a preview; Download saves the original.
            Preview links expire after one hour.
          </li>
          <li>
            <strong>Edit History</strong> — every change, with the old value struck through, the new
            value, who changed it, and when.
          </li>
        </UL>
        <P>
          <strong>Export PDF</strong> <em>(admins and masters)</em> builds a single audit-ready PDF
          with the summary, prescription image, and every attachment merged in.
        </P>
        <P>
          <strong>Delete</strong> <em>(masters only)</em> permanently removes the record. There&apos;s a
          confirmation dialog and it cannot be undone.
        </P>
      </>
    ),
  },
  {
    id: "attendance",
    title: "Attendance check-in / check-out",
    icon: MapPin,
    keywords: "attendance check in out gps geofence location working hours on duty radius",
    body: (
      <>
        <P>
          Pick your hospital, optionally add a note, click <strong>Check In</strong>, and allow the
          browser&apos;s location prompt.
        </P>
        <P>Check-in succeeds only when all of these hold:</P>
        <UL>
          <li>You&apos;re assigned to that hospital (masters may check in anywhere).</li>
          <li>The hospital has GPS coordinates configured.</li>
          <li>Today is a working day and the time is inside the hospital&apos;s window (in IST).</li>
          <li>
            You&apos;re inside the geofence — if not, the message tells you how far off you are, e.g. &quot;You
            are 340 m from Fortis Hospital (limit 200 m).&quot;
          </li>
        </UL>
        <Note>
          These rules are enforced on the server as well as in the browser, so there is no way around
          them.
        </Note>
        <P>
          Once checked in the page shows an <strong>On Duty</strong> card with your hospital,
          check-in time, and elapsed duration. The lower card lists your last 20 records; a record
          still open shows the badge <strong>Open</strong>.
        </P>
      </>
    ),
  },
  {
    id: "notifications",
    title: "Notifications and reminders",
    icon: Bell,
    keywords: "notifications bell push alerts email reminders test email mute",
    body: (
      <>
        <P>
          <strong>In-app:</strong> the bell icon on the Attendance page shows unread reminders with a
          red count badge. New notifications arrive live without a refresh.
        </P>
        <P>
          <strong>Browser push:</strong> click <strong>Enable alerts</strong> and allow notifications.
          Reminders then arrive even when CPMS isn&apos;t open. Push is per-device — enable it on each
          device. Some browsers (notably older iOS Safari) don&apos;t support it, and the button is hidden
          there.
        </P>
        <P>
          <strong>Email:</strong> you get an email at shift start, and at shift end if you checked in
          but haven&apos;t checked out. The <strong>Test email</strong> button sends a sample to your own
          account email so you can confirm delivery and check your spam folder.
        </P>
      </>
    ),
  },
  {
    id: "roles",
    title: "Roles and what each can do",
    icon: Shield,
    keywords:
      "roles permissions user admin master access enabled can scan can upload invite invitation activate pending onboarding new staff",
    body: (
      <>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-center">User</TableHead>
                <TableHead className="text-center">Admin</TableHead>
                <TableHead className="text-center">Master</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Scan prescriptions", "✅", "✅", "✅"],
                ["View patient records", "Own uploads", "All at their hospitals", "All"],
                ["Edit diagnosis", "Own uploads", "Own uploads", "All"],
                ["Export patient PDF", "❌", "✅", "✅"],
                ["Delete patient record", "❌", "❌", "✅"],
                ["Attendance check-in/out", "Assigned", "Assigned", "Any hospital"],
                ["Attendance reports", "❌", "Their hospitals", "All"],
                ["User management", "❌", "✅ (limited)", "✅"],
                ["Hospital management", "❌", "❌", "✅"],
              ].map(([label, u, a, m]) => (
                <TableRow key={label}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell className="text-center text-sm">{u}</TableCell>
                  <TableCell className="text-center text-sm">{a}</TableCell>
                  <TableCell className="text-center text-sm">{m}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="font-semibold text-sm mb-2">Bringing someone new in (masters)</p>
        <P>
          User Management has an <strong>Invite</strong> button. Enter the Google address, pick a
          role and at least one hospital, and the invitation waits until that person signs in — at
          which point they receive exactly what was chosen and appear under{" "}
          <strong>Awaiting approval</strong>. Press <strong>Activate</strong> there and they are in.
        </P>
        <UL>
          <li>
            Open invitations are listed under <strong>Invited, not signed in yet</strong>, and can
            be revoked until they are taken up.
          </li>
          <li>
            Inviting sends no email. Tell the person to open CPMS and sign in with Google.
          </li>
          <li>
            An invitation only works for an address that has never signed in. For an existing
            account, edit it in the table instead.
          </li>
          <li>
            A new <strong>master</strong> cannot be created from CPMS at all — not by
            invitation, and not by editing an existing account. Every role you grant has to rank
            below your own, which the database enforces as well as this screen. A second master
            has to be granted directly in the database.
          </li>
        </UL>
        <P>Your administrator can additionally switch off individual permissions:</P>
        <UL>
          <li>
            <strong>Account Enabled</strong> — off means you cannot access records at all.
          </li>
          <li>
            <strong>Can Scan Prescriptions</strong> — off blocks the scan flow.
          </li>
          <li>
            <strong>Can Upload Documents</strong> — off means you cannot attach supporting documents.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "trouble",
    title: "Troubleshooting",
    icon: LifeBuoy,
    keywords:
      "troubleshooting error problem access denied camera file too large busy logged out refresh help",
    body: (
      <>
        <Tip q="&quot;Access denied: You don't have permission to add records for this hospital.&quot;">
          You&apos;re not assigned to the hospital you selected, or your account has been disabled. Ask
          your administrator to check your hospital assignments.
        </Tip>
        <Tip q="Nothing appears in the hospital dropdown.">
          No hospitals have been assigned to you yet. Contact your administrator.
        </Tip>
        <Tip q="&quot;Hospital location not set.&quot;">
          A master admin hasn&apos;t configured that hospital&apos;s GPS coordinates yet. Only they can fix it.
        </Tip>
        <Tip q="&quot;Outside allowed area.&quot;">
          You&apos;re further from the hospital than the configured radius. Move closer and try again.
          Indoors GPS drifts — near a window or outdoors works better.
        </Tip>
        <Tip q="&quot;Attendance not allowed now&quot; / &quot;Outside working hours.&quot;">
          You&apos;re outside the hospital&apos;s configured working-hours window, or it&apos;s a non-working day.
          The allowed window is shown on the same screen.
        </Tip>
        <Tip q="The camera won't open.">
          Your browser blocked camera access. Allow it via the padlock icon in the address bar and
          reload. As a fallback, take a photo with your normal camera app and upload the file.
        </Tip>
        <Tip q="&quot;Unsupported file type&quot; or &quot;File too large&quot;.">
          Prescriptions must be JPG or PNG under 10 MB — PDF is not accepted for the prescription
          itself. Additional documents may be PDF, JPG or PNG, and must be under 5 MB after
          automatic compression.
        </Tip>
        <Tip q="&quot;Service temporarily busy. Please try again in a moment.&quot;">
          The AI extraction service is rate-limited right now. Wait a few seconds and click Extract
          again.
        </Tip>
        <Tip q="&quot;Unable to extract data from prescription.&quot;">
          The image was too unclear. Retake it with better lighting, keep the page flat, fill the
          frame, and use the crop/enhance step.
        </Tip>
        <Tip q="&quot;Could not generate a unique reference number.&quot;">
          A rare collision when several people save at the same moment. Simply click Save again.
        </Tip>
        <Tip q="You were logged out unexpectedly.">
          Five minutes of inactivity signs you out automatically. Sign back in with Google — nothing
          already saved is lost.
        </Tip>
        <P>
          If a problem persists, note the exact on-screen message and the time it happened, and send
          both to your system administrator.
        </P>
      </>
    ),
  },
];

const Help = () => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.keywords.includes(q)
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Help & User Guide" showLogo />

      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <Card className="border-2 border-border">
          <CardContent className="p-4 md:p-6">
            <h1 className="text-2xl font-bold tracking-tight mb-1">User Guide</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Everything you can do in CPMS — signing in, scanning prescriptions, browsing records,
              and marking attendance.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search the guide…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {filtered.length === 0 ? (
          <Card className="border-2 border-border">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No sections match &quot;{query}&quot;. Try a different word, or clear the search.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-border">
            <CardContent className="p-2 md:p-4">
              <Accordion type="multiple" className="w-full">
                {filtered.map((section, i) => {
                  const Icon = section.icon;
                  return (
                    <AccordionItem key={section.id} value={section.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <span className="flex items-center gap-3 text-left">
                          <span className="h-8 w-8 shrink-0 bg-primary flex items-center justify-center">
                            <Icon className="h-4 w-4 text-primary-foreground" />
                          </span>
                          <span className="font-semibold">
                            {i + 1}. {section.title}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-1 pb-4 pt-2">{section.body}</AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center pb-8">
          Still stuck? Send the exact on-screen message and the time it happened to your system
          administrator.
        </p>
      </main>
    </div>
  );
};

export default Help;
