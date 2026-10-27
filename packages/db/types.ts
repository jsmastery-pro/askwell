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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          clerk_user_id: string
          created_at: string
          plan: Database["public"]["Enums"]["plan"]
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          plan?: Database["public"]["Enums"]["plan"]
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          plan?: Database["public"]["Enums"]["plan"]
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          embedding: string
          id: string
          project_id: string
          source_id: string
        }
        Insert: {
          content: string
          embedding: string
          id?: string
          project_id: string
          source_id: string
        }
        Update: {
          content?: string
          embedding?: string
          id?: string
          project_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          created_at: string
          id: string
          project_id: string
          status: Database["public"]["Enums"]["source_status"]
          storage_key: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["source_status"]
          storage_key?: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["source_status"]
          storage_key?: string | null
          title?: string
          type?: Database["public"]["Enums"]["source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["message_role"]
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
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
      projects: {
        Row: {
          created_at: string
          id: string
          messages_used: number
          name: string
          owner_id: string
          period_start: string
          public_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages_used?: number
          name: string
          owner_id: string
          period_start?: string
          public_key: string
        }
        Update: {
          created_at?: string
          id?: string
          messages_used?: number
          name?: string
          owner_id?: string
          period_start?: string
          public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      widget_configs: {
        Row: {
          animation: Database["public"]["Enums"]["widget_animation"]
          button_color: string | null
          header_text: string | null
          label: string | null
          position: Database["public"]["Enums"]["widget_position"]
          project_id: string
          show_badge: boolean
        }
        Insert: {
          animation?: Database["public"]["Enums"]["widget_animation"]
          button_color?: string | null
          header_text?: string | null
          label?: string | null
          position?: Database["public"]["Enums"]["widget_position"]
          project_id: string
          show_badge?: boolean
        }
        Update: {
          animation?: Database["public"]["Enums"]["widget_animation"]
          button_color?: string | null
          header_text?: string | null
          label?: string | null
          position?: Database["public"]["Enums"]["widget_position"]
          project_id?: string
          show_badge?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "widget_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_one_month: { Args: { ts: string }; Returns: string }
      consume_message: {
        Args: { p_message_limit: number; p_project_id: string }
        Returns: boolean
      }
      create_project: {
        Args: {
          p_name: string
          p_owner_id: string
          p_project_limit: number
          p_public_key: string
        }
        Returns: {
          created_at: string
          id: string
          messages_used: number
          name: string
          owner_id: string
          period_start: string
          public_key: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_chunks: {
        Args: {
          p_match_count: number
          p_project_id: string
          p_query_embedding: string
        }
        Returns: {
          content: string
          distance: number
        }[]
      }
      owned_conversation_ids: { Args: never; Returns: string[] }
      owned_project_ids: { Args: never; Returns: string[] }
      owner_activity: {
        Args: { p_end: string; p_start: string }
        Returns: {
          conversations: number
          daily: Json
          messages: number
          visitors: number
        }[]
      }
      reserve_knowledge_source: {
        Args: {
          p_project_id: string
          p_source_id?: string
          p_source_limit: number
          p_storage_key: string
          p_title: string
          p_type: Database["public"]["Enums"]["source_type"]
        }
        Returns: {
          created_at: string
          id: string
          project_id: string
          status: Database["public"]["Enums"]["source_status"]
          storage_key: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_chat_turn: {
        Args: {
          p_asked_at: string
          p_conversation_id: string
          p_project_id: string
          p_question: string
          p_replied_at: string
          p_reply: string
          p_visitor_id: string
        }
        Returns: {
          conversation_id: string
          first_chat: boolean
        }[]
      }
    }
    Enums: {
      message_role: "visitor" | "bot"
      plan: "free" | "pro"
      source_status: "processing" | "ready" | "failed"
      source_type: "text" | "pdf" | "md" | "txt"
      widget_animation: "fade" | "slide" | "scale"
      widget_position: "bottom-right" | "bottom-left" | "top-right" | "top-left"
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
      message_role: ["visitor", "bot"],
      plan: ["free", "pro"],
      source_status: ["processing", "ready", "failed"],
      source_type: ["text", "pdf", "md", "txt"],
      widget_animation: ["fade", "slide", "scale"],
      widget_position: ["bottom-right", "bottom-left", "top-right", "top-left"],
    },
  },
} as const
