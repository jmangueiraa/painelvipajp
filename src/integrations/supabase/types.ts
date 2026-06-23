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
      app_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_days: number
          featured: boolean
          id: string
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_days?: number
          featured?: boolean
          id?: string
          name: string
          price_cents?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_days?: number
          featured?: boolean
          id?: string
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_subscription_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          notes: string | null
          paid_at: string
          reference: string | null
          subscription_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method?:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          notes?: string | null
          paid_at?: string
          reference?: string | null
          subscription_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          notes?: string | null
          paid_at?: string
          reference?: string | null
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "app_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          notes: string | null
          payment_method:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          plan_id: string | null
          price_cents: number
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          notes?: string | null
          payment_method?:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          plan_id?: string | null
          price_cents?: number
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          notes?: string | null
          payment_method?:
            | Database["public"]["Enums"]["subscription_payment_method"]
            | null
          plan_id?: string | null
          price_cents?: number
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          due_date: string
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["charge_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          due_date: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          auto_charge: boolean
          bonus_days: number
          created_at: string
          doc: string | null
          due_date: string
          email: string | null
          id: string
          internal_notes: string | null
          iptv_login: string | null
          iptv_password: string | null
          name: string
          notes: string | null
          phone: string
          plan_id: string | null
          portal_password_hash: string | null
          portal_username: string | null
          price_cents: number
          referral_code: string | null
          referred_by: string | null
          server_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          auto_charge?: boolean
          bonus_days?: number
          created_at?: string
          doc?: string | null
          due_date: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          iptv_login?: string | null
          iptv_password?: string | null
          name: string
          notes?: string | null
          phone: string
          plan_id?: string | null
          portal_password_hash?: string | null
          portal_username?: string | null
          price_cents?: number
          referral_code?: string | null
          referred_by?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          auto_charge?: boolean
          bonus_days?: number
          created_at?: string
          doc?: string | null
          due_date?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          iptv_login?: string | null
          iptv_password?: string | null
          name?: string
          notes?: string | null
          phone?: string
          plan_id?: string | null
          portal_password_hash?: string | null
          portal_username?: string | null
          price_cents?: number
          referral_code?: string | null
          referred_by?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          charge_id: string | null
          client_id: string
          created_at: string
          id: string
          method: string | null
          notes: string | null
          paid_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          charge_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_days: number
          id: string
          name: string
          price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name: string
          price_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name?: string
          price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portal_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          whatsapp_digits: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
          whatsapp_digits: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          whatsapp_digits?: string
        }
        Relationships: []
      }
      portal_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          token_hash: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          token_hash: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      renewal_requests: {
        Row: {
          client_id: string
          created_at: string
          days: number
          id: string
          status: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          days: number
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          days?: number
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string
          credit_cost_cents: number
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_cost_cents?: number
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credit_cost_cents?: number
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          app_android_url: string | null
          app_ios_url: string | null
          company_name: string | null
          created_at: string
          default_message: string | null
          default_renewal_days: number
          pix_bank: string | null
          pix_city: string | null
          pix_key: string | null
          pix_key_type: Database["public"]["Enums"]["pix_key_type"] | null
          pix_message: string | null
          pix_name: string | null
          pix_receiver: string | null
          referral_enabled: boolean
          referral_reward_days: number
          subscription_expires_at: string | null
          subscription_monthly_cents: number
          support_message: string | null
          updated_at: string
          user_id: string
          whatsapp_instance: string | null
        }
        Insert: {
          app_android_url?: string | null
          app_ios_url?: string | null
          company_name?: string | null
          created_at?: string
          default_message?: string | null
          default_renewal_days?: number
          pix_bank?: string | null
          pix_city?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          pix_message?: string | null
          pix_name?: string | null
          pix_receiver?: string | null
          referral_enabled?: boolean
          referral_reward_days?: number
          subscription_expires_at?: string | null
          subscription_monthly_cents?: number
          support_message?: string | null
          updated_at?: string
          user_id: string
          whatsapp_instance?: string | null
        }
        Update: {
          app_android_url?: string | null
          app_ios_url?: string | null
          company_name?: string | null
          created_at?: string
          default_message?: string | null
          default_renewal_days?: number
          pix_bank?: string | null
          pix_city?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          pix_message?: string | null
          pix_name?: string | null
          pix_receiver?: string | null
          referral_enabled?: boolean
          referral_reward_days?: number
          subscription_expires_at?: string | null
          subscription_monthly_cents?: number
          support_message?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_instance?: string | null
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
      find_client_by_phone_digits: {
        Args: { _digits: string }
        Returns: {
          address: string | null
          auto_charge: boolean
          bonus_days: number
          created_at: string
          doc: string | null
          due_date: string
          email: string | null
          id: string
          internal_notes: string | null
          iptv_login: string | null
          iptv_password: string | null
          name: string
          notes: string | null
          phone: string
          plan_id: string | null
          portal_password_hash: string | null
          portal_username: string | null
          price_cents: number
          referral_code: string | null
          referred_by: string | null
          server_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      find_client_by_portal_username: {
        Args: { _username: string }
        Returns: {
          address: string | null
          auto_charge: boolean
          bonus_days: number
          created_at: string
          doc: string | null
          due_date: string
          email: string | null
          id: string
          internal_notes: string | null
          iptv_login: string | null
          iptv_password: string | null
          name: string
          notes: string | null
          phone: string
          plan_id: string | null
          portal_password_hash: string | null
          portal_username: string | null
          price_cents: number
          referral_code: string | null
          referred_by: string | null
          server_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      gen_referral_code: { Args: { _name: string }; Returns: string }
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
      charge_status: "pendente" | "paga" | "vencida" | "cancelada"
      client_status: "ativo" | "vencido" | "suspenso" | "cancelado"
      pix_key_type: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria"
      subscription_payment_method:
        | "pix"
        | "cartao"
        | "boleto"
        | "dinheiro"
        | "manual"
        | "outro"
      subscription_status:
        | "ativa"
        | "pendente"
        | "cancelada"
        | "vencida"
        | "teste_gratis"
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
      charge_status: ["pendente", "paga", "vencida", "cancelada"],
      client_status: ["ativo", "vencido", "suspenso", "cancelado"],
      pix_key_type: ["cpf", "cnpj", "email", "telefone", "aleatoria"],
      subscription_payment_method: [
        "pix",
        "cartao",
        "boleto",
        "dinheiro",
        "manual",
        "outro",
      ],
      subscription_status: [
        "ativa",
        "pendente",
        "cancelada",
        "vencida",
        "teste_gratis",
      ],
    },
  },
} as const
