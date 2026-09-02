"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/cpms/useAuth";
import { supabase } from "@/lib/supabase/cpms-client";
import { Button } from "@/components/cpms/ui/button";
import { Input } from "@/components/cpms/ui/input";
import { Label } from "@/components/cpms/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/cpms/ui/select";
import { toast } from "sonner";
import { describeError } from "@/lib/cpms/errors";
import { Building2, UserCheck } from "lucide-react";
import { asset } from "@/lib/cpms/base-path";

const staffRoles = [
  { value: "professor", label: "Professor" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "scholar", label: "Research Scholar" },
  { value: "admin", label: "Administrator" },
  { value: "technician", label: "Lab Technician" },
  { value: "collector", label: "Sample Collector" },
  { value: "other", label: "Other" },
];

const Onboarding = () => {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clinicName.trim() || !staffRole) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!user) {
      toast.error("User not found");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          clinic_name: clinicName.trim(),
          staff_role: staffRole,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Profile setup complete!");
      await refreshProfile();
      router.replace(asset("/dashboard"));
    } catch (error: any) {
      toast.error(describeError(error, "Could not save your profile. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome!</CardTitle>
          <CardDescription>Let's set up your profile to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="clinicName" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Laboratory / Hospital Name
              </Label>
              <Input
                id="clinicName"
                placeholder="Enter your clinic or hospital name"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staffRole" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Your Role
              </Label>
              <Select value={staffRole} onValueChange={setStaffRole} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {staffRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
