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
      areas: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      daily_counters: {
        Row: {
          area_id: string
          day: string
          last_number: number
        }
        Insert: {
          area_id: string
          day: string
          last_number?: number
        }
        Update: {
          area_id?: string
          day?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_counters_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          active: boolean
          area_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          area_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          area_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedures_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_point_procedures: {
        Row: {
          procedure_id: string
          service_point_id: string
        }
        Insert: {
          procedure_id: string
          service_point_id: string
        }
        Update: {
          procedure_id?: string
          service_point_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_point_procedures_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_point_procedures_service_point_id_fkey"
            columns: ["service_point_id"]
            isOneToOne: false
            referencedRelation: "service_points"
            referencedColumns: ["id"]
          },
        ]
      }
      service_points: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          operator_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          operator_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          operator_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ticket_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          score: number
          ticket_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          score: number
          ticket_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          score?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          area_id: string
          called_at: string | null
          ci: string
          code: string
          created_at: string
          created_by: string | null
          day: string
          device_id: string | null
          finished_at: string | null
          id: string
          number: number
          operator_id: string | null
          origin_operator_id: string | null
          origin_service_point_id: string | null
          procedure_id: string
          service_point_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          transfer_to: string | null
        }
        Insert: {
          area_id: string
          called_at?: string | null
          ci: string
          code: string
          created_at?: string
          created_by?: string | null
          day?: string
          device_id?: string | null
          finished_at?: string | null
          id?: string
          number: number
          operator_id?: string | null
          origin_operator_id?: string | null
          origin_service_point_id?: string | null
          procedure_id: string
          service_point_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          transfer_to?: string | null
        }
        Update: {
          area_id?: string
          called_at?: string | null
          ci?: string
          code?: string
          created_at?: string
          created_by?: string | null
          day?: string
          device_id?: string | null
          finished_at?: string | null
          id?: string
          number?: number
          operator_id?: string | null
          origin_operator_id?: string | null
          origin_service_point_id?: string | null
          procedure_id?: string
          service_point_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          transfer_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_service_point_id_fkey"
            columns: ["service_point_id"]
            isOneToOne: false
            referencedRelation: "service_points"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
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
      cancel_ticket: {
        Args: { _ticket_id: string; _device_id?: string | null }
        Returns: {
          area_id: string
          called_at: string | null
          ci: string
          code: string
          created_at: string
          day: string
          device_id: string | null
          finished_at: string | null
          id: string
          number: number
          operator_id: string | null
          procedure_id: string
          service_point_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_stale_tickets: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      generate_ticket: {
        Args: {
          _area_id: string
          _ci?: string | null
          _created_by?: string | null
          _device_id?: string | null
          _procedure_id: string
        }
        Returns: {
          area_id: string
          called_at: string | null
          ci: string
          code: string
          created_at: string
          day: string
          device_id: string | null
          finished_at: string | null
          id: string
          number: number
          operator_id: string | null
          procedure_id: string
          service_point_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      submit_ticket_rating: {
        Args: {
          _comment?: string | null
          _device_id?: string | null
          _score: number
          _ticket_id: string
        }
        Returns: {
          comment: string | null
          created_at: string
          id: string
          score: number
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "host"
      ticket_status:
        | "waiting"
        | "calling"
        | "in_service"
        | "finished"
        | "absent"
        | "cancelled"
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
      app_role: ["admin", "operator"],
      ticket_status: [
        "waiting",
        "calling",
        "in_service",
        "finished",
        "absent",
        "cancelled",
      ],
    },
  },
} as const
