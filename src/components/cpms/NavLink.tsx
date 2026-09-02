"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cpms/utils";

/**
 * Drop-in replacement for the react-router NavLink wrapper.
 *
 * The public API is unchanged (`to`, `className`, `activeClassName`) so call
 * sites need no edits. Two behavioural notes:
 *  - `isActive` is derived from usePathname() instead of the router context.
 *  - react-router's `isPending` has no Next equivalent (it came from data-router
 *    transitions). `pendingClassName` is accepted and ignored so existing props
 *    keep type-checking rather than silently disappearing.
 */
interface NavLinkCompatProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">,
    Omit<LinkProps, "href"> {
  to: string;
  children?: ReactNode;
  className?: string;
  activeClassName?: string;
  /** Accepted for source compatibility; Next has no pending link state. */
  pendingClassName?: string;
  /** Match the path exactly rather than by prefix. */
  end?: boolean;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pending, end, to, children, ...props }, ref) => {
    const pathname = usePathname();

    const isActive = end
      ? pathname === to
      : pathname === to || (to !== "/" && pathname?.startsWith(`${to}/`));

    return (
      <Link
        ref={ref}
        href={to}
        aria-current={isActive ? "page" : undefined}
        className={cn(className, isActive && activeClassName)}
        {...props}
      >
        {children}
      </Link>
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
