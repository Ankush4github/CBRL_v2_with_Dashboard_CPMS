import { Camera, FlaskConical, Microscope, UserRound } from 'lucide-react'

/**
 * Shared by the desktop nav and the lazily-loaded mobile menu, so the two can
 * live in separate modules without the link set drifting between them.
 */
export const aboutItems = [
  {
    name: 'About The PI',
    href: '/about-the-pi',
    icon: UserRound,
    description: 'Learn about our PI Prof. Koel Chaudhury',
  },
  {
    name: 'Research',
    href: '/research',
    icon: Microscope,
    description: 'Explore our research initiatives',
  },
  {
    name: 'Projects',
    href: '/projects',
    icon: FlaskConical,
    description: 'Explore our projects',
  },
  {
    name: 'Gallery',
    href: '/gallery',
    icon: Camera,
    description: 'View lab activities and events',
  },
]

export const primaryLinks = [{ name: 'Home', href: '/' }]

export const secondaryLinks = [
  { name: 'Publications', href: '/publications' },
  { name: 'Facilities', href: '/facilities' },
  { name: 'Members', href: '/members' },
  { name: 'Contact', href: '/contact' },
]

/** '/' matches only itself; every other entry matches its subtree. */
export function makeIsActive(pathname: string | null) {
  return (href: string) =>
    href === '/' ? pathname === '/' : Boolean(pathname?.startsWith(href))
}
