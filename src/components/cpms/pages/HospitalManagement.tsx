"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/cpms/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/cpms/ui/dialog";
import {
  Activity,
  ArrowLeft,
  Building2,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError } from "@/lib/cpms/errors";
import { useRole } from "@/hooks/cpms/useRole";
import { asset } from "@/lib/cpms/base-path";

interface Hospital {
  id: string;
  name: string;
  patientCount: number;
  userCount: number;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[] | null;
}

const HospitalManagement = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { isMaster, loading: roleLoading } = useRole();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHospitalName, setNewHospitalName] = useState("");
  const [addingHospital, setAddingHospital] = useState(false);
  const [deletingHospital, setDeletingHospital] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [geoEditing, setGeoEditing] = useState<Hospital | null>(null);
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [geoRadius, setGeoRadius] = useState("200");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [geoSaving, setGeoSaving] = useState(false);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      // Get hospitals from hospitals table
      const { data: hospitalsData, error: hospitalsError } = await supabase
        .from("hospitals")
        .select("id, name, latitude, longitude, radius_meters, work_start_time, work_end_time, work_days")
        .order("name");

      if (hospitalsError) throw hospitalsError;

      // Get patient counts per hospital
      const { data: patientData, error: patientError } = await supabase
        .from("patient_records")
        .select("hospital");

      if (patientError) throw patientError;

      // Get user counts per hospital
      const { data: userAssignments, error: userError } = await supabase
        .from("hospital_assignments")
        .select("hospital, user_id");

      if (userError) throw userError;

      // Count patients and users per hospital
      const hospitalCounts: { [key: string]: { patients: number; users: Set<string> } } = {};

      patientData?.forEach((record) => {
        if (!hospitalCounts[record.hospital]) {
          hospitalCounts[record.hospital] = { patients: 0, users: new Set() };
        }
        hospitalCounts[record.hospital].patients++;
      });

      userAssignments?.forEach((assignment) => {
        if (!hospitalCounts[assignment.hospital]) {
          hospitalCounts[assignment.hospital] = { patients: 0, users: new Set() };
        }
        hospitalCounts[assignment.hospital].users.add(assignment.user_id);
      });

      // Merge with hospitals table data
      const hospitalList: Hospital[] = (hospitalsData || []).map((h) => ({
        id: h.id,
        name: h.name,
        patientCount: hospitalCounts[h.name]?.patients || 0,
        userCount: hospitalCounts[h.name]?.users.size || 0,
        latitude: (h as any).latitude ?? null,
        longitude: (h as any).longitude ?? null,
        radius_meters: (h as any).radius_meters ?? null,
        work_start_time: (h as any).work_start_time ?? null,
        work_end_time: (h as any).work_end_time ?? null,
        work_days: (h as any).work_days ?? null,
      }));

      setHospitals(hospitalList);
    } catch (error: any) {
      toast({
        title: "Error fetching hospitals",
        description: describeError(error, 'Could not load the hospital list.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openGeoEditor = (h: Hospital) => {
    setGeoEditing(h);
    setGeoLat(h.latitude != null ? String(h.latitude) : "");
    setGeoLng(h.longitude != null ? String(h.longitude) : "");
    setGeoRadius(String(h.radius_meters ?? 200));
    setWorkStart((h.work_start_time ?? "09:00:00").slice(0, 5));
    setWorkEnd((h.work_end_time ?? "18:00:00").slice(0, 5));
    setWorkDays(h.work_days && h.work_days.length ? h.work_days : [1, 2, 3, 4, 5]);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(String(pos.coords.latitude));
        setGeoLng(String(pos.coords.longitude));
      },
      // Left as-is deliberately: this is a GeolocationPositionError from the
      // browser, describing the user's own device ("User denied Geolocation"),
      // not a backend error. There is nothing internal in it to withhold.
      (err) => toast({ title: "Could not get location", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true }
    );
  };

  const saveGeo = async () => {
    if (!geoEditing) return;
    const lat = parseFloat(geoLat);
    const lng = parseFloat(geoLng);
    const radius = parseInt(geoRadius, 10);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({ title: "Invalid coordinates", variant: "destructive" });
      return;
    }
    if (isNaN(radius) || radius < 10 || radius > 10000) {
      toast({ title: "Radius must be 10–10000 meters", variant: "destructive" });
      return;
    }
    setGeoSaving(true);
    try {
      if (!/^\d{2}:\d{2}$/.test(workStart) || !/^\d{2}:\d{2}$/.test(workEnd) || workStart >= workEnd) {
        toast({ title: "Invalid working hours", description: "Start must be before end.", variant: "destructive" });
        setGeoSaving(false);
        return;
      }
      if (workDays.length === 0) {
        toast({ title: "Select at least one working day", variant: "destructive" });
        setGeoSaving(false);
        return;
      }
      const { error } = await supabase
        .from("hospitals")
        .update({
          latitude: lat,
          longitude: lng,
          radius_meters: radius,
          work_start_time: workStart,
          work_end_time: workEnd,
          work_days: [...workDays].sort(),
        })
        .eq("id", geoEditing.id);
      if (error) throw error;
      toast({ title: "Location saved", description: geoEditing.name });
      setGeoEditing(null);
      fetchHospitals();
    } catch (err: any) {
      toast({
        title: "Failed to save",
        description: describeError(err, 'Could not save the location. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setGeoSaving(false);
    }
  };

  useEffect(() => {
    if (!roleLoading && !isMaster) {
      toast({
        title: "Access Denied",
        description: "Only master users can manage hospitals.",
        variant: "destructive",
      });
      router.push(asset("/dashboard"));
      return;
    }
    
    if (!roleLoading) {
      fetchHospitals();
    }
  }, [roleLoading, isMaster]);

  const handleAddHospital = async () => {
    const trimmedName = newHospitalName.trim();
    if (!trimmedName) {
      toast({
        title: "Invalid name",
        description: "Please enter a hospital name.",
        variant: "destructive",
      });
      return;
    }

    if (hospitals.some((h) => h.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast({
        title: "Hospital exists",
        description: "A hospital with this name already exists.",
        variant: "destructive",
      });
      return;
    }

    setAddingHospital(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("Not authenticated");

      // Add hospital to the hospitals table
      const { error } = await supabase
        .from("hospitals")
        .insert({
          name: trimmedName,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Hospital added",
        description: `${trimmedName} has been added successfully.`,
      });

      setNewHospitalName("");
      setDialogOpen(false);
      fetchHospitals();
    } catch (error: any) {
      toast({
        title: "Failed to add hospital",
        description: describeError(error, 'Could not add the hospital. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setAddingHospital(false);
    }
  };

  const handleDeleteHospital = async (hospitalId: string, hospitalName: string) => {
    setDeletingHospital(hospitalName);
    try {
      // Check if there are patient records
      const hospital = hospitals.find((h) => h.id === hospitalId);
      if (hospital && hospital.patientCount > 0) {
        toast({
          title: "Cannot delete hospital",
          description: `${hospitalName} has ${hospital.patientCount} patient records. Delete or transfer them first.`,
          variant: "destructive",
        });
        return;
      }

      // Delete all hospital assignments for this hospital
      await supabase
        .from("hospital_assignments")
        .delete()
        .eq("hospital", hospitalName);

      // Delete the hospital
      const { error } = await supabase
        .from("hospitals")
        .delete()
        .eq("id", hospitalId);

      if (error) throw error;

      toast({
        title: "Hospital removed",
        description: `${hospitalName} has been removed.`,
      });

      fetchHospitals();
    } catch (error: any) {
      toast({
        title: "Failed to delete hospital",
        description: describeError(error, 'Could not delete the hospital. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setDeletingHospital(null);
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 bg-primary flex items-center justify-center">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight">Hospital Management</span>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary flex items-center justify-center shrink-0">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-base sm:text-xl tracking-tight truncate">Hospital Management</span>
          </div>

          {/* Add Hospital Button */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-9 sm:h-10 px-2 sm:px-4 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Hospital</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-1.5rem)] sm:w-full">
              <DialogHeader>
                <DialogTitle>Add New Hospital</DialogTitle>
                <DialogDescription>
                  Enter the name of the hospital to add to the system.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Hospital name"
                  value={newHospitalName}
                  onChange={(e) => setNewHospitalName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddHospital()}
                  className="h-11 sm:h-10"
                />
              </div>
              <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleAddHospital} disabled={addingHospital} className="w-full sm:w-auto">
                  {addingHospital ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Hospital"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="border-2">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{hospitals.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Hospitals</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">
                      {hospitals.reduce((sum, h) => sum + h.patientCount, 0)}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">Patient Records</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hospitals List */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Hospitals</CardTitle>
              <CardDescription>Manage hospitals in the system</CardDescription>
            </CardHeader>
            <CardContent>
              {hospitals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hospitals found</p>
                  <p className="text-sm">Add your first hospital to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hospitals.map((hospital) => (
                    <div
                      key={hospital.name}
                      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-secondary border border-border"
                    >
                      <div className="h-10 w-10 sm:h-12 sm:w-12 bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm sm:text-base truncate">{hospital.name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {hospital.patientCount} records • {hospital.userCount} users
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {hospital.latitude != null && hospital.longitude != null
                            ? `📍 ${hospital.latitude.toFixed(5)}, ${hospital.longitude.toFixed(5)} • ${hospital.radius_meters ?? 200}m`
                            : "📍 No location set"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                        onClick={() => openGeoEditor(hospital)}
                        title="Set location"
                      >
                        <MapPin className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                            disabled={deletingHospital === hospital.name}
                          >
                            {deletingHospital === hospital.name ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Hospital</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove <strong>{hospital.name}</strong>?
                              {hospital.patientCount > 0 && (
                                <span className="block mt-2 text-destructive">
                                  This hospital has {hospital.patientCount} patient records. 
                                  You must delete or transfer them first.
                                </span>
                              )}
                              {hospital.userCount > 0 && (
                                <span className="block mt-2">
                                  {hospital.userCount} user(s) will be unassigned from this hospital.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteHospital(hospital.id, hospital.name)}
                              disabled={hospital.patientCount > 0}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete Hospital
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <div className="h-4" />

      <Dialog open={!!geoEditing} onOpenChange={(o) => !o && setGeoEditing(null)}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Location & Hours · {geoEditing?.name}</DialogTitle>
            <DialogDescription>
              Define coordinates, allowed radius, and the working-hour window (IST) for attendance check-in/out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Latitude</label>
                <Input value={geoLat} onChange={(e) => setGeoLat(e.target.value)} placeholder="22.5726" />
              </div>
              <div>
                <label className="text-xs font-medium">Longitude</label>
                <Input value={geoLng} onChange={(e) => setGeoLng(e.target.value)} placeholder="88.3639" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Radius (meters)</label>
              <Input type="number" value={geoRadius} onChange={(e) => setGeoRadius(e.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={useMyLocation} className="w-full gap-2">
              <MapPin className="h-4 w-4" /> Use my current location
            </Button>
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold mb-2">Working hours (IST)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Start</label>
                  <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium">End</label>
                  <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2">Working days</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { d: 1, l: "Mon" }, { d: 2, l: "Tue" }, { d: 3, l: "Wed" },
                  { d: 4, l: "Thu" }, { d: 5, l: "Fri" }, { d: 6, l: "Sat" }, { d: 7, l: "Sun" },
                ].map(({ d, l }) => {
                  const active = workDays.includes(d);
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-8 px-3"
                      onClick={() =>
                        setWorkDays((prev) => active ? prev.filter((x) => x !== d) : [...prev, d])
                      }
                    >
                      {l}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setGeoEditing(null)}>Cancel</Button>
            <Button onClick={saveGeo} disabled={geoSaving}>
              {geoSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HospitalManagement;