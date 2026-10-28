import * as React from "react";
import { ActivityHeatmap, type ActivityDatum } from "@/components/ui/activity-heatmap";
import { getSupabase } from "@/lib/supabase";
import type { Lang } from "@/i18n/ui";

type Row = { day: string; reservations: number; hours: number };

/** Club-wide hours on the water per day over the last year (anonymous aggregate). */
export default function ClubHeatmap({ lang, days = 365 }: { lang: Lang; days?: number }) {
  const [data, setData] = React.useState<ActivityDatum[]>([]);

  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.rpc("club_activity", { p_days: days }).then(({ data: rows }) => {
      if (rows) setData((rows as Row[]).map((r) => ({ date: r.day, value: Number(r.hours) })));
    });
  }, [days]);

  return (
    <ActivityHeatmap
      data={data}
      days={days}
      cellSize={12}
      color="var(--sea)"
      unit={lang === "nl" ? "uur" : "h"}
      formatValue={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
      autoPlay
      interval={3200}
      lang={lang}
    />
  );
}
