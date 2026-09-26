"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/cpms/ui/select";
import { Activity, ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { describeError } from "@/lib/cpms/errors";
import { asset } from "@/lib/cpms/base-path";

/**
 * How often staff correct the AI's reading, per field.
 *
 * Every scanned save writes one `ai:<field>` row to patient_record_audit for
 * each field the operator changed from what the model read
 * (create_patient_record). So corrections / scanned records is a direct
 * measure of how often the model is wrong about that field -- and comparing
 * flagged with unflagged fields says whether its "uncertain" list is worth
 * trusting.
 *
 * Reads only what RLS already lets this admin see, so the numbers cover their
 * assigned hospitals (all of them, for a master).
 */

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "patient_name", label: "Patient name" },
  { key: "medicines", label: "Medicines" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "height_cm", label: "Height" },
  { key: "weight_kg", label: "Weight" },
  { key: "doctor_name", label: "Doctor name" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "visit_date", label: "Visit date" },
  { key: "uhid", label: "UHID" },
];

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

// Enough for any realistic period here; the page says so if it is reached.
const ROW_LIMIT = 2000;

interface ScannedRecord {
  id: string;
  hospital: string;
  extraction_raw: unknown;
}

interface FieldStats {
  key: string;
  label: string;
  corrected: number;
  flagged: number;
  flaggedCorrected: number;
  unflaggedCorrected: number;
}

/** Did the model mark this field as uncertain in its raw reading? */
const wasFlagged = (raw: unknown, field: string): boolean => {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as { uncertain_fields?: unknown; medicines?: unknown };
  if (field === "medicines") {
    return Array.isArray(r.medicines) &&
      r.medicines.some((m) => Array.isArray((m as { uncertain?: unknown })?.uncertain) &&
        ((m as { uncertain: unknown[] }).uncertain.length > 0));
  }
  return Array.isArray(r.uncertain_fields) && r.uncertain_fields.includes(field);
};

const pct = (part: number, whole: number) =>
  whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

const ScanQuality = () => {
  const router = useRouter();
  const [period, setPeriod] = useState("90");
  const [hospital, setHospital] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ScannedRecord[]>([]);
  // record id -> fields corrected on it
  const [corrections, setCorrections] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const since = new Date(Date.now() - Number(period) * 86_400_000).toISOString();

      const [recordsRes, auditRes] = await Promise.all([
        supabase
          .from("patient_records")
          .select("id, hospital, extraction_raw")
          .not("extraction_raw", "is", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(ROW_LIMIT),
        // Provenance rows are written in the same transaction as the record,
        // so the same window catches them.
        supabase
          .from("patient_record_audit")
          .select("patient_record_id, field_name")
          .like("field_name", "ai:%")
          .gte("changed_at", since)
          .limit(ROW_LIMIT * FIELDS.length),
      ]);

      if (cancelled) return;
      if (recordsRes.error || auditRes.error) {
        setError(describeError(recordsRes.error ?? auditRes.error, "Could not load scan statistics."));
        setLoading(false);
        return;
      }

      const byRecord = new Map<string, Set<string>>();
      for (const row of auditRes.data ?? []) {
        const field = row.field_name.slice(3);
        const set = byRecord.get(row.patient_record_id) ?? new Set<string>();
        set.add(field);
        byRecord.set(row.patient_record_id, set);
      }

      setRecords((recordsRes.data ?? []) as ScannedRecord[]);
      setCorrections(byRecord);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const hospitals = useMemo(
    () => [...new Set(records.map((r) => r.hospital))].sort(),
    [records],
  );

  const visible = useMemo(
    () => (hospital === "all" ? records : records.filter((r) => r.hospital === hospital)),
    [records, hospital],
  );

  const stats: FieldStats[] = useMemo(
    () =>
      FIELDS.map(({ key, label }) => {
        let corrected = 0, flagged = 0, flaggedCorrected = 0, unflaggedCorrected = 0;
        for (const r of visible) {
          const fixed = corrections.get(r.id)?.has(key) ?? false;
          const isFlagged = wasFlagged(r.extraction_raw, key);
          if (fixed) corrected++;
          if (isFlagged) {
            flagged++;
            if (fixed) flaggedCorrected++;
          } else if (fixed) {
            unflaggedCorrected++;
          }
        }
        return { key, label, corrected, flagged, flaggedCorrected, unflaggedCorrected };
      }).sort((a, b) => b.corrected - a.corrected),
    [visible, corrections],
  );

  const untouched = visible.filter((r) => !corrections.get(r.id)?.size).length;
  const anyFlags = visible.some((r) => FIELDS.some((f) => wasFlagged(r.extraction_raw, f.key)));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))} aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary flex items-center justify-center">
              <Activity className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Scan Accuracy</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="sm:w-48" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={hospital} onValueChange={setHospital}>
              <SelectTrigger className="sm:w-56" aria-label="Hospital">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my hospitals</SelectItem>
                {hospitals.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : visible.length === 0 ? (
            <Card className="border-2">
              <CardContent className="p-8 text-center text-muted-foreground">
                No scanned records in this period.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-2">
                  <CardHeader className="pb-2">
                    <CardDescription>Scanned records</CardDescription>
                    <CardTitle className="text-3xl">{visible.length}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-2">
                  <CardHeader className="pb-2">
                    <CardDescription>Saved exactly as the AI read them</CardDescription>
                    <CardTitle className="text-3xl">{pct(untouched, visible.length)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {untouched} of {visible.length} with no field changed
                  </CardContent>
                </Card>
              </div>

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Corrections by field</CardTitle>
                  <CardDescription>
                    How often staff changed what the AI read. Higher means the AI gets this field
                    wrong more often.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Field</th>
                        <th className="py-2 pr-4 font-medium">Corrected</th>
                        <th className="py-2 pr-4 font-medium">Rate</th>
                        <th className="py-2 pr-4 font-medium">When flagged unclear</th>
                        <th className="py-2 font-medium">When not flagged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s) => {
                        const rate = visible.length ? s.corrected / visible.length : 0;
                        return (
                          <tr key={s.key} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{s.label}</td>
                            <td className="py-2 pr-4 tabular-nums">{s.corrected}</td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 bg-secondary" aria-hidden>
                                  <div className="h-2 bg-primary" style={{ width: `${Math.round(rate * 100)}%` }} />
                                </div>
                                <span className="tabular-nums">{pct(s.corrected, visible.length)}</span>
                              </div>
                            </td>
                            <td className="py-2 pr-4 tabular-nums">
                              {s.flagged ? `${pct(s.flaggedCorrected, s.flagged)} of ${s.flagged}` : "—"}
                            </td>
                            <td className="py-2 tabular-nums">
                              {pct(s.unflaggedCorrected, visible.length - s.flagged)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="text-xs text-muted-foreground space-y-1">
                {anyFlags ? (
                  <p>
                    If &ldquo;when flagged unclear&rdquo; is clearly higher than &ldquo;when not
                    flagged&rdquo;, the AI&apos;s unclear flags are pointing staff at the right
                    places.
                  </p>
                ) : (
                  <p>
                    No scans in this period carry unclear flags yet; they started with the
                    September 2026 update.
                  </p>
                )}
                <p>
                  Visit date counts as corrected when no date was read and the save recorded
                  today&apos;s, since that also differs from the AI&apos;s reading.
                </p>
                {records.length >= ROW_LIMIT && (
                  <p>Showing the most recent {ROW_LIMIT} scanned records in this period.</p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ScanQuality;
