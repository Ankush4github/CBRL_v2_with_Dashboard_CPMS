import type { Metadata } from 'next';
import { Suspense } from 'react';

import { isAdminConfigured } from '@/lib/admin-auth';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm configured={isAdminConfigured()} />
    </Suspense>
  );
}
