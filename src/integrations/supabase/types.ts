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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          buffer_days: number
          buffer_units: number
          category: string
          color: string
          created_at: string
          crews: number
          enabled: boolean
          id: string
          name: string
          predecessor_id: string | null
          project_id: string
          rate: number
          sort_order: number
          start_date: string
          unit_end: number
          unit_start: number
        }
        Insert: {
          buffer_days?: number
          buffer_units?: number
          category?: string
          color?: string
          created_at?: string
          crews?: number
          enabled?: boolean
          id?: string
          name: string
          predecessor_id?: string | null
          project_id: string
          rate?: number
          sort_order?: number
          start_date: string
          unit_end?: number
          unit_start?: number
        }
        Update: {
          buffer_days?: number
          buffer_units?: number
          category?: string
          color?: string
          created_at?: string
          crews?: number
          enabled?: boolean
          id?: string
          name?: string
          predecessor_id?: string | null
          project_id?: string
          rate?: number
          sort_order?: number
          start_date?: string
          unit_end?: number
          unit_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      lookahead_items: {
        Row: {
          activity_id: string
          activity_name: string
          commitment: string | null
          commitment_cause: string | null
          commitment_date: string | null
          commitment_met: boolean | null
          created_at: string
          id: string
          project_id: string
          responsible: string
          restrictions: Json
          week: number
        }
        Insert: {
          activity_id: string
          activity_name: string
          commitment?: string | null
          commitment_cause?: string | null
          commitment_date?: string | null
          commitment_met?: boolean | null
          created_at?: string
          id?: string
          project_id: string
          responsible?: string
          restrictions?: Json
          week?: number
        }
        Update: {
          activity_id?: string
          activity_name?: string
          commitment?: string | null
          commitment_cause?: string | null
          commitment_date?: string | null
          commitment_met?: boolean | null
          created_at?: string
          id?: string
          project_id?: string
          responsible?: string
          restrictions?: Json
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "lookahead_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pac_records: {
        Row: {
          activity_name: string
          completed: boolean
          created_at: string
          date: string
          failure_cause: string
          failure_description: string | null
          id: string
          planned: boolean
          project_id: string
          responsible: string
          week_number: number
        }
        Insert: {
          activity_name: string
          completed?: boolean
          created_at?: string
          date: string
          failure_cause?: string
          failure_description?: string | null
          id?: string
          planned?: boolean
          project_id: string
          responsible?: string
          week_number?: number
        }
        Update: {
          activity_name?: string
          completed?: boolean
          created_at?: string
          date?: string
          failure_cause?: string
          failure_description?: string | null
          id?: string
          planned?: boolean
          project_id?: string
          responsible?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pac_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          last_sign_in: string | null
          status: Database["public"]["Enums"]["user_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          last_sign_in?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          last_sign_in?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          building_config: Json
          contractors: string[]
          created_at: string
          custom_failure_causes: string[]
          default_units: number | null
          id: string
          name: string
          project_start_date: string | null
          project_type: string
          responsibles: string[]
          unit_labels: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          building_config?: Json
          contractors?: string[]
          created_at?: string
          custom_failure_causes?: string[]
          default_units?: number | null
          id?: string
          name?: string
          project_start_date?: string | null
          project_type?: string
          responsibles?: string[]
          unit_labels?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          building_config?: Json
          contractors?: string[]
          created_at?: string
          custom_failure_causes?: string[]
          default_units?: number | null
          id?: string
          name?: string
          project_start_date?: string | null
          project_type?: string
          responsibles?: string[]
          unit_labels?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      user_status: "active" | "suspended"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      user_status: ["active", "suspended"],
    },
  },
} as const
