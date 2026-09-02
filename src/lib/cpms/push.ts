import { supabase } from '@/lib/supabase/cpms-client';
import { asset, basePath } from '@/lib/cpms/base-path';

// The worker is served from /cpms/sw.js, so it controls exactly /cpms/ — the
// main CBRL site is deliberately outside its scope. Both register() and
// getRegistration() have to name it, or getRegistration() falls back to the
// current page's scope and can miss the registration.
const SW_SCOPE = `${basePath}/`;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function getPushStatus(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push notifications not supported on this device.' };
  try {
    const reg = await navigator.serviceWorker.register(asset('/sw.js'), { scope: SW_SCOPE });
    await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Notification permission denied.' };

    const { data: keyData, error: keyErr } = await supabase.functions.invoke('vapid-public-key');
    if (keyErr || !keyData?.publicKey) return { ok: false, error: 'Could not fetch VAPID key.' };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
    const json: any = sub.toJSON();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in.' };

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    }, { onConflict: 'endpoint' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Subscribe failed.' };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
}