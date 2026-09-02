'use client';

import * as React from 'react'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronRight, Mail, Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { Separator } from '@/components/ui/separator'
import { aboutItems, makeIsActive, primaryLinks, secondaryLinks } from './nav-links'

// Radix Dialog and Accordion ride along with the drawer, so it is fetched on
// the first tap of the menu button rather than on every page load.
const MobileNav = dynamic(() => import('./MobileNav'), { ssr: false })

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </Button>
  )
}

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileMounted, setMobileMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isActive = makeIsActive(pathname)

  const aboutActive = aboutItems.some((item) => isActive(item.href))

  const desktopLinkClass = (active: boolean | undefined) =>
    cn(
      'inline-flex h-10 items-center bg-transparent px-3 text-sm font-medium decoration-primary decoration-1 underline-offset-8 transition-colors',
      active
        ? 'text-foreground underline'
        : 'text-muted-foreground hover:text-foreground hover:underline hover:decoration-primary/50'
    )

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-all duration-300',
        isScrolled
          ? 'border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80'
          : 'border-border bg-background'
      )}
    >
      {/* Institutional top strip — collapses away on scroll */}
      <div
        className={cn(
          'overflow-hidden bg-primary text-primary-foreground transition-[height] duration-300',
          isScrolled ? 'h-0' : 'h-8'
        )}
      >
        <div className="container mx-auto flex h-8 items-center justify-between gap-4 px-4 text-xs sm:px-6">
          <p className="min-w-0 truncate">
            <span>Indian Institute of Technology Kharagpur</span>
            <span className="hidden md:inline">
              {' '}&middot; School of Medical Science and Technology
            </span>
          </p>
          <p className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
            <Mail className="h-3 w-3" aria-hidden="true" />
            <a
              href="mailto:contact.cbrl@smst.iitkgp.ac.in"
              className="underline-offset-4 hover:underline"
            >
              contact.cbrl@smst.iitkgp.ac.in
            </a>
            <span className="hidden lg:inline" aria-hidden="true">
              &middot;
            </span>
            <a
              href="mailto:koel@smst.iitkgp.ac.in"
              className="hidden underline-offset-4 hover:underline lg:inline"
            >
              koel@smst.iitkgp.ac.in
            </a>
          </p>
        </div>
      </div>

      {/* Main bar */}
      <nav className="container mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Wordmark */}
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Clinical Biomarker Research Laboratory"
          >
            <Image
              src="/cbrl-logo.png"
              alt="CBRL Logo"
              width={44}
              height={44}
              quality={60}
              className="h-10 w-auto sm:h-11"
              priority
            />
            <span className="hidden min-w-0 flex-col leading-tight lg:flex">
              <span className="truncate text-[15px] font-bold tracking-tight text-foreground">
                Clinical Biomarker Research Laboratory
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                IIT Kharagpur
              </span>
            </span>
            <span className="text-xl font-bold tracking-tight text-foreground lg:hidden">
              CBRL
            </span>
          </Link>

          {/* Desktop navigation */}
          <div className="hidden items-center gap-1 md:flex">
            <NavigationMenu>
              <NavigationMenuList className="gap-0">
                {primaryLinks.map((item) => (
                  <NavigationMenuItem key={item.name}>
                    <NavigationMenuLink
                      asChild
                      className={desktopLinkClass(isActive(item.href))}
                    >
                      <Link href={item.href}>{item.name}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}

                <NavigationMenuItem>
                  <NavigationMenuTrigger
                    className={cn(
                      'h-10 bg-transparent px-3 text-sm font-medium decoration-primary decoration-1 underline-offset-8 hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent',
                      aboutActive
                        ? 'text-foreground underline'
                        : 'text-muted-foreground hover:text-foreground hover:underline hover:decoration-primary/50'
                    )}
                  >
                    About
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[340px] sm:w-[400px]">
                      <ul className="p-2">
                        {aboutItems.map((item, index) => (
                          <li key={item.name}>
                            {index > 0 && <Separator className="mx-3 my-0.5 w-auto" />}
                            <NavigationMenuLink asChild>
                              <Link
                                href={item.href}
                                className="group flex select-none items-start gap-3 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                              >
                                <item.icon
                                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                <span className="flex-1 space-y-1">
                                  <span className="block text-sm font-medium leading-none text-foreground">
                                    {item.name}
                                  </span>
                                  <span className="block text-xs leading-snug text-muted-foreground">
                                    {item.description}
                                  </span>
                                </span>
                                <ChevronRight
                                  className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-hidden="true"
                                />
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t bg-muted/40 px-5 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Discover more about our research lab
                        </p>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {secondaryLinks.map((item) => (
                  <NavigationMenuItem key={item.name}>
                    <NavigationMenuLink
                      asChild
                      className={desktopLinkClass(isActive(item.href))}
                    >
                      <Link href={item.href}>{item.name}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
            <Separator orientation="vertical" className="mx-2 h-5" />
            <ThemeToggle />
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open main menu"
              aria-expanded={mobileOpen}
              onClick={() => {
                setMobileMounted(true)
                setMobileOpen(true)
              }}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            {mobileMounted && (
              <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} pathname={pathname} />
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
