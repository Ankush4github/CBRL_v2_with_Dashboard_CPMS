import {
  BookOpen,
  FlaskConical,
  FolderKanban,
  Home,
  Images,
  LayoutDashboard,
  Microscope,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
  /** Public page this section drives. */
  page?: string;
}

export const adminNav: AdminNavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    description: 'What is on the site right now',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/home',
    label: 'Home page',
    description: 'Hero background images and collaborator logos',
    icon: Home,
    page: '/',
  },
  {
    href: '/admin/members',
    label: 'Members',
    description: 'Faculty, postdocs, scholars, staff and alumni',
    icon: Users,
    page: '/members',
  },
  {
    href: '/admin/about',
    label: 'About the PI',
    description: 'The PI profile, biography, awards and contact details',
    icon: UserRound,
    page: '/about-the-pi',
  },
  {
    href: '/admin/publications',
    label: 'Publications',
    description: 'The BibTeX record behind the publications page',
    icon: BookOpen,
    page: '/publications',
  },
  {
    href: '/admin/projects',
    label: 'Projects',
    description: 'Funded research projects and sponsors',
    icon: FolderKanban,
    page: '/projects',
  },
  {
    href: '/admin/research',
    label: 'Research areas',
    description: 'Disease areas and their write-ups',
    icon: Microscope,
    page: '/research',
  },
  {
    href: '/admin/gallery',
    label: 'Gallery',
    description: 'Conference, award and lab-outing albums',
    icon: Images,
    page: '/gallery',
  },
  {
    href: '/admin/facilities',
    label: 'Facilities',
    description: 'Instruments, in-charges and slot charges',
    icon: FlaskConical,
    page: '/facilities',
  },
  {
    href: '/admin/metrics',
    label: 'Citation metrics',
    description: 'Citations and h-index shown on publications',
    icon: TrendingUp,
    page: '/publications',
  },
];
