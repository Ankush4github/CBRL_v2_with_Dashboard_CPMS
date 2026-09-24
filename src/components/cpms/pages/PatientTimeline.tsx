"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/cpms/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Button } from "@/components/cpms/ui/button";
import { Badge } from "@/components/cpms/ui/badge";
import { supabase } from "@/lib/supabase/cpms-client";
import { toast } from "sonner";
import { describeError } from "@/lib/cpms/errors";
import { Loader2, Stethoscope, Pill, CalendarDays, ArrowRight, Plus, Minus } from "lucide-react";
import { asset } from "@/lib/cpms/base-path";

interface Medicine {
  name?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
}

interface Visit {
  id: string;
  reference_number: string | null;
  visit_date: string | null;
  created_at: string;
  patient_name: string;
  diagnosis: string | null;
  doctor_name: string | null;
  age: number | null;
  weight_kg: number | null;
  bmi: number | null;
  medicines: Medicine[] | null;
}

/** Medicine names for one visit, normalised for comparison across visits. */
const medNames = (meds: Medicine[] | null): string[] =>
  (Array.isArray(meds) ? meds : [])
    .map((m) => (m?.name ?? "").trim())
    .filter(Boolean);

const PatientTimeline = () => {
  // Next types params as string | string[]; both of these are single segments.
  const params = useParams();
  const hospital = typeof params.hospital === "string" ? params.hospital : "";
  const patientId = typeof params.patientId === "string" ? params.patientId : "";
  const router = useRouter();

  // Route params arrive encoded — hospital names contain spaces.
  const hospitalName = decodeURIComponent(hospital);
  const pid = decodeURIComponent(patientId);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVisits = async () => {
      // The guard lives here rather than at the call site so that the effect
      // body itself never sets state -- one path in, one path out.
      if (!hospitalName || !pid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("patient_records")
        .select(
          "id, reference_number, visit_date, created_at, patient_name, diagnosis, doctor_name, age, weight_kg, bmi, medicines"
        )
        .eq("hospital", hospitalName)
        .eq("patient_id", pid)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(describeError(error, 'Could not load this patient’s history.'));
        setVisits([]);
      } else {
        setVisits((data as Visit[]) ?? []);
      }
      setLoading(false);
    };

    fetchVisits();
  }, [hospitalName, pid]);

  // Visits are newest-first; compare each against the one before it in time
  // (the next element) to surface what changed at that visit.
  const changes = useMemo(() => {
    return visits.map((v, i) => {
      const previous = visits[i + 1];
      if (!previous) return null;

      const now = medNames(v.medicines);
      const before = medNames(previous.medicines);

      return {
        started: now.filter((m) => !before.includes(m)),
        stopped: before.filter((m) => !now.includes(m)),
        diagnosisChanged:
          (v.diagnosis ?? "").trim() !== (previous.diagnosis ?? "").trim(),
        previousDiagnosis: previous.diagnosis,
      };
    });
  }, [visits]);

  const patientName = visits[0]?.patient_name ?? pid;

  const dateRange = useMemo(() => {
    const dated = visits.map((v) => v.visit_date).filter(Boolean) as string[];
    if (dated.length < 2) return null;
    const oldest = new Date(dated[dated.length - 1]).toLocaleDateString();
    const newest = new Date(dated[0]).toLocaleDateString();
    return `${oldest} → ${newest}`;
  }, [visits]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Patient History" backTo="/patients" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Patient History" backTo="/patients" showLogo />

      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Summary */}
        <Card className="border-2 border-border">
          <CardContent className="p-4 md:p-6">
            <h1 className="text-2xl font-bold tracking-tight">{patientName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Patient ID <span className="font-mono">{pid}</span> · {hospitalName}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="default">
                {visits.length} {visits.length === 1 ? "visit" : "visits"}
              </Badge>
              {dateRange && <Badge variant="secondary">{dateRange}</Badge>}
            </div>
            {visits.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Shows records you have permission to view. Colleagues&apos; records for this patient may
                not appear.
              </p>
            )}
          </CardContent>
        </Card>

        {visits.length === 0 ? (
          <Card className="border-2 border-border">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No records found for this Patient ID at {hospitalName}.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visits.map((v, i) => {
              const change = changes[i];
              const meds = Array.isArray(v.medicines) ? v.medicines : [];
              return (
                <Card key={v.id} className="border-2 border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        {v.visit_date
                          ? new Date(v.visit_date).toLocaleDateString()
                          : new Date(v.created_at).toLocaleDateString()}
                        {i === 0 && <Badge variant="default" className="ml-1">Latest</Badge>}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {v.reference_number && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {v.reference_number}
                          </span>
                        )}
                        <Button size="sm" variant="outline" onClick={() => router.push(asset(`/patients/${v.id}`))}>
                          Open
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2 text-sm">
                      <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p>{v.diagnosis || <span className="text-muted-foreground">No diagnosis recorded</span>}</p>
                        {change?.diagnosisChanged && change.previousDiagnosis && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                            <span className="line-through">{change.previousDiagnosis}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-medium text-foreground">changed at this visit</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {meds.length > 0 && (
                      <div className="flex items-start gap-2 text-sm">
                        <Pill className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <ul className="space-y-0.5">
                            {meds.map((m, k) => (
                              <li key={k} className="text-sm">
                                <span className="font-medium">{m?.name || "Unnamed"}</span>
                                {m?.dosage ? ` — ${m.dosage}` : ""}
                                {m?.duration ? ` · ${m.duration}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {change && (change.started.length > 0 || change.stopped.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {change.started.map((m) => (
                          <span
                            key={`s-${m}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent text-accent-foreground border border-border"
                          >
                            <Plus className="h-3 w-3" /> {m}
                          </span>
                        ))}
                        {change.stopped.map((m) => (
                          <span
                            key={`x-${m}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground border border-border line-through"
                          >
                            <Minus className="h-3 w-3" /> {m}
                          </span>
                        ))}
                      </div>
                    )}

                    {(v.doctor_name || v.weight_kg || v.bmi) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t">
                        {v.doctor_name && <span>Dr. {v.doctor_name}</span>}
                        {v.age != null && <span>Age {v.age}</span>}
                        {v.weight_kg != null && <span>{v.weight_kg} kg</span>}
                        {v.bmi != null && <span>BMI {v.bmi}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default PatientTimeline;
