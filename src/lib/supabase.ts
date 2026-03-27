import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabaseService = import.meta.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY env vars');
}

/** Public client — safe to use in browser and server for read operations */
export const supabase = createClient(supabaseUrl, supabaseAnon);

/** Service client — server-side only, bypasses RLS for writes */
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseService ?? supabaseAnon,
  { auth: { persistSession: false } }
);

export type Database = {
  public: {
    Tables: {
      signals: {
        Row: {
          id: string;
          domain: 'crypto' | 'trends' | 'macro' | 'alt-data' | 'finance';
          type: 'rate-move' | 'momentum' | 'alert' | 'correlation';
          title: string;
          body: string | null;
          metric_label: string | null;
          metric_value: string | null;
          direction: 'bullish' | 'bearish' | 'neutral';
          strength: number;
          source_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['signals']['Row'], 'id' | 'created_at'>;
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          interest: string | null;
          user_type: 'individual' | 'institutional' | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['waitlist']['Row'], 'id' | 'created_at'>;
      };
    };
  };
};
