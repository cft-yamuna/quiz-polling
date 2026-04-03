export interface Database {
  public: {
    Tables: {
      polls: {
        Row: {
          id: string;
          title: string;
          active_question_index: number;
          is_active: boolean;
          is_display_started: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          active_question_index?: number;
          is_active?: boolean;
          is_display_started?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          active_question_index?: number;
          is_active?: boolean;
          is_display_started?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          poll_id: string;
          question_text: string;
          options: string[];
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          poll_id: string;
          question_text: string;
          options: string[];
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          poll_id?: string;
          question_text?: string;
          options?: string[];
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'questions_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          }
        ];
      };
      question_results: {
        Row: {
          question_id: string;
          total_answers: number;
          option_counts: Record<string, number>;
          option_percentages: Record<string, number>;
          updated_at: string;
        };
        Insert: {
          question_id: string;
          total_answers?: number;
          option_counts?: Record<string, number>;
          option_percentages?: Record<string, number>;
          updated_at?: string;
        };
        Update: {
          question_id?: string;
          total_answers?: number;
          option_counts?: Record<string, number>;
          option_percentages?: Record<string, number>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'question_results_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: true;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          }
        ];
      };
      participants: {
        Row: {
          id: string;
          poll_id: string;
          name: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          poll_id: string;
          name: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          poll_id?: string;
          name?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          }
        ];
      };
      answers: {
        Row: {
          id: string;
          question_id: string;
          participant_id: string;
          answer: string;
          answered_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          participant_id: string;
          answer: string;
          answered_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          participant_id?: string;
          answer?: string;
          answered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'answers_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
