import AdminShell from '@/components/admin/AdminShell';
import SessionTimeout from '@/components/admin/SessionTimeout';
import { idleTimeoutSeconds } from '@/lib/admin-auth';
import { getSignedInUser } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Naming the account matters now that sign-in is per-person rather than one
  // shared password: on a browser signed in to more than one Google account it
  // is otherwise impossible to tell which one is making the edits.
  const user = await getSignedInUser();

  return (
    <>
      {/* Sits outside the shell: the warning is an overlay, and nothing about
          it belongs to the page currently being edited. */}
      <SessionTimeout idleTimeoutSeconds={idleTimeoutSeconds()} />
      <AdminShell account={user?.email ?? null}>{children}</AdminShell>
    </>
  );
}
