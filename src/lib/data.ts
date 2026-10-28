import * as React from "react";
import { getSupabase, type Equipment } from "@/lib/supabase";
import { FLEET } from "@/lib/equipment";
import { DEFAULT_SETTINGS, type BookingSettings } from "@/lib/rules";

/** Active equipment types from Supabase, falling back to the seeded fleet. */
export function useFleet(includeInactive = false) {
  const [fleet, setFleet] = React.useState<Equipment[]>(FLEET);
  const reload = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    let query = supabase.from("equipment_types").select("*").order("sort_order");
    if (!includeInactive) query = query.eq("active", true);
    const { data } = await query;
    if (data) setFleet(data as Equipment[]);
  }, [includeInactive]);
  React.useEffect(() => {
    reload();
  }, [reload]);
  return { fleet, reload };
}

export function useSettings() {
  const [settings, setSettings] = React.useState<BookingSettings>(DEFAULT_SETTINGS);
  const reload = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.from("settings").select("open_time, close_time, max_minutes, step_minutes, booking_days, time_zone").maybeSingle();
    if (data) setSettings(data as BookingSettings);
  }, []);
  React.useEffect(() => {
    reload();
  }, [reload]);
  return { settings, reload };
}

/** Re-render every `ms` so countdowns and "now" stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}

/** Calls `onChange` whenever reservations change (Supabase Realtime), debounced. */
export function useReservationChanges(enabled: boolean, onChange: () => void) {
  const ref = React.useRef(onChange);
  ref.current = onChange;
  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !enabled) return;
    let timer: number | undefined;
    const channel = supabase
      .channel(`reservations-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => ref.current(), 300);
      })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}

export function formatTime(value: string | Date, lang: "nl" | "en", timeZone: string) {
  return new Date(value).toLocaleTimeString(lang === "nl" ? "nl-NL" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

export function formatDate(value: string | Date, lang: "nl" | "en", timeZone: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(value).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { ...opts, timeZone });
}
