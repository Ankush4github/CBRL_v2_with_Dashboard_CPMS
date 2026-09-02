"use client";

import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/cpms/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/cpms/ui/popover';
import { Badge } from '@/components/cpms/ui/badge';
import { ScrollArea } from '@/components/cpms/ui/scroll-area';
import { supabase } from '@/lib/supabase/cpms-client';
import { useAuth } from '@/hooks/cpms/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from "next/navigation";
import { asset } from "@/lib/cpms/base-path";

type Notif = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read_status: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id,title,message,notification_type,read_status,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data as Notif[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase.channel('notif-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unread = items.filter((n) => !n.read_status).length;

  const markAllRead = async () => {
    if (!user || !unread) return;
    await supabase.from('notifications').update({ read_status: true })
      .eq('user_id', user.id).eq('read_status', false);
    load();
  };

  const openItem = async (n: Notif) => {
    if (!n.read_status) {
      await supabase.from('notifications').update({ read_status: true }).eq('id', n.id);
    }
    setOpen(false);
    router.push(asset('/attendance'));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs">
              {unread > 9 ? '9+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full text-left p-3 hover:bg-accent transition ${!n.read_status ? 'bg-accent/40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_status && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}