import { Camera, UserRound } from 'lucide-react'

/**
 * Shared by the desktop nav and the lazily-loaded mobile menu, so the two can
 * live in separate modules without the link set drifting between them.
 */
export const aboutItems = [
  {
    name: 'About the PI',
    href: '/about-the-pi',
    icon: UserRound,
    description: 'Prof. Koel Chaudhury, Principal Investigator',
  },
  {
    name: 'Gallery',
    href: '/gallery',
    icon: Camera,
    description: 'Lab activities, conferences and events',
  },
]

export const primaryLinks = [{ name: 'Home', href: '/' }]

/* After the About menu, in the CBRL_V2 order: Research and Projects sit in
   the bar rather than under About. */
export const secondaryLinks = [
  { name: 'Research', href: '/research' },
  { name: 'Facilities', href: '/facilities' },
  { name: 'Projects', href: '/projects' },
  { name: 'Publications', href: '/publications' },
  { name: 'Members', href: '/members' },
  { name: 'Contact', href: '/contact' },
]

/** '/' matches only itself; every other entry matches its subtree. */
export function makeIsActive(pathname: string | null) {
  return (href: string) =>
    href === '/' ? pathname === '/' : Boolean(pathname?.startsWith(href))
}
