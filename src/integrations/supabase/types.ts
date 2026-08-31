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
      anki_decks: {
        Row: {
          created_at: string
          id: string
          interval_days: number
          last_review_at: string | null
          name: string
          next_review_at: string | null
          status: string
          subject_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_days?: number
          last_review_at?: string | null
          name: string
          next_review_at?: string | null
          status?: string
          subject_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_days?: number
          last_review_at?: string | null
          name?: string
          next_review_at?: string | null
          status?: string
          subject_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anki_decks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_sessions: {
        Row: {
          cards_reviewed: number
          deck_id: string
          id: string
          rating: string | null
          reviewed_at: string
          user_id: string
        }
        Insert: {
          cards_reviewed?: number
          deck_id: string
          id?: string
          rating?: string | null
          reviewed_at?: string
          user_id: string
        }
        Update: {
          cards_reviewed?: number
          deck_id?: string
          id?: string
          rating?: string | null
          reviewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "anki_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplines: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string
          created_at: string
          duration_min: number
          id: string
          notes: string | null
          plan_tag: string | null
          starts_at: string
          status: string
          subject_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          duration_min?: number
          id?: string
          notes?: string | null
          plan_tag?: string | null
          starts_at: string
          status?: string
          subject_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          duration_min?: number
          id?: string
          notes?: string | null
          plan_tag?: string | null
          starts_at?: string
          status?: string
          subject_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_analyses: {
        Row: {
          banca: string | null
          created_at: string
          exam_id: string | null
          id: string
          source: string
          summary: string | null
          title: string
          total_questions: number
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          banca?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          source?: string
          summary?: string | null
          title: string
          total_questions?: number
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          banca?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          source?: string
          summary?: string | null
          title?: string
          total_questions?: number
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_analyses_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_topics: {
        Row: {
          analysis_id: string
          area: string
          created_at: string
          id: string
          incidence_pct: number
          question_count: number
          subject: string
          topic: string | null
          user_id: string
        }
        Insert: {
          analysis_id: string
          area: string
          created_at?: string
          id?: string
          incidence_pct?: number
          question_count?: number
          subject: string
          topic?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string
          area?: string
          created_at?: string
          id?: string
          incidence_pct?: number
          question_count?: number
          subject?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_topics_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "exam_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          banca: string | null
          created_at: string
          exam_date: string
          id: string
          location: string | null
          notes: string | null
          registration_deadline: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          banca?: string | null
          created_at?: string
          exam_date: string
          id?: string
          location?: string | null
          notes?: string | null
          registration_deadline?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          banca?: string | null
          created_at?: string
          exam_date?: string
          id?: string
          location?: string | null
          notes?: string | null
          registration_deadline?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
          weekly_goal_hours: number
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          weekly_goal_hours?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          weekly_goal_hours?: number
        }
        Relationships: []
      }
      question_logs: {
        Row: {
          banca: string | null
          correct: number
          created_at: string
          discipline_id: string | null
          id: string
          subject_id: string | null
          total: number
          user_id: string
          year: number | null
        }
        Insert: {
          banca?: string | null
          correct: number
          created_at?: string
          discipline_id?: string | null
          id?: string
          subject_id?: string | null
          total: number
          user_id: string
          year?: number | null
        }
        Update: {
          banca?: string | null
          correct?: number
          created_at?: string
          discipline_id?: string | null
          id?: string
          subject_id?: string | null
          total?: number
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_logs_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_logs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          id: string
          interval_after: number
          interval_before: number
          rating: string
          reviewed_at: string
          subject_id: string
          user_id: string
        }
        Insert: {
          id?: string
          interval_after?: number
          interval_before?: number
          rating: string
          reviewed_at?: string
          subject_id: string
          user_id: string
        }
        Update: {
          id?: string
          interval_after?: number
          interval_before?: number
          rating?: string
          reviewed_at?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          activity_type: string
          created_at: string
          discipline_id: string | null
          id: string
          minutes: number
          notes: string | null
          started_at: string
          subject_id: string | null
          user_id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          discipline_id?: string | null
          id?: string
          minutes: number
          notes?: string | null
          started_at?: string
          subject_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          discipline_id?: string | null
          id?: string
          minutes?: number
          notes?: string | null
          started_at?: string
          subject_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          difficulty: number
          discipline_id: string
          ease: number
          exam_incidence: number
          first_studied_at: string | null
          id: string
          interval_days: number
          lapses: number
          last_studied_at: string | null
          mastery: number
          name: string
          next_review_at: string | null
          parent_id: string | null
          reps: number
          review_count: number
          stability: number
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          discipline_id: string
          ease?: number
          exam_incidence?: number
          first_studied_at?: string | null
          id?: string
          interval_days?: number
          lapses?: number
          last_studied_at?: string | null
          mastery?: number
          name: string
          next_review_at?: string | null
          parent_id?: string | null
          reps?: number
          review_count?: number
          stability?: number
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          discipline_id?: string
          ease?: number
          exam_incidence?: number
          first_studied_at?: string | null
          id?: string
          interval_days?: number
          lapses?: number
          last_studied_at?: string | null
          mastery?: number
          name?: string
          next_review_at?: string | null
          parent_id?: string | null
          reps?: number
          review_count?: number
          stability?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
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
