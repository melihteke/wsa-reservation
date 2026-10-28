import type { Lang } from "@/i18n/ui";
import type { Equipment } from "@/lib/supabase";

/** Fallback fleet, matching the seed in supabase/migrations/0001_schema.sql. */
export const FLEET: Equipment[] = [
  { slug: "laser-pico", name_nl: "Laser Pico", name_en: "Laser Pico", icon: "dinghy", quantity: 6, sort_order: 10, active: true },
  { slug: "optimist", name_nl: "Optimist", name_en: "Optimist", icon: "optimist", quantity: 6, sort_order: 15, active: true },
  { slug: "kielboot", name_nl: "Kielboot", name_en: "Keelboat", icon: "keelboat", quantity: 2, sort_order: 20, active: true },
  { slug: "waterfiets", name_nl: "Waterfiets", name_en: "Pedal boat", icon: "pedalboat", quantity: 10, sort_order: 30, active: true },
  { slug: "sup", name_nl: "Supboard", name_en: "SUP board", icon: "sup", quantity: 10, sort_order: 40, active: true },
  { slug: "windsurf", name_nl: "Windsurfplank", name_en: "Windsurf board", icon: "windsurf", quantity: 10, sort_order: 50, active: true },
];

export function equipmentName(item: Pick<Equipment, "name_nl" | "name_en"> | undefined, lang: Lang, fallback = "?") {
  if (!item) return fallback;
  return lang === "nl" ? item.name_nl : item.name_en;
}

export function bySlug(list: Equipment[]) {
  return new Map(list.map((e) => [e.slug, e]));
}

/** Accent colour per icon so the board is easy to scan. */
export const ICON_COLOR: Record<string, string> = {
  dinghy: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  optimist: "text-orange-600 dark:text-orange-400 bg-orange-500/10",
  keelboat: "text-indigo-600 dark:text-indigo-300 bg-indigo-500/10",
  pedalboat: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  sup: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  windsurf: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
};
