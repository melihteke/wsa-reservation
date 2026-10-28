import * as React from "react";
import type { Provider, Session } from "@supabase/supabase-js";
import { getSupabase, type Profile } from "@/lib/supabase";
import { localePath, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";

export type AuthState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; session: Session; profile: Profile | null };

/** Session + profile of the current visitor, kept in sync with Supabase auth events. */
export function useAuth() {
  const [state, setState] = React.useState<AuthState>({ status: "loading" });

  const load = React.useCallback(async (session: Session | null) => {
    const supabase = getSupabase();
    if (!supabase) return setState({ status: "unconfigured" });
    if (!session) return setState({ status: "signed-out" });
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setState({ status: "signed-in", session, profile: (data as Profile | null) ?? null });
  }, []);

  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setState({ status: "unconfigured" });
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: calling Supabase inside the callback can deadlock the auth lock.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(() => active && load(session), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await load(data.session);
  }, [load]);

  return { state, refresh };
}

export const isApproved = (state: AuthState) => state.status === "signed-in" && state.profile?.status === "approved";
export const isAdmin = (state: AuthState) =>
  isApproved(state) && state.status === "signed-in" && (state.profile?.role === "admin" || state.profile?.role === "superadmin");

export async function signIn(provider: Provider, lang: Lang) {
  const supabase = getSupabase();
  if (!supabase) return;
  const redirectTo = new URL(url(localePath(lang, "/auth/callback/")), window.location.origin).toString();
  await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
}

export async function signOut(lang: Lang) {
  await getSupabase()?.auth.signOut();
  window.location.href = url(localePath(lang, "/"));
}

export function displayName(profile: Pick<Profile, "full_name" | "email"> | null | undefined) {
  return profile?.full_name || profile?.email?.split("@")[0] || "?";
}
