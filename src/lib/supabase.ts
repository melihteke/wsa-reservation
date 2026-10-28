import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE } from "@/config";

export type Role = "member" | "admin";
export type Status = "pending" | "approved" | "blocked";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: string | null;
  role: Role;
  status: Status;
  created_at: string;
  approved_at: string | null;
};

export type Equipment = {
  slug: string;
  name_nl: string;
  name_en: string;
  icon: string;
  quantity: number;
  sort_order: number;
  active: boolean;
};

export type Reservation = {
  id: number;
  user_id: string;
  equipment: string;
  start_at: string;
  end_at: string;
  cancelled_at: string | null;
  created_at: string;
};

export type BoardRow = {
  id: number;
  equipment: string;
  start_at: string;
  end_at: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_mine: boolean;
};

let client: SupabaseClient | null | undefined;

/** The browser Supabase client, or null when the site was built without Supabase settings. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (typeof window === "undefined" || !SUPABASE.url || !SUPABASE.anonKey) {
    client = null;
    return client;
  }
  client = createClient(SUPABASE.url, SUPABASE.anonKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
