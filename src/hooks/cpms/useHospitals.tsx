"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/cpms-client";
import { describeError } from "@/lib/cpms/errors";

interface Hospital {
  id: string;
  name: string;
  created_at: string;
}

interface UseHospitalsReturn {
  hospitals: Hospital[];
  hospitalOptions: { value: string; label: string }[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useHospitals = (includeAllOption: boolean = false): UseHospitalsReturn => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("hospitals")
        .select("id, name, created_at")
        .order("name");

      if (fetchError) throw fetchError;

      setHospitals(data || []);
    } catch (err: any) {
      setError(describeError(err, "Could not load the hospital list."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  const hospitalOptions = [
    ...(includeAllOption ? [{ value: "all", label: "All Hospitals" }] : []),
    ...hospitals.map(h => ({ value: h.name, label: h.name }))
  ];

  return {
    hospitals,
    hospitalOptions,
    loading,
    error,
    refetch: fetchHospitals,
  };
};

export default useHospitals;