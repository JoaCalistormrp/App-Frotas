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
      checklist_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_categories_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          required: boolean
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          required?: boolean
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "checklist_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_responses: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          item_id: string
          observation: string | null
          photo_url: string | null
          resolution_status:
            | Database["public"]["Enums"]["maintenance_status"]
            | null
          status: Database["public"]["Enums"]["response_status"]
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          item_id: string
          observation?: string | null
          photo_url?: string | null
          resolution_status?:
            | Database["public"]["Enums"]["maintenance_status"]
            | null
          status: Database["public"]["Enums"]["response_status"]
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          item_id?: string
          observation?: string | null
          photo_url?: string | null
          resolution_status?:
            | Database["public"]["Enums"]["maintenance_status"]
            | null
          status?: Database["public"]["Enums"]["response_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checklist_responses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: []
      }
      checklists: {
        Row: {
          completed_at: string | null
          created_at: string
          damage_description: string | null
          driver_id: string
          exit_time: string | null
          has_issues: boolean
          id: string
          itinerary: string | null
          observations: string | null
          odometer_end: number | null
          odometer_start: number | null
          signature_url: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          template_id: string
          vehicle_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          damage_description?: string | null
          driver_id: string
          exit_time?: string | null
          has_issues?: boolean
          id?: string
          itinerary?: string | null
          observations?: string | null
          odometer_end?: number | null
          odometer_start?: number | null
          signature_url?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          template_id: string
          vehicle_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          damage_description?: string | null
          driver_id?: string
          exit_time?: string | null
          has_issues?: boolean
          id?: string
          itinerary?: string | null
          observations?: string | null
          odometer_end?: number | null
          odometer_start?: number | null
          signature_url?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          template_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_evolutions: {
        Row: {
          created_at: string
          id: string
          observation: string
          order_id: string
          status: Database["public"]["Enums"]["maintenance_status"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          observation: string
          order_id: string
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          observation?: string
          order_id?: string
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_evolutions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_evolutions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "drivers_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_evolutions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_order_counters: {
        Row: {
          base_code: string
          last_number: number
        }
        Insert: {
          base_code: string
          last_number?: number
        }
        Update: {
          base_code?: string
          last_number?: number
        }
        Relationships: []
      }
      maintenance_orders: {
        Row: {
          base_code: string
          checklist_id: string | null
          combustivel_chegada: string | null
          created_at: string
          created_by: string | null
          data_entrada: string | null
          data_saida: string | null
          driver_id: string | null
          failure_description: string | null
          final_observation: string | null
          hora_entrada: string | null
          hora_saida: string | null
          id: string
          items_replaced: string | null
          km_atual: number | null
          labor_cost: number | null
          labor_description: string | null
          labor_hours: number | null
          maintenance_category: string | null
          mechanic_signature_url: string | null
          mod_carro: string | null
          observations: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["maintenance_type"]
          parts_cost: number | null
          parts_needed: string | null
          parts_supplier: string | null
          response_id: string | null
          responsible_signature_url: string | null
          service_type: string | null
          signed_at: string | null
          solution_description: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          updated_at: string
          validade_oleo: string | null
          vehicle_id: string | null
          workshop: string | null
        }
        Insert: {
          base_code: string
          checklist_id?: string | null
          combustivel_chegada?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          driver_id?: string | null
          failure_description?: string | null
          final_observation?: string | null
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          items_replaced?: string | null
          km_atual?: number | null
          labor_cost?: number | null
          labor_description?: string | null
          labor_hours?: number | null
          maintenance_category?: string | null
          mechanic_signature_url?: string | null
          mod_carro?: string | null
          observations?: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["maintenance_type"]
          parts_cost?: number | null
          parts_needed?: string | null
          parts_supplier?: string | null
          response_id?: string | null
          responsible_signature_url?: string | null
          service_type?: string | null
          signed_at?: string | null
          solution_description?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          updated_at?: string
          validade_oleo?: string | null
          vehicle_id?: string | null
          workshop?: string | null
        }
        Update: {
          base_code?: string
          checklist_id?: string | null
          combustivel_chegada?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          driver_id?: string | null
          failure_description?: string | null
          final_observation?: string | null
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          items_replaced?: string | null
          km_atual?: number | null
          labor_cost?: number | null
          labor_description?: string | null
          labor_hours?: number | null
          maintenance_category?: string | null
          mechanic_signature_url?: string | null
          mod_carro?: string | null
          observations?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["maintenance_type"]
          parts_cost?: number | null
          parts_needed?: string | null
          parts_supplier?: string | null
          response_id?: string | null
          responsible_signature_url?: string | null
          service_type?: string | null
          signed_at?: string | null
          solution_description?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          updated_at?: string
          validade_oleo?: string | null
          vehicle_id?: string | null
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "drivers_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "checklist_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          base: string | null
          cnh: string | null
          cnh_category: string | null
          cnh_expires_at: string | null
          cnh_file_url: string | null
          cnh_photo_url: string | null
          cnh_renewal_history: Json | null
          company: string | null
          cpf: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role_function: Database["public"]["Enums"]["driver_function"] | null
          unlock_card: string | null
          updated_at: string
        }
        Insert: {
          base?: string | null
          cnh?: string | null
          cnh_category?: string | null
          cnh_expires_at?: string | null
          cnh_file_url?: string | null
          cnh_photo_url?: string | null
          cnh_renewal_history?: Json | null
          company?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role_function?: Database["public"]["Enums"]["driver_function"] | null
          unlock_card?: string | null
          updated_at?: string
        }
        Update: {
          base?: string | null
          cnh?: string | null
          cnh_category?: string | null
          cnh_expires_at?: string | null
          cnh_file_url?: string | null
          cnh_photo_url?: string | null
          cnh_renewal_history?: Json | null
          company?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role_function?: Database["public"]["Enums"]["driver_function"] | null
          unlock_card?: string | null
          updated_at?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      vehicles: {
        Row: {
          active: boolean
          base: string | null
          brand: string | null
          category: Database["public"]["Enums"]["vehicle_category"] | null
          created_at: string
          document_url: string | null
          fuel_type: string | null
          id: string
          mileage: number | null
          model: string | null
          plate: string
          renavam: string | null
          sector: string | null
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year: number | null
        }
        Insert: {
          active?: boolean
          base?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["vehicle_category"] | null
          created_at?: string
          document_url?: string | null
          fuel_type?: string | null
          id?: string
          mileage?: number | null
          model?: string | null
          plate: string
          renavam?: string | null
          sector?: string | null
          updated_at?: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year?: number | null
        }
        Update: {
          active?: boolean
          base?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["vehicle_category"] | null
          created_at?: string
          document_url?: string | null
          fuel_type?: string | null
          id?: string
          mileage?: number | null
          model?: string | null
          plate?: string
          renavam?: string | null
          sector?: string | null
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      drivers_directory: {
        Row: {
          full_name: string | null
          id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_order_number: { Args: { _base: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "driver" | "viewer" | "mechanic"
      checklist_status: "in_progress" | "completed"
      driver_function:
        | "diretor"
        | "administrativo"
        | "encarregado"
        | "motorista"
      maintenance_status:
        | "pendente"
        | "em_manutencao"
        | "solucionado"
        | "aberta"
        | "em_analise"
        | "orcando_mao_obra"
        | "orcando_pecas"
        | "aguardando_aprovacao"
        | "aguardando_pecas"
        | "em_execucao"
        | "teste_final"
        | "finalizada"
        | "cancelada"
      maintenance_type: "SMI" | "SMV"
      response_status: "OK" | "NAO_OK" | "NA"
      vehicle_category: "pesado" | "operacional" | "administrativo"
      vehicle_type:
        | "PESADOS"
        | "OPERACIONAIS"
        | "CESTO_AEREO"
        | "ADMINISTRATIVO"
        | "MUNCK"
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
      app_role: ["admin", "driver", "viewer", "mechanic"],
      checklist_status: ["in_progress", "completed"],
      driver_function: [
        "diretor",
        "administrativo",
        "encarregado",
        "motorista",
      ],
      maintenance_status: [
        "pendente",
        "em_manutencao",
        "solucionado",
        "aberta",
        "em_analise",
        "orcando_mao_obra",
        "orcando_pecas",
        "aguardando_aprovacao",
        "aguardando_pecas",
        "em_execucao",
        "teste_final",
        "finalizada",
        "cancelada",
      ],
      maintenance_type: ["SMI", "SMV"],
      response_status: ["OK", "NAO_OK", "NA"],
      vehicle_category: ["pesado", "operacional", "administrativo"],
      vehicle_type: [
        "PESADOS",
        "OPERACIONAIS",
        "CESTO_AEREO",
        "ADMINISTRATIVO",
        "MUNCK",
      ],
    },
  },
} as const
