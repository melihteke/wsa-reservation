import * as React from "react";
import { getSupabase } from "@/lib/supabase";
import { bySlug, equipmentName } from "@/lib/equipment";
import { useFleet } from "@/lib/data";
import { useTranslations, type Lang } from "@/i18n/ui";

type Summary = { reservations: number; hours: number; members: number; on_water: number; favourite: string | null };

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight" title={value}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default function ClubStats({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const { fleet } = useFleet();
  const [summary, setSummary] = React.useState<Summary | null>(null);

  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const load = () =>
      supabase.rpc("club_summary").then(({ data }) => {
        const row = (data as Summary[] | null)?.[0];
        if (row) setSummary(row);
      });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const n = (v: number | undefined) => (summary ? new Intl.NumberFormat(lang === "nl" ? "nl-NL" : "en-GB").format(Number(v ?? 0)) : "–");
  const favourite = summary?.favourite ? equipmentName(bySlug(fleet).get(summary.favourite), lang, summary.favourite) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label={t("stats.onWater")} value={n(summary?.on_water)} hint={favourite ? `${t("stats.favourite")}: ${favourite}` : undefined} />
      <StatCard label={t("stats.reservations")} value={n(summary?.reservations)} hint={t("stats.reservationsHint")} />
      <StatCard label={t("stats.hours")} value={n(summary?.hours)} hint={t("stats.hoursHint")} />
      <StatCard label={t("stats.members")} value={n(summary?.members)} hint={t("stats.membersHint")} />
    </div>
  );
}
