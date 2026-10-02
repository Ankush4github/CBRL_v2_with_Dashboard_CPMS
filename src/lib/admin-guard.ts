import { NextResponse } from 'next/server';

import { isSiteEditor } from './site-editor';
import { createClient } from './supabase/server';

/**
 * The proxy's identity check, repeated inside a route handler.
 *
 * Most dashboard routes need nothing more than the proxy: what they do is a
 * write that RLS checks again. A few do expensive or outward-facing work
 * *before* any RLS check could refuse them — decoding an upload through sharp,
 * fetching from doi.org — and those call this first, so that a gap in the
 * proxy (a matcher change, a framework bug) does not leave them open.
 *
 * Returns the response to send when the caller is not a signed-in editor, or
 * null to carry on.
 */
export function refuseUnlessEditor(): Promise<NextResponse | null> {
  return editorGuard.refuse();
}

async function refuseUnlessSignedInEditor(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    if (!(await isSiteEditor(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is not a website editor.' }, { status: 403 });
    }
    return null;
  } catch {
    // Supabase unreachable: refuse, as the proxy does.
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
}

/**
 * The check itself, held in an object so the scripts/test-*.mts suites — which
 * call route handlers directly, outside any request — can stand in a signed-in
 * editor and reach the validation behind it. Only code running in this server
 * process can reassign it.
 */
export const editorGuard = {
  refuse: refuseUnlessSignedInEditor,
};
