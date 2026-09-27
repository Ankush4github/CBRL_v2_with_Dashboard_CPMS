"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/cpms/ui/table";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { describeError } from "@/lib/cpms/errors";
import { asset } from "@/lib/cpms/base-path";

/**
 * Every patient record deleted from CPMS: which one, from which hospital, who
 * deleted it and when.
 *
 * Rows come from public.patient_record_deletions, written by a BEFORE DELETE
 * trigger on patient_records (migration 20260926170000). They hold only the
 * identifiers -- the clinical content went with the record -- and RLS limits
 * them to hospitals the viewer administers. Read-only: nothing here can be
 * changed or restored.
 */

interface Deletion {
  id: string;
  patient_record_id: string;
  reference_number: string | null;
  patient_id: string | null;
  hospital: string | null;
  record_created_at: string | null;
  deleted_by: string | null;
  deleted_at: string;
}

const PAGE_SIZE = 25;

const formatIST = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Reference number or Patient ID, as a quoted PostgREST or() filter. */
const deletionSearchFilter = (query: string): string | null => {
  const term = query.trim().replace(/["\\]/g, "");
  if (!term) return null;
  const pattern = `"%${term}%"`;
  return `reference_number.ilike.${pattern},patient_id.ilike.${pattern}`;
};

const DeletedRecords = () => {
  const router = useRouter();
  const [rows, setRows] = useState<Deletion[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;
      let query = supabase
        .from("patient_record_deletions")
        .select("*", { count: "exact" })
        .order("deleted_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      const filter = deletionSearchFilter(appliedSearch);
      if (filter) query = query.or(filter);

      const { data, error: loadError, count } = await query;
      if (loadError) throw loadError;
      const list = (data ?? []) as Deletion[];
      setRows(list);
      setTotal(count ?? 0);

      // Who deleted each one. Masters and admins can read profiles.
      const ids = [...new Set(list.map((r) => r.deleted_by).filter(Boolean))] as string[];
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        setNames(
          new Map(
            (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown user"] as [string, string]),
          ),
        );
      } else {
        setNames(new Map());
      }
    } catch (e) {
      setError(describeError(e, "Could not load deleted records."));
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const deleter = (r: Deletion) => (r.deleted_by ? names.get(r.deleted_by) ?? "Unknown user" : "Unknown user");

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
            <span className="font-bold text-xl tracking-tight">Deleted Records</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Deletion log
              </CardTitle>
              <CardDescription>
                Every patient record deleted from CPMS, newest first. Only the identifiers are kept;
                the record&apos;s contents were removed with it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reference number or Patient ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  aria-label="Search deleted records"
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <Card className="border-2">
              <CardContent className="p-8 text-center text-muted-foreground">
                {appliedSearch.trim() ? "No deleted records match that search." : "No records have been deleted."}
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground px-1">
                {total} deleted record{total !== 1 ? "s" : ""}
              </p>

              {/* Desktop */}
              <Card className="border-2 hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead className="font-bold">Deleted</TableHead>
                        <TableHead className="font-bold">Deleted by</TableHead>
                        <TableHead className="font-bold">Ref. No</TableHead>
                        <TableHead className="font-bold">Patient ID</TableHead>
                        <TableHead className="font-bold">Hospital</TableHead>
                        <TableHead className="font-bold">Record created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">{formatIST(r.deleted_at)}</TableCell>
                          <TableCell>{deleter(r)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.reference_number || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{r.patient_id || "—"}</TableCell>
                          <TableCell>{r.hospital || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatIST(r.record_created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {rows.map((r) => (
                  <Card key={r.id} className="border-2">
                    <CardContent className="p-4 space-y-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{r.reference_number || "No reference"}</span>
                        <span className="px-2 py-0.5 bg-accent text-accent-foreground text-[10px] font-medium">
                          {r.hospital || "—"}
                        </span>
                      </div>
                      <p>
                        Patient ID <span className="font-mono">{r.patient_id || "—"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Deleted {formatIST(r.deleted_at)} by {deleter(r)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-4 py-2 bg-secondary text-sm font-medium min-w-[100px] text-center">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default DeletedRecords;
