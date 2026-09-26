"use client";

import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Activity, BarChart3, Building2, ClipboardList, LogOut, ScanLine, User, Users, Shield, Crown, MapPin, CalendarCheck, HelpCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useRole } from "@/hooks/cpms/useRole";
import { useHospitals } from "@/hooks/cpms/useHospitals";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/cpms-client";
import { Badge } from "@/components/cpms/ui/badge";
import { asset } from "@/lib/cpms/base-path";
const Dashboard = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { role, isAdmin, isMaster, assignedHospitals, canScan } = useRole();
  const { hospitals } = useHospitals();

  // Fetch patient count
  const { data: patientCount = 0 } = useQuery({
    queryKey: ['patient-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('patient_records')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  // Fetch today's scans count
  const { data: todayScans = 0 } = useQuery({
    queryKey: ['today-scans'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('patient_records')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${today}T23:59:59`);
      return count || 0;
    },
  });

  // Fetch recent activity with uploader info
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const { data: records } = await supabase
        .from('patient_records')
        .select('patient_name, hospital, created_at, uploaded_by')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (!records || records.length === 0) return [];
      
      // Get unique uploader IDs
      // The predicate rather than a bare filter(Boolean): the runtime result is
      // the same, but only this form narrows (string | null)[] to string[] for
      // the .in() call below.
      const uploaderIds = [...new Set(records.map(r => r.uploaded_by).filter((id): id is string => Boolean(id)))];
      
      // Fetch profiles for uploaders
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', uploaderIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return records.map(record => ({
        ...record,
        uploader: record.uploaded_by ? profileMap.get(record.uploaded_by) : null
      }));
    },
  });

  const handleLogout = async () => {
    await signOut();
    router.push(asset("/"));
  };

  // created_at is nullable in the schema. Without the guard a null fell through
  // to new Date(null), which is the epoch, and the row rendered as "20000 days
  // ago" rather than anything a reader could act on.
  const getTimeAgo = (date: string | null) => {
    if (!date) return "Unknown";

    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src={asset("/cbrl-logo.png")} alt="CBRL Logo" className="h-9 w-9 sm:h-10 sm:w-10 object-contain shrink-0" />
            <span className="font-bold text-xl tracking-tight hidden lg:block truncate">
              CBRL Patient Management System
            </span>
            <span className="font-bold text-lg sm:text-xl tracking-tight lg:hidden truncate">CPMS</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Badge
              variant={isMaster ? "default" : isAdmin ? "secondary" : "outline"}
              className="gap-1 px-2"
            >
              {isMaster ? <Crown className="h-3 w-3" /> : isAdmin ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
              <span className="hidden sm:inline">{role.toUpperCase()}</span>
            </Badge>
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-secondary">
              <User className="h-4 w-4" />
              <span className="text-sm font-medium">{displayName}</span>
            </div>
            <Button variant="outline" size="icon" onClick={handleLogout} className="h-9 w-9 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
          {/* Welcome Section */}
          <div className="space-y-1.5 sm:space-y-2">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Welcome back, {displayName}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage patient records and scan prescriptions with AI assistance.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-accent flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{patientCount}</p>
                    <p className="text-xs text-muted-foreground">Total Patients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-accent flex items-center justify-center shrink-0">
                    <ScanLine className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{todayScans}</p>
                    <p className="text-xs text-muted-foreground">Scans Today</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-accent flex items-center justify-center shrink-0">
                    <ClipboardList className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{hospitals.length}</p>
                    <p className="text-xs text-muted-foreground">Hospitals</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-accent flex items-center justify-center shrink-0">
                    <Activity className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">AI</p>
                    <p className="text-xs text-muted-foreground">Powered</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* View Patient Details Card */}
            <Card
              className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
              onClick={() => router.push(asset("/patients"))}
            >
              <CardHeader className="pb-4">
                <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <ClipboardList className="h-8 w-8 text-primary-foreground" />
                </div>
                <CardTitle className="text-xl">View Patient Details</CardTitle>
                <CardDescription>
                  Browse and search patient records organized by hospital. View diagnosis,
                  medications, and visit history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {hospitals.slice(0, 3).map((h) => (
                    <span key={h.id} className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium">
                      {h.name}
                    </span>
                  ))}
                  {hospitals.length > 3 && (
                    <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium">
                      +{hospitals.length - 3} more
                    </span>
                  )}
                  {hospitals.length === 0 && (
                    <span className="text-muted-foreground text-xs">No hospitals configured</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Scan Prescription Card */}
            <Card
              className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
              onClick={() => router.push(asset("/scan"))}
            >
              <CardHeader className="pb-4">
                <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <ScanLine className="h-8 w-8 text-primary-foreground" />
                </div>
                <CardTitle className="text-xl">Scan Prescription</CardTitle>
                <CardDescription>
                  Upload or capture prescription images. AI automatically extracts patient
                  information and saves to records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                    OCR Powered
                  </span>
                  <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                    AI Extraction
                  </span>
                  <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                    Auto-Save
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Attendance */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card
              className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
              onClick={() => router.push(asset("/attendance"))}
            >
              <CardHeader className="pb-4">
                <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <MapPin className="h-8 w-8 text-primary-foreground" />
                </div>
                <CardTitle className="text-xl">Attendance Check-in</CardTitle>
                <CardDescription>
                  Check in and out at your assigned hospital. Location is verified against the hospital&apos;s geofence.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">GPS Verified</span>
                  <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">Geofenced</span>
                </div>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card
                className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
                onClick={() => router.push(asset("/admin/attendance"))}
              >
                <CardHeader className="pb-4">
                  <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <CalendarCheck className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl">Attendance Reports</CardTitle>
                  <CardDescription>
                    View staff attendance, filter by hospital and date, and export CSV.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">Reports</span>
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">CSV Export</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Admin Cards - Only for Admins/Masters */}
          {isAdmin && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* User Management */}
              <Card
                className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
                onClick={() => router.push(asset("/admin/users"))}
              >
                <CardHeader className="pb-4">
                  <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <Shield className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl">User Management</CardTitle>
                  <CardDescription>
                    Manage users, assign hospitals, and configure permissions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                      Roles
                    </span>
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                      Hospitals
                    </span>
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                      Permissions
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* How often staff correct the AI's reading */}
              <Card
                className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
                onClick={() => router.push(asset("/admin/scan-quality"))}
              >
                <CardHeader className="pb-4">
                  <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <BarChart3 className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl">Scan Accuracy</CardTitle>
                  <CardDescription>
                    See which fields staff correct most often after AI extraction.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                      Corrections
                    </span>
                    <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                      Unclear flags
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Hospital Management - Only for Masters */}
              {isMaster && (
                <Card
                  className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
                  onClick={() => router.push(asset("/admin/hospitals"))}
                >
                  <CardHeader className="pb-4">
                    <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                      <Building2 className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-xl">Hospital Management</CardTitle>
                    <CardDescription>
                      Add or remove hospitals from the system.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                        Add Hospitals
                      </span>
                      <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                        Remove Hospitals
                      </span>
                      <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">
                        Master Only
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Help / User Guide - available to every signed-in user */}
          <Card
            className="border-2 border-border hover:border-primary transition-colors cursor-pointer group shadow-sm hover:shadow-md"
            onClick={() => router.push(asset("/help"))}
          >
            <CardHeader className="pb-4">
              <div className="h-16 w-16 bg-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <HelpCircle className="h-8 w-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">Help &amp; User Guide</CardTitle>
              <CardDescription>
                How to scan prescriptions, browse records, mark attendance, and fix common problems.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">Getting Started</span>
                <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">Roles</span>
                <span className="px-3 py-1 bg-accent text-accent-foreground text-xs font-medium">Troubleshooting</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-3 p-3 bg-secondary hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-card border-2 border-border flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{activity.patient_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Scanned by {activity.uploader?.full_name || activity.uploader?.email?.split('@')[0] || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium truncate max-w-[110px] sm:max-w-none">{activity.hospital}</p>
                        <p className="text-xs text-muted-foreground">{getTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No recent activity</p>
                    <p className="text-sm">Start by scanning a prescription</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border p-2 safe-area-pb">
        <div className="flex justify-around">
          <Button
            variant="ghost"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={() => router.push(asset("/dashboard"))}
          >
            <Activity className="h-5 w-5" />
            <span className="text-xs">Home</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={() => router.push(asset("/patients"))}
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs">Patients</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={() => router.push(asset("/scan"))}
          >
            <ScanLine className="h-5 w-5" />
            <span className="text-xs">Scan</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 flex-col h-auto py-2 gap-1"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            <span className="text-xs">Logout</span>
          </Button>
        </div>
      </nav>

      {/* Spacer for mobile nav */}
      <div className="lg:hidden h-20" />
    </div>
  );
};

export default Dashboard;
