'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { aboutItems, makeIsActive, primaryLinks, secondaryLinks } from './nav-links'

/**
 * The mobile drawer, split out of Navigation so it can be pulled in with
 * next/dynamic. Navigation renders on every page and previously shipped both
 * the desktop NavigationMenu and this drawer's Radix Dialog and Accordion to
 * every visitor, though a given viewport only ever uses one of them. The
 * trigger button stays in Navigation, so the menu is tappable immediately;
 * this module is fetched on the first tap.
 */
export default function MobileNav({
  open,
  onOpenChange,
  pathname,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathname: string | null
}) {
  const isActive = makeIsActive(pathname)
  const aboutActive = aboutItems.some((item) => isActive(item.href))
  const close = () => onOpenChange(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3">
            <Image
              src="/cbrl-logo.png"
              alt="CBRL Logo"
              width={32}
              height={32}
              quality={60}
              className="h-8 w-auto"
            />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight">CBRL</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                IIT Kharagpur
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <Separator className="mt-4" />

        <div className="mt-4 flex flex-col">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Navigate
          </p>

          {primaryLinks.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className={cn(
                'border-l-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {item.name}
            </Link>
          ))}

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="about" className="border-b-0">
              <AccordionTrigger
                className={cn(
                  'border-l-2 px-3 py-2.5 text-sm font-medium hover:no-underline',
                  aboutActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                About
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                <div className="ml-3 flex flex-col border-l pl-3">
                  {aboutItems.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={close}
                      className="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <item.icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {item.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {secondaryLinks.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className={cn(
                'border-l-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <Separator className="my-4" />

        <div className="px-3">
          <p className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Contact
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="mailto:contact.cbrl@smst.iitkgp.ac.in"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
              contact.cbrl@smst.iitkgp.ac.in
            </a>
            <a
              href="mailto:koel@smst.iitkgp.ac.in"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
              koel@smst.iitkgp.ac.in
            </a>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
