'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ExternalLink, LogOut, Menu, Moon, Sun, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { adminNav } from './nav';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

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
  );
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {adminNav.map((item) => {
        // /admin must not light up for every child route.
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <item.icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
              )}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-none text-foreground">
                {item.label}
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminShell({
  children,
  account,
}: {
  children: React.ReactNode;
  /** Email of the signed-in editor, or null if it could not be read. */
  account?: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Institutional strip — the same one the public site opens with, so the
          dashboard reads as part of the site rather than a separate tool. */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-8 max-w-[1600px] items-center justify-between gap-4 px-4 text-xs sm:px-6">
          <p className="min-w-0 truncate">
            Clinical Biomarker Research Laboratory
            <span className="hidden md:inline"> &middot; Content dashboard</span>
          </p>
          <p className="hidden max-w-[45%] shrink-0 truncate sm:block" title={account ?? undefined}>
            {account ?? 'Signed in'}
          </p>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open dashboard menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <Link href="/admin" className="flex min-w-0 items-center gap-3">
              <Image
                src="/cbrl-logo.png"
                alt=""
                width={44}
                height={44}
                quality={60}
                className="h-9 w-auto"
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[15px] font-bold tracking-tight text-foreground">
                  CBRL Dashboard
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Website content
                </span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href="/" target="_blank" rel="noopener noreferrer">
                View site
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 px-4 sm:px-6">
        <aside className="hidden w-72 shrink-0 border-r py-8 pr-6 lg:block">
          {/* Heading inside the sticky container, not above it — otherwise it
              scrolls away and leaves the pinned links unlabelled. */}
          <div className="sticky top-28">
            <p className="mb-4 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Sections
            </p>
            <SidebarLinks />
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-8 lg:pl-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[19rem] max-w-[85vw] overflow-y-auto border-r bg-card p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sections
              </p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <SidebarLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
