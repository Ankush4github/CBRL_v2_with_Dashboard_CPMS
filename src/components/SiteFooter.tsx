import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Mail, Phone } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { getLastUpdated } from '@/lib/content'

/**
 * Footer for the public site.
 *
 * Extracted from `(site)/layout.tsx` so the 404 page can render it too — that
 * page lives at the app root, because Next only routes an unmatched URL to
 * `app/not-found.tsx`, and so gets none of the group's chrome automatically.
 */
export default async function SiteFooter() {
  const lastUpdated = await getLastUpdated()

  return (
    <footer className="border-t bg-muted/30 transition-colors duration-300">
      <div className="container mx-auto px-4 py-14 sm:px-6">
        {/* Logo and Main Title Section */}
        <div className="mb-10 flex items-center gap-4">
          <Image
            src="/cbrl-logo.png"
            alt="CBRL Logo"
            width={56}
            height={56}
            quality={60}
            className="h-14 w-auto"
          />
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Clinical Biomarker Research Laboratory
            </h2>
            <p className="text-sm text-muted-foreground">
              IIT Kharagpur
            </p>
          </div>
        </div>

        <Separator className="mb-10" />

        {/* Main Footer Content */}
        <div className="mb-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Address */}
          <div className="text-left">
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Address
            </h3>
            <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Clinical Biomarker Research Laboratory</p>
              <p>Room No. 329, 330, 3rd floor</p>
              <p>School of Medical Science and Technology</p>
              <p>Life Science Building, IIT Kharagpur</p>
              <p className="font-medium text-foreground">Kharagpur-721302, West Bengal, India</p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="text-left">
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Quick Links
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: '/about-the-pi', label: 'Prof. Koel Chaudhury' },
                { href: '/publications', label: 'Publications' },
                { href: '/projects', label: 'Projects' },
                { href: '/facilities', label: 'Facilities' },
                { href: '/members', label: 'Members' },
                { href: '/contact', label: 'Contact' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* External Links */}
          <div className="text-left">
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              External Links
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: 'https://www.iitkgp.ac.in/', label: 'IIT Kharagpur' },
                { href: 'https://www.iitkgp.ac.in/department/MM', label: 'SMST' },
                { href: 'http://apna.iitkgp.ac.in/web/', label: 'Apna IIT KGP' },
                { href: 'https://erp.iitkgp.ac.in/', label: 'ERP' },
                { href: 'https://cpms.cbrliitkgp.online/', label: 'CPMS' },
                { href: 'https://www.iitkgp.ac.in/holidays', label: 'Holidays' },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-muted-foreground underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="ml-1.5 h-3 w-3 text-muted-foreground/70" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div className="text-left">
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Connect
            </h3>
            <div className="space-y-3">
              <div className="flex items-center text-sm text-muted-foreground">
                <Mail className="mr-2.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href="mailto:contact.cbrl@smst.iitkgp.ac.in" className="underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline">
                  contact.cbrl@smst.iitkgp.ac.in
                </a>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Mail className="mr-2.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href="mailto:koel@smst.iitkgp.ac.in" className="underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline">
                  koel@smst.iitkgp.ac.in
                </a>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Phone className="mr-2.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href="tel:+9103222282221" className="underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline">
                  +91 03222 282221
                </a>
              </div>
            </div>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Bottom Section */}
        <div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Clinical Biomarker Research Laboratory. All rights reserved.
            </p>
            {lastUpdated && (
              <p className="mt-1 text-sm text-muted-foreground">
                Last updated on:{' '}
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
          <div className="text-center md:text-right">
            <p className="text-sm text-muted-foreground">
              Crafted with💙by{' '}
              <Link
                href="/members/ankush-das"
                className="font-medium text-primary transition-colors duration-200 hover:underline underline-offset-4"
              >
                Ankush Das
              </Link>
              {' '}using React.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
