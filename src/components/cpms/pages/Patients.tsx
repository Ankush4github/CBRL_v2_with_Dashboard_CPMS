"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/cpms/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/cpms/ui/table";
import { ArrowLeft, Download, Search, User, ChevronLeft, ChevronRight, RefreshCw, Loader2, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError } from "@/lib/cpms/errors";
import { useHospitals } from "@/hooks/cpms/useHospitals";
import { asset } from "@/lib/cpms/base-path";
interface Patient {
  id: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  diagnosis: string | null;
  medicines: any;
  visit_date: string | null;
  doctor_name: string | null;
  hospital: string;
  reference_number: string | null;
}

const Patients = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { hospitalOptions } = useHospitals(true); // Include "All Hospitals" option
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("patient_records")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPatients(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching patients",
        description: describeError(error, 'Could not load the patient list.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter((patient) => {
    const matchesHospital = selectedHospital === "all" || patient.hospital === selectedHospital;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      patient.patient_name.toLowerCase().includes(searchLower) ||
      patient.patient_id?.toLowerCase().includes(searchLower) ||
      patient.reference_number?.toLowerCase().includes(searchLower);
    return matchesHospital && matchesSearch;
  });

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginatedPatients = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Each medicine with its dose, frequency and duration -- the export used to
  // carry names only, which dropped the instructions a reader actually needs.
  const formatMedicines = (medicines: any): string => {
    if (!medicines) return "N/A";
    if (Array.isArray(medicines)) {
      return medicines
        .map((m: any) => {
          if (typeof m === "string") return m;
          const details = [m?.dosage, m?.frequency, m?.duration].filter(Boolean).join(", ");
          const name = m?.name || "Unnamed";
          return details ? `${name} (${details})` : name;
        })
        .join("; ");
    }
    return String(medicines);
  };

  const escapeCSVField = (field: string): string => {
    // Spreadsheets run a cell starting with = + - @ (or tab/CR) as a formula:
    // "+ve" shows as #NAME?, and a crafted name or diagnosis could execute.
    // A leading apostrophe makes Excel and Sheets treat it as text.
    let value = field;
    if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const exportToCsv = () => {
    const headers = ["Reference No", "Patient ID", "Name", "Age", "Gender", "Height (cm)", "Weight (kg)", "BMI", "Diagnosis", "Medicines", "Visit Date", "Doctor", "Hospital"];
    const csvContent = [
      headers.join(","),
      ...filteredPatients.map((p) =>
        [
          escapeCSVField(p.reference_number || ""),
          escapeCSVField(p.patient_id || ""),
          escapeCSVField(p.patient_name),
          p.age ?? "",
          escapeCSVField(p.gender || ""),
          p.height_cm ?? "",
          p.weight_kg ?? "",
          p.bmi ?? "",
          escapeCSVField(p.diagnosis || ""),
          escapeCSVField(formatMedicines(p.medicines)),
          escapeCSVField(p.visit_date || ""),
          escapeCSVField(p.doctor_name || ""),
          escapeCSVField(p.hospital)
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients_${selectedHospital}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))} className="h-9 w-9 sm:h-10 sm:w-10">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <img src={asset("/cbrl-logo.png")} alt="CBRL Logo" className="h-8 w-8 sm:h-10 sm:w-10 object-contain shrink-0" />
            <span className="font-bold text-lg sm:text-xl tracking-tight truncate">Patients</span>
          </div>
          <Button variant="outline" size="icon" onClick={fetchPatients} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Filters */}
          <Card className="border-2">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, ID, or ref..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10 h-11 sm:h-10"
                  />
                </div>
                {/* Hospital Select and Export */}
                <div className="flex gap-2 sm:gap-4">
                  <Select
                    value={selectedHospital}
                    onValueChange={(value) => {
                      setSelectedHospital(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="flex-1 h-11 sm:h-10">
                      <SelectValue placeholder="Hospital" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitalOptions.map((hospital) => (
                        <SelectItem key={hospital.value} value={hospital.value}>
                          {hospital.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={exportToCsv} variant="outline" className="gap-2 h-11 sm:h-10 px-3 sm:px-4 shrink-0">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results count */}
          {!loading && (
            <p className="text-sm text-muted-foreground px-1">
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Loading State */}
          {loading && (
            <Card className="border-2">
              <CardContent className="p-8 sm:p-12 text-center">
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading patients...</p>
              </CardContent>
            </Card>
          )}

          {/* Desktop Table View */}
          {!loading && (
            <div className="hidden lg:block">
              <Card className="border-2">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead className="font-bold">Ref. No</TableHead>
                        <TableHead className="font-bold">Patient ID</TableHead>
                        <TableHead className="font-bold">Patient Name</TableHead>
                        <TableHead className="font-bold">Age</TableHead>
                        <TableHead className="font-bold">Gender</TableHead>
                        <TableHead className="font-bold">Height (cm)</TableHead>
                        <TableHead className="font-bold">Weight (kg)</TableHead>
                        <TableHead className="font-bold">BMI</TableHead>
                        <TableHead className="font-bold">Diagnosis</TableHead>
                        <TableHead className="font-bold">Medicines</TableHead>
                        <TableHead className="font-bold">Visit Date</TableHead>
                        <TableHead className="font-bold">Doctor</TableHead>
                        <TableHead className="font-bold w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPatients.map((patient) => (
                        <TableRow key={patient.id} className="border-b hover:bg-secondary">
                          <TableCell className="font-mono text-xs">{patient.reference_number || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{patient.patient_id || "N/A"}</TableCell>
                          <TableCell className="font-medium">{patient.patient_name}</TableCell>
                          <TableCell>{patient.age ?? "N/A"}</TableCell>
                          <TableCell>{patient.gender || "N/A"}</TableCell>
                          <TableCell>{patient.height_cm ?? "N/A"}</TableCell>
                          <TableCell>{patient.weight_kg ?? "N/A"}</TableCell>
                          <TableCell>{patient.bmi ?? "N/A"}</TableCell>
                          <TableCell>{patient.diagnosis || "N/A"}</TableCell>
                          <TableCell>{formatMedicines(patient.medicines)}</TableCell>
                          <TableCell>{patient.visit_date || "N/A"}</TableCell>
                          <TableCell>{patient.doctor_name || "N/A"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(asset(`/patients/${patient.id}`))}
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Mobile Card View */}
          {!loading && (
            <div className="lg:hidden space-y-3">
              {paginatedPatients.map((patient) => (
                <Card 
                  key={patient.id} 
                  className="border-2 cursor-pointer hover:border-primary active:scale-[0.99] transition-all" 
                  onClick={() => router.push(asset(`/patients/${patient.id}`))}
                >
                  <CardContent className="p-3 sm:p-4">
                    {/* Header with avatar and name */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-11 w-11 bg-secondary flex items-center justify-center shrink-0 rounded-md">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{patient.patient_name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {patient.reference_number && (
                            <span className="font-mono">{patient.reference_number}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 bg-accent text-accent-foreground text-[10px] font-medium rounded">
                          {patient.hospital}
                        </span>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Patient info grid */}
                    <div className="grid grid-cols-5 gap-2 mb-3 text-center">
                      <div className="bg-secondary/50 rounded-md py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground uppercase">Age</p>
                        <p className="text-sm font-semibold">{patient.age ?? "—"}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-md py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground uppercase">Gender</p>
                        <p className="text-sm font-semibold">{patient.gender?.charAt(0) || "—"}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-md py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground uppercase">Ht</p>
                        <p className="text-sm font-semibold">{patient.height_cm ?? "—"}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-md py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground uppercase">Wt</p>
                        <p className="text-sm font-semibold">{patient.weight_kg ?? "—"}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-md py-1.5 px-1">
                        <p className="text-[10px] text-muted-foreground uppercase">BMI</p>
                        <p className="text-sm font-semibold">{patient.bmi ?? "—"}</p>
                      </div>
                    </div>

                    {/* Diagnosis and Doctor */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground text-xs w-16 shrink-0">Diagnosis</span>
                        <span className="font-medium truncate">{patient.diagnosis || "N/A"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground text-xs w-16 shrink-0">Doctor</span>
                        <span className="font-medium truncate">{patient.doctor_name || "N/A"}</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-3 pt-2 border-t border-border flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        ID: <span className="font-mono">{patient.patient_id || "N/A"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{patient.visit_date || "No date"}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-10 w-10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 py-2 bg-secondary text-sm font-medium rounded-md min-w-[100px] text-center">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-10 w-10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredPatients.length === 0 && (
            <Card className="border-2">
              <CardContent className="p-8 sm:p-12 text-center">
                <User className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">No patients found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filter.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Safe area spacer for mobile */}
      <div className="h-6 sm:h-4" />
    </div>
  );
};

export default Patients;
