import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react'
import { getLastUpdated, getResearch } from '@/lib/content'

/* This site's routes: there is no /about page, and /members is "Members". */
const mainLinks = [
  { name: 'Research', href: '/research' },
  { name: 'Facilities', href: '/facilities' },
  { name: 'Projects', href: '/projects' },
  { name: 'Publications', href: '/publications' },
  { name: 'Members', href: '/members' },
  { name: 'Contact', href: '/contact' },
]

const aboutItems = [
  { name: 'About the PI', href: '/about-the-pi' },
  { name: 'Gallery', href: '/gallery' },
]

const facilityCta = { name: 'Facility Enquiry', href: '/facilities#enquiry' }

const externalLinks = [
  { href: 'https://www.iitkgp.ac.in/', label: 'IIT Kharagpur' },
  { href: 'https://www.iitkgp.ac.in/department/MM', label: 'SMST' },
  { href: 'http://apna.iitkgp.ac.in/web/', label: 'Apna IIT KGP' },
  { href: 'https://erp.iitkgp.ac.in/', label: 'ERP' },
  { href: 'https://cbrl.iitkgp.ac.in/cpms', label: 'CPMS' },
  { href: 'https://www.iitkgp.ac.in/holidays', label: 'Holidays' },
  { href: 'https://www.linkedin.com/company/clinical-biomarkers-research-laboratory', label: 'LinkedIn' },
]

function FooterHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">{children}</h2>
}

const linkClass =
  'text-sm text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline'

/**
 * Footer for the public site.
 *
 * Extracted from `(site)/layout.tsx` so the 404 page can render it too — that
 * page lives at the app root, because Next only routes an unmatched URL to
 * `app/not-found.tsx`, and so gets none of the group's chrome automatically.
 *
 * Research links are read from the research collection, so a renamed or added
 * area in the dashboard appears here without a code change.
 */
export default async function SiteFooter() {
  const [lastUpdated, research] = await Promise.all([getLastUpdated(), getResearch()])

  return (
    <footer className="relative overflow-hidden bg-[hsl(211_62%_8%)] text-white">
      {/* A faint molecular lattice: decoration only. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] opacity-[0.07]"
        viewBox="0 0 200 200"
      >
        <g fill="none" stroke="white" strokeWidth="0.6">
          <path d="M100 20l35 20v40l-35 20-35-20V40z" />
          <path d="M135 80l35 20v40l-35 20-35-20v-40" />
          <path d="M65 80l-35 20v40l35 20 35-20" />
          <path d="M100 140v40" />
        </g>
      </svg>

      <div className="container relative mx-auto px-4 pb-7 pt-10 sm:px-6 lg:pt-12">
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Identity */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5">
                <Image
                  src="/cbrl-logo.png"
                  alt="CBRL logo"
                  width={48}
                  height={48}
                  quality={60}
                  className="h-11 w-11"
                />
              </span>
              <div>
                <p className="text-lg font-semibold leading-tight tracking-tight">
                  Clinical Biomarker Research Laboratory
                </p>
                <p className="mt-1 text-sm text-white/60">
                  School of Medical Science and Technology, IIT Kharagpur
                </p>
              </div>
            </div>

            <address className="mt-8 space-y-3 text-sm not-italic text-white/75">
              <p className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--coral))]" aria-hidden="true" />
                <span>
                  Room No. 329, 330, 3rd floor, Life Science Building
                  <br />
                  IIT Kharagpur, Kharagpur 721302, West Bengal, India
                </span>
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-[hsl(var(--coral))]" aria-hidden="true" />
                <a href="mailto:contact.cbrl@smst.iitkgp.ac.in" className={linkClass}>
                  contact.cbrl@smst.iitkgp.ac.in
                </a>
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-[hsl(var(--coral))]" aria-hidden="true" />
                <a href="mailto:koel@smst.iitkgp.ac.in" className={linkClass}>
                  koel@smst.iitkgp.ac.in
                </a>
              </p>
              <p className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-[hsl(var(--coral))]" aria-hidden="true" />
                <a href="tel:+9103222282221" className={linkClass}>
                  +91 03222 282221
                </a>
              </p>
            </address>
          </div>

          <nav className="grid grid-cols-2 gap-7 sm:grid-cols-4 lg:col-span-8" aria-label="Footer">
            <div>
              <FooterHeading>Explore</FooterHeading>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/" className={linkClass}>Home</Link>
                </li>
                {mainLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>{link.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <FooterHeading>Research</FooterHeading>
              <ul className="space-y-2.5">
                {research.areas.map((area) => (
                  <li key={area.id}>
                    <Link href={`/research#${area.id}`} className={linkClass}>
                      {area.title}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/projects" className={linkClass}>Funded projects</Link>
                </li>
                <li>
                  <Link href="/publications" className={linkClass}>Publications</Link>
                </li>
              </ul>
            </div>

            <div>
              <FooterHeading>Lab</FooterHeading>
              <ul className="space-y-2.5">
                {aboutItems.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={linkClass}>{item.name}</Link>
                  </li>
                ))}
                <li>
                  <Link href="/facilities" className={linkClass}>Instruments</Link>
                </li>
                <li>
                  <Link href="/facilities#charges" className={linkClass}>Slot charges</Link>
                </li>
                <li>
                  <Link href={facilityCta.href} className={linkClass}>{facilityCta.name}</Link>
                </li>
              </ul>
            </div>

            <div>
              <FooterHeading>Institutional</FooterHeading>
              <ul className="space-y-2.5">
                {externalLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${linkClass} inline-flex items-center gap-1`}
                    >
                      {link.label}
                      <ArrowUpRight className="h-3 w-3 text-white/40" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-9 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-white/55 md:flex-row md:items-center md:justify-between">
          <div>
            <p>© {new Date().getFullYear()} Clinical Biomarker Research Laboratory, IIT Kharagpur. All rights reserved.</p>
            {lastUpdated && (
              <p className="mt-1">
                Last updated on{' '}
                <time dateTime={lastUpdated.toISOString()}>
                  {lastUpdated.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  })}
                </time>
              </p>
            )}
          </div>
          <p>
            Crafted with 💙 by{' '}
            <Link
              href="/members/ankush-das"
              className="font-medium text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Ankush Das
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
