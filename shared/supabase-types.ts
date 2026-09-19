/**
 * Generated types for the Supabase project shared by both apps in this
 * repository — the public site's content dashboard and CPMS under /cpms.
 *
 * DO NOT EDIT BY HAND. Regenerate after any schema change:
 *
 *   npx supabase gen types typescript --project-id rcqluqbrqiyyfrpfryvl > shared/supabase-types.ts
 *
 * (and restore this header, which the generator does not emit).
 *
 * Both apps consume this one file so a column rename shows up as a type error
 * in whichever app still refers to the old name, rather than as a runtime
 * failure in production. Before this existed the website's site_content queries
 * were untyped entirely, and CPMS had its own copy that predated the
 * site_content / site_editors tables.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          check_in_at: string
          check_in_distance_meters: number | null
          check_in_latitude: number
          check_in_longitude: number
          check_out_at: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          created_at: string
          hospital: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_at?: string
          check_in_distance_meters?: number | null
          check_in_latitude: number
          check_in_longitude: number
          check_out_at?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          created_at?: string
          hospital: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_at?: string
          check_in_distance_meters?: number | null
          check_in_latitude?: number
          check_in_longitude?: number
          check_out_at?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          created_at?: string
          hospital?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hospital_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          hospital: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          hospital: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          hospital?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          radius_meters: number
          work_days: number[]
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          radius_meters?: number
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          radius_meters?: number
          work_days?: number[]
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          event_date: string
          id: string
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_status: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_date: string
          id?: string
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_status?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          message?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_status?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_record_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          patient_record_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          patient_record_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          patient_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_record_audit_patient_record_id_fkey"
            columns: ["patient_record_id"]
            isOneToOne: false
            referencedRelation: "patient_records"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_records: {
        Row: {
          additional_documents: Json | null
          age: number | null
          bmi: number | null
          confidence_score: number | null
          created_at: string | null
          diagnosis: string | null
          doctor_name: string | null
          draft_id: string | null
          extraction_raw: Json | null
          gender: string | null
          height_cm: number | null
          hospital: string
          id: string
          medicines: Json | null
          patient_id: string
          patient_name: string
          prescription_image_url: string | null
          reference_number: string | null
          uhid: string | null
          updated_at: string | null
          uploaded_by: string | null
          visit_date: string | null
          weight_kg: number | null
        }
        Insert: {
          additional_documents?: Json | null
          age?: number | null
          bmi?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_name?: string | null
          draft_id?: string | null
          extraction_raw?: Json | null
          gender?: string | null
          height_cm?: number | null
          hospital: string
          id?: string
          medicines?: Json | null
          patient_id?: string
          patient_name: string
          prescription_image_url?: string | null
          reference_number?: string | null
          uhid?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          visit_date?: string | null
          weight_kg?: number | null
        }
        Update: {
          additional_documents?: Json | null
          age?: number | null
          bmi?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_name?: string | null
          draft_id?: string | null
          extraction_raw?: Json | null
          gender?: string | null
          height_cm?: number | null
          hospital?: string
          id?: string
          medicines?: Json | null
          patient_id?: string
          patient_name?: string
          prescription_image_url?: string | null
          reference_number?: string | null
          uhid?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          visit_date?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          clinic_name: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          staff_role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          clinic_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean | null
          staff_role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          clinic_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          staff_role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          collection: string
          data: Json | null
          raw: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collection: string
          data?: Json | null
          raw?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collection?: string
          data?: Json | null
          raw?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_content_versions: {
        Row: {
          collection: string
          data: Json | null
          id: number
          raw: string | null
          saved_at: string
          saved_by: string | null
        }
        Insert: {
          collection: string
          data?: Json | null
          id?: never
          raw?: string | null
          saved_at?: string
          saved_by?: string | null
        }
        Update: {
          collection?: string
          data?: Json | null
          id?: never
          raw?: string | null
          saved_at?: string
          saved_by?: string | null
        }
        Relationships: []
      }
      site_editors: {
        Row: {
          granted_at: string
          granted_by: string | null
          is_enabled: boolean
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          is_enabled?: boolean
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          is_enabled?: boolean
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          hospitals: string[]
          id: string
          invited_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          hospitals: string[]
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          hospitals?: string[]
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_scan: boolean | null
          can_upload: boolean | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_scan?: boolean | null
          can_upload?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_scan?: boolean | null
          can_upload?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_has_hospital: {
        Args: { _admin_id: string; _hospital: string }
        Returns: boolean
      }
      admin_shares_hospital_with_user: {
        Args: { _admin_id: string; _target_user_id: string }
        Returns: boolean
      }
      can_manage_user: {
        Args: { _actor_id: string; _target_user_id: string }
        Returns: boolean
      }
      create_patient_record: {
        Args: {
          _additional_documents?: Json
          _age?: number
          _bmi?: number
          _confidence_score?: number
          _diagnosis?: string
          _doctor_name?: string
          _draft_id: string
          _extraction_raw?: Json
          _gender?: string
          _height_cm?: number
          _hospital: string
          _medicines?: Json
          _patient_id: string
          _patient_name: string
          _prescription_image_url?: string
          _uhid?: string
          _visit_date?: string
          _weight_kg?: number
        }
        Returns: {
          created_id: string
          created_reference_number: string
        }[]
      }
      generate_reference_number: {
        Args: { _hospital: string }
        Returns: string
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      is_site_editor: { Args: { _user_id: string }; Returns: boolean }
      norm_audit_value: { Args: { _value: string }; Returns: string }
      prescription_object_is_referenced: {
        Args: { _path: string }
        Returns: boolean
      }
      role_rank: { Args: { _role: string }; Returns: number }
      user_can_scan: { Args: { _user_id: string }; Returns: boolean }
      user_has_hospital_access: {
        Args: { _hospital: string; _user_id: string }
        Returns: boolean
      }
      user_is_enabled: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "master" | "user"
      notification_type:
        | "shift_start"
        | "checkin_reminder"
        | "checkin_final_reminder"
        | "shift_end"
        | "checkout_reminder"
        | "checkout_final_reminder"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "master", "user"],
      notification_type: [
        "shift_start",
        "checkin_reminder",
        "checkin_final_reminder",
        "shift_end",
        "checkout_reminder",
        "checkout_final_reminder",
      ],
    },
  },
} as const
