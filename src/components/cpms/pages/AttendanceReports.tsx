"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/cpms/ui/select";
import { Badge } from "@/components/cpms/ui/badge";
import { Activity, ArrowLeft, Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError } from "@/lib/cpms/errors";
import { useRole } from "@/hooks/cpms/useRole";
import { useHospitals } from "@/hooks/cpms/useHospitals";
import { asset } from "@/lib/cpms/base-path";

interface Row {
  id: string;
  user_id: string;
  hospital: string;
  check_in_at: string;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  notes: string | null;
  user_name?: string;
  user_email?: string;
}

const AttendanceReports = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useRole();
  const { hospitalOptions } = useHospitals(true);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [hospital, setHospital] = useState("all");
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [userQuery, setUserQuery] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({ title: "Access denied", description: "Admin only.", variant: "destructive" });
      router.push(asset("/dashboard"));
    }
  }, [roleLoading, isAdmin, router, toast]);

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("attendance_records")
          .select("id, user_id, hospital, check_in_at, check_out_at, check_in_distance_meters, check_out_distance_meters, notes")
          .gte("check_in_at", `${from}T00:00:00`)
          .lte("check_in_at", `${to}T23:59:59`)
          .order("check_in_at", { ascending: false });
        if (hospital !== "all") q = q.eq("hospital", hospital);
        const { data, error } = await q;
        if (error) throw error;
        const records = (data || []) as Row[];
        const userIds = [...new Set(records.map((r) => r.user_id))];
        let profileMap = new Map<string, { full_name: string | null; email: string | null }>();
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles").select("id, full_name, email").in("id", userIds);
          profileMap = new Map((profs || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
        }
        setRows(records.map((r) => ({
          ...r,
          user_name: profileMap.get(r.user_id)?.full_name || "",
          user_email: profileMap.get(r.user_id)?.email || "",
        })));
      } catch (err: any) {
        toast({
          title: "Failed to load reports",
          description: describeError(err, 'Could not load the attendance reports.'),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    if (isAdmin) fetchRows();
  }, [from, to, hospital, isAdmin, toast]);

  const filtered = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.user_name || "").toLowerCase().includes(q) || (r.user_email || "").toLowerCase().includes(q)
    );
  }, [rows, userQuery]);

  const fmtDur = (s: string, e: string | null) => {
    if (!e) return "—";
    const m = Math.max(0, Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 60000));
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const exportCsv = () => {
    const header = ["User", "Email", "Hospital", "Check-in", "Check-out", "Duration", "In Distance (m)", "Out Distance (m)", "Notes"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      const cells = [
        r.user_name || "",
        r.user_email || "",
        r.hospital,
        new Date(r.check_in_at).toLocaleString(),
        r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "",
        fmtDur(r.check_in_at, r.check_out_at),
        r.check_in_distance_meters?.toFixed(0) || "",
        r.check_out_distance_meters?.toFixed(0) || "",
        (r.notes || "").replace(/\n/g, " "),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-9 w-9 bg-primary flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg sm:text-xl flex-1">Attendance Reports</span>
          <Button onClick={exportCsv} variant="outline" className="gap-2" disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>Refine records by date, hospital, and user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium">From</label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium">To</label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium">Hospital</label>
                  <Select value={hospital} onValueChange={setHospital}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {hospitalOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Search user</label>
                  <Input placeholder="Name or email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base">{filtered.length} records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">No records match the filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="p-2">User</th>
                        <th className="p-2">Hospital</th>
                        <th className="p-2">Check-in</th>
                        <th className="p-2">Check-out</th>
                        <th className="p-2">Duration</th>
                        <th className="p-2">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="p-2">
                            <div className="font-medium">{r.user_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.user_email}</div>
                          </td>
                          <td className="p-2">{r.hospital}</td>
                          <td className="p-2 whitespace-nowrap">{new Date(r.check_in_at).toLocaleString()}</td>
                          <td className="p-2 whitespace-nowrap">{r.check_out_at ? new Date(r.check_out_at).toLocaleString() : <Badge>Open</Badge>}</td>
                          <td className="p-2 whitespace-nowrap">{fmtDur(r.check_in_at, r.check_out_at)}</td>
                          <td className="p-2 whitespace-nowrap text-xs">
                            in: {r.check_in_distance_meters?.toFixed(0) ?? "—"}m
                            {r.check_out_distance_meters != null && <> · out: {r.check_out_distance_meters.toFixed(0)}m</>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AttendanceReports;