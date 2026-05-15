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
      audit_logs: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          id: string
          ip: string | null
          target: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          target?: string | null
          tenant_id?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          target?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          created_at: string
          destination: string | null
          error: string | null
          id: string
          payload: Json
          size_bytes: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          error?: string | null
          id?: string
          payload?: Json
          size_bytes?: number | null
          status?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          error?: string | null
          id?: string
          payload?: Json
          size_bytes?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cost_tracking: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          metadata: Json
          model: string | null
          provider: string
          tenant_id: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          provider: string
          tenant_id?: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          provider?: string
          tenant_id?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: []
      }
      credential_history: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          key_name: string
          new_preview: string | null
          notes: string | null
          old_preview: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          id?: string
          key_name: string
          new_preview?: string | null
          notes?: string | null
          old_preview?: string | null
          tenant_id?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          key_name?: string
          new_preview?: string | null
          notes?: string | null
          old_preview?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      email_commands: {
        Row: {
          body: string | null
          created_at: string
          from_email: string
          id: string
          parsed_action: string | null
          processed_at: string | null
          response: string | null
          status: string
          subject: string | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          from_email: string
          id?: string
          parsed_action?: string | null
          processed_at?: string | null
          response?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          from_email?: string
          id?: string
          parsed_action?: string | null
          processed_at?: string | null
          response?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      kill_switch_state: {
        Row: {
          daily_budget_usd: number
          external_apis_enabled: boolean
          id: string
          monthly_budget_usd: number
          public_login_enabled: boolean
          reason: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_budget_usd?: number
          external_apis_enabled?: boolean
          id?: string
          monthly_budget_usd?: number
          public_login_enabled?: boolean
          reason?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_budget_usd?: number
          external_apis_enabled?: boolean
          id?: string
          monthly_budget_usd?: number
          public_login_enabled?: boolean
          reason?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      memory_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          read_at: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          read_at?: string | null
          tenant_id?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          read_at?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          payment_method: string
          reviewed_at: string | null
          status: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          payment_method?: string
          reviewed_at?: string | null
          status?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          payment_method?: string
          reviewed_at?: string | null
          status?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credits: number
          display_name: string | null
          id: string
          is_blocked: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          display_name?: string | null
          id?: string
          is_blocked?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          display_name?: string | null
          id?: string
          is_blocked?: boolean
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          build_metadata: Json | null
          build_status: string | null
          created_at: string
          description: string | null
          files: Json | null
          id: string
          installer_url: string | null
          last_build_log: string | null
          name: string
          public_url: string | null
          repo_url: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          version_history: Json | null
        }
        Insert: {
          build_metadata?: Json | null
          build_status?: string | null
          created_at?: string
          description?: string | null
          files?: Json | null
          id?: string
          installer_url?: string | null
          last_build_log?: string | null
          name: string
          public_url?: string | null
          repo_url?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
          version_history?: Json | null
        }
        Update: {
          build_metadata?: Json | null
          build_status?: string | null
          created_at?: string
          description?: string | null
          files?: Json | null
          id?: string
          installer_url?: string | null
          last_build_log?: string | null
          name?: string
          public_url?: string | null
          repo_url?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          version_history?: Json | null
        }
        Relationships: []
      }
      proposed_changes: {
        Row: {
          applied_at: string | null
          change_type: string
          created_at: string
          description: string
          id: string
          payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          rollback_data: Json | null
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          applied_at?: string | null
          change_type?: string
          created_at?: string
          description?: string
          id?: string
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          rollback_data?: Json | null
          status?: string
          tenant_id?: string
          title: string
        }
        Update: {
          applied_at?: string | null
          change_type?: string
          created_at?: string
          description?: string
          id?: string
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          rollback_data?: Json | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          blocked: boolean
          created_at: string
          id: string
          payload: Json
          severity: string
          source_ip: string | null
          tenant_id: string
          threat_type: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          id?: string
          payload?: Json
          severity?: string
          source_ip?: string | null
          tenant_id?: string
          threat_type: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          id?: string
          payload?: Json
          severity?: string
          source_ip?: string | null
          tenant_id?: string
          threat_type?: string
        }
        Relationships: []
      }
      system_credentials: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          key_name: string
          tenant_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          key_name: string
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          key_name?: string
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      system_map: {
        Row: {
          id: string
          kind: string
          metadata: Json
          name: string
          path: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          kind: string
          metadata?: Json
          name: string
          path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_memory: {
        Row: {
          content: string
          created_at: string
          embedding: Json | null
          id: string
          importance: number
          kind: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: Json | null
          id?: string
          importance?: number
          kind?: string
          metadata?: Json
          tenant_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: Json | null
          id?: string
          importance?: number
          kind?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      system_snapshots: {
        Row: {
          created_at: string
          data: Json
          id: string
          label: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          label: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          label?: string
          tenant_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
