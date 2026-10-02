"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/cpms/ui/select";
import { Textarea } from "@/components/cpms/ui/textarea";
import { Badge } from "@/components/cpms/ui/badge";
import { Activity, ArrowLeft, Loader2, MapPin, LogIn, LogOut as LogOutIcon, Clock, BellRing, BellOff, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError, describeInvokeError } from "@/lib/cpms/errors";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useRole } from "@/hooks/cpms/useRole";
import { haversineMeters, getCurrentPosition } from "@/lib/cpms/geo";
import NotificationBell from "@/components/cpms/NotificationBell";
import { pushSupported, getPushStatus, subscribeToPush, unsubscribeFromPush } from "@/lib/cpms/push";
import { asset } from "@/lib/cpms/base-path";

interface HospitalGeo {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  work_start_time: string | null;
  work_end_time: string | null;
  checkin_deadline: string | null;
  checkout_deadline: string | null;
  work_days: number[] | null;
}

interface AttendanceRow {
  id: string;
  hospital: string;
  check_in_at: string;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  notes: string | null;
}

const Attendance = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { assignedHospitals, isMaster, loading: roleLoading } = useRole();

  const [hospitals, setHospitals] = useState<HospitalGeo[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openRecord, setOpenRecord] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [pushBusy, setPushBusy] = useState(false);
  const [testEmailBusy, setTestEmailBusy] = useState(false);

  const handleSendTestEmail = async () => {
    setTestEmailBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-attendance-email', {
        body: { event: 'shift_start' },
      });
      if (error) throw error;
      toast({
        title: "Test email sent",
        description: `Check your inbox at ${(data as { sent_to?: string })?.sent_to ?? 'your account email'}.`,
      });
    } catch (e) {
      toast({
        title: "Could not send test email",
        // describeInvokeError, not describeError: this one calls an Edge
        // Function, and the reason it refused — a disabled account, the
        // one-a-minute limit — is in the reply body rather than the error.
        description: await describeInvokeError(e, 'Could not send the test email. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setTestEmailBusy(false);
    }
  };

  useEffect(() => { getPushStatus().then(setPushState); }, []);

  const handleEnablePush = async () => {
    setPushBusy(true);
    const res = await subscribeToPush();
    setPushBusy(false);
    if (res.ok) {
      toast({ title: "Notifications enabled", description: "You'll get attendance reminders on this device." });
      setPushState('granted');
    } else {
      toast({ title: "Could not enable notifications", description: res.error, variant: "destructive" });
    }
  };
  const handleDisablePush = async () => {
    setPushBusy(true);
    await unsubscribeFromPush();
    setPushBusy(false);
    toast({ title: "Notifications disabled on this device" });
  };

  const eligibleHospitals = isMaster
    ? hospitals
    : hospitals.filter((h) => assignedHospitals.includes(h.name));

  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const getIstParts = (ts: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(ts));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const map: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
    return { hhmm: `${get("hour")}:${get("minute")}`, dow: map[get("weekday")] ?? 0 };
  };
  // Check-in is open from the start of the working day until the hospital's
  // check-in deadline; check-out until its check-out deadline, which may be
  // after working hours end. With no deadline set, both close at work end.
  const checkWorkingHours = (h: HospitalGeo | undefined, kind: "in" | "out") => {
    if (!h) return { ok: false, reason: "Hospital not found", start: "", end: "", days: [] as number[] };
    const start = (h.work_start_time ?? "09:00:00").slice(0, 5);
    const workEnd = (h.work_end_time ?? "18:00:00").slice(0, 5);
    const deadline = kind === "in" ? h.checkin_deadline : h.checkout_deadline;
    const end = deadline ? deadline.slice(0, 5) : workEnd;
    const hours = `Working hours ${start}–${workEnd} IST`;
    const windowText = deadline
      ? `${hours} • check-${kind} by ${end} IST`
      : hours;
    const days = h.work_days && h.work_days.length ? h.work_days : [1,2,3,4,5];
    const { hhmm, dow } = getIstParts(nowTs);
    if (!days.includes(dow)) {
      return { ok: false, reason: `Closed today. Working days: ${days.map((d) => DAY_LABELS[d-1]).join(", ")}.`, start, end, days };
    }
    if (hhmm < start) {
      return { ok: false, reason: `Check-${kind} opens at ${start} IST. ${windowText}.`, start, end, days };
    }
    if (hhmm > end) {
      return {
        ok: false,
        reason: deadline
          ? `Check-${kind} deadline (${end} IST) has passed. ${windowText}.`
          : `Outside working hours. Allowed ${start}–${end} IST.`,
        start, end, days,
      };
    }
    return { ok: true, reason: windowText, start, end, days };
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: hData, error: hErr }, { data: aData, error: aErr }] = await Promise.all([
        supabase
          .from("hospitals")
          .select("id, name, latitude, longitude, radius_meters, work_start_time, work_end_time, checkin_deadline, checkout_deadline, work_days")
          .order("name"),
        supabase
          .from("attendance_records")
          .select("id, hospital, check_in_at, check_out_at, check_in_distance_meters, check_out_distance_meters, notes")
          .eq("user_id", user.id)
          .order("check_in_at", { ascending: false })
          .limit(20),
      ]);
      if (hErr) throw hErr;
      if (aErr) throw aErr;
      setHospitals((hData || []) as HospitalGeo[]);
      const rows = (aData || []) as AttendanceRow[];
      setHistory(rows);
      setOpenRecord(rows.find((r) => !r.check_out_at) || null);
    } catch (err: any) {
      toast({
        title: "Failed to load attendance",
        description: describeError(err, 'Could not load your attendance history.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedHospital && eligibleHospitals.length > 0) {
      setSelectedHospital(eligibleHospitals[0].name);
    }
  }, [eligibleHospitals, selectedHospital]);

  const handleCheckIn = async () => {
    if (!user) return;
    const hospital = hospitals.find((h) => h.name === selectedHospital);
    if (!hospital) return;
    const gate = checkWorkingHours(hospital, "in");
    if (!gate.ok) {
      toast({ title: "Attendance not allowed now", description: gate.reason, variant: "destructive" });
      return;
    }
    if (hospital.latitude == null || hospital.longitude == null) {
      toast({
        title: "Hospital location not set",
        description: "Ask a master admin to configure this hospital's coordinates.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const distance = haversineMeters(latitude, longitude, hospital.latitude, hospital.longitude);
      const radius = hospital.radius_meters ?? 200;
      if (distance > radius) {
        toast({
          title: "Outside allowed area",
          description: `You are ${Math.round(distance)}m from ${hospital.name} (limit ${radius}m).`,
          variant: "destructive",
        });
        return;
      }
      const { error } = await supabase.from("attendance_records").insert({
        user_id: user.id,
        hospital: hospital.name,
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        check_in_distance_meters: distance,
        notes: notes || null,
      });
      if (error) throw error;
      toast({ title: "Checked in", description: `${hospital.name} • ${Math.round(distance)}m from center` });
      setNotes("");
      loadData();
    } catch (err: any) {
      toast({
        title: "Check-in failed",
        description: describeError(err, 'Could not record your check-in. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user || !openRecord) return;
    const hospital = hospitals.find((h) => h.name === openRecord.hospital);
    const gate = checkWorkingHours(hospital, "out");
    if (!gate.ok) {
      toast({ title: "Check-out not allowed now", description: gate.reason, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      let distance: number | null = null;
      if (hospital?.latitude != null && hospital?.longitude != null) {
        distance = haversineMeters(latitude, longitude, hospital.latitude, hospital.longitude);
        const radius = hospital.radius_meters ?? 200;
        if (distance > radius) {
          toast({
            title: "Outside allowed area",
            description: `You are ${Math.round(distance)}m from ${hospital.name} (limit ${radius}m).`,
            variant: "destructive",
          });
          return;
        }
      }
      const { error } = await supabase
        .from("attendance_records")
        .update({
          check_out_at: new Date().toISOString(),
          check_out_latitude: latitude,
          check_out_longitude: longitude,
          check_out_distance_meters: distance,
        })
        .eq("id", openRecord.id);
      if (error) throw error;
      toast({ title: "Checked out", description: hospital?.name });
      loadData();
    } catch (err: any) {
      toast({
        title: "Check-out failed",
        description: describeError(err, 'Could not record your check-out. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    const e = end ? new Date(end).getTime() : Date.now();
    const mins = Math.max(0, Math.floor((e - new Date(start).getTime()) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-9 w-9 bg-primary flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg sm:text-xl">Attendance</span>
          <div className="ml-auto flex items-center gap-1">
            {pushState !== 'unsupported' && (
              pushState === 'granted' ? (
                <Button variant="ghost" size="sm" onClick={handleDisablePush} disabled={pushBusy} className="gap-1">
                  <BellOff className="h-4 w-4" /><span className="hidden sm:inline">Mute</span>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleEnablePush} disabled={pushBusy} className="gap-1">
                  <BellRing className="h-4 w-4" /><span className="hidden sm:inline">Enable alerts</span>
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendTestEmail}
              disabled={testEmailBusy}
              className="gap-1"
              title="Send a test attendance reminder to your email"
            >
              {testEmailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              <span className="hidden sm:inline">Test email</span>
            </Button>
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {roleLoading || loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : openRecord ? (
            <Card className="border-2 border-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> On Duty</CardTitle>
                  <Badge>{openRecord.hospital}</Badge>
                </div>
                <CardDescription>
                  Checked in {new Date(openRecord.check_in_at).toLocaleTimeString()} • {formatDuration(openRecord.check_in_at, null)} elapsed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const gate = checkWorkingHours(hospitals.find((h) => h.name === openRecord.hospital), "out");
                  return !gate.ok ? (
                    <p className="text-xs text-destructive mb-2">{gate.reason}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-2">{gate.reason}</p>
                  );
                })()}
                <Button
                  onClick={handleCheckOut}
                  disabled={submitting || !checkWorkingHours(hospitals.find((h) => h.name === openRecord.hospital), "out").ok}
                  className="w-full gap-2"
                  size="lg"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOutIcon className="h-4 w-4" />}
                  Check Out
                </Button>
              </CardContent>
            </Card>
          ) : eligibleHospitals.length === 0 ? (
            <Card className="border-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>You are not assigned to any hospital.</p>
                <p className="text-sm">Contact an admin to be assigned before checking in.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LogIn className="h-5 w-5" /> Check In</CardTitle>
                <CardDescription>Your location is verified against the hospital&apos;s geofence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Hospital</label>
                  <Select value={selectedHospital} onValueChange={setSelectedHospital}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eligibleHospitals.map((h) => (
                        <SelectItem key={h.id} value={h.name}>
                          {h.name}{h.latitude == null ? " (no location set)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Notes (optional)</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to add..." rows={2} />
                </div>
                {(() => {
                  const gate = checkWorkingHours(hospitals.find((h) => h.name === selectedHospital), "in");
                  return !gate.ok ? (
                    <p className="text-xs text-destructive">{gate.reason}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{gate.reason}</p>
                  );
                })()}
                <Button
                  onClick={handleCheckIn}
                  disabled={submitting || !selectedHospital || !checkWorkingHours(hospitals.find((h) => h.name === selectedHospital), "in").ok}
                  className="w-full gap-2"
                  size="lg"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Check In
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="border-2">
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
              <CardDescription>Your last 20 records</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No attendance records yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-secondary border border-border">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.hospital}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.check_in_at).toLocaleString()} {r.check_out_at && `→ ${new Date(r.check_out_at).toLocaleTimeString()}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={r.check_out_at ? "secondary" : "default"}>
                          {r.check_out_at ? formatDuration(r.check_in_at, r.check_out_at) : "Open"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Attendance;