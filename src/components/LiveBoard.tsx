import * as React from "react";
import { Clock, LogIn, Radio } from "lucide-react";
import EquipmentIcon from "@/components/EquipmentIcon";
import { Avatar } from "@/components/AuthNav";
import { isApproved, useAuth } from "@/lib/auth";
import { formatTime, useFleet, useNow, useReservationChanges } from "@/lib/data";
import { bySlug, equipmentName, ICON_COLOR } from "@/lib/equipment";
import { getSupabase, type BoardRow } from "@/lib/supabase";
import { formatMinutes, zonedParts } from "@/lib/rules";
import { localePath, useTranslations, type Lang } from "@/i18n/ui";
import { SITE } from "@/config";
import { url } from "@/lib/url";
import { cn } from "@/lib/utils";

type Availability = { slug: string; quantity: number; in_use: number };

const REFRESH_MS = 60_000;

/** Home page live board: availability for everyone, names for approved members (realtime). */
export default function LiveBoard({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const { state } = useAuth();
  const member = isApproved(state);
  const { fleet } = useFleet();
  const now = useNow(30_000);
  const [availability, setAvailability] = React.useState<Availability[] | null>(null);
  const [rows, setRows] = React.useState<BoardRow[]>([]);
  const tz = SITE.timeZone;

  const load = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const [avail, board] = await Promise.all([
      supabase.rpc("public_availability"),
      member ? supabase.rpc("live_board") : Promise.resolve({ data: [] as BoardRow[] }),
    ]);
    if (avail.data) setAvailability(avail.data as Availability[]);
    if (board.data) setRows(board.data as BoardRow[]);
  }, [member]);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  useReservationChanges(member, load);

  const meta = bySlug(fleet);
  const live = rows.filter((r) => new Date(r.start_at) <= now && new Date(r.end_at) > now);
  const upcoming = rows.filter((r) => new Date(r.start_at) > now).slice(0, 12);
  const today = zonedParts(now, tz).date;
  const inUse = (slug: string) => (member ? live.filter((r) => r.equipment === slug).length : availability?.find((a) => a.slug === slug)?.in_use ?? 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Radio className="h-3 w-3 text-emerald-500" /> {t("board.kicker")}
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{t("board.title")}</h2>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {fleet.map((e) => {
          const used = inUse(e.slug);
          const free = Math.max(e.quantity - used, 0);
          const pct = e.quantity ? (used / e.quantity) * 100 : 0;
          return (
            <li key={e.slug} className="min-w-0 rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", ICON_COLOR[e.icon])}>
                  <EquipmentIcon icon={e.icon} className="h-5 w-5" />
                </span>
                <p className="truncate text-sm font-medium" title={equipmentName(e, lang)}>
                  {equipmentName(e, lang)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("board.available", { free, total: e.quantity })}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full", free === 0 ? "bg-destructive" : "bg-sea")} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {member ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <h3 className="text-sm font-semibold">{t("stats.onWater")}</h3>
            {live.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("board.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {live.map((r) => {
                  const e = meta.get(r.equipment);
                  const left = Math.max(0, Math.round((new Date(r.end_at).getTime() - now.getTime()) / 60000));
                  const name = r.full_name || "?";
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar src={r.avatar_url} name={name} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {name}
                          {r.is_mine && <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("board.you")}</span>}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <EquipmentIcon icon={e?.icon ?? ""} className="h-3.5 w-3.5" /> {equipmentName(e, lang, r.equipment)}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-medium tabular-nums">{t("board.until", { time: formatTime(r.end_at, lang, tz) })}</p>
                        <p className="text-muted-foreground">{t("board.left", { min: formatMinutes(left, t("common.hours"), t("common.min")) })}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-sm font-semibold">{t("board.upcoming")}</h3>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("board.noUpcoming")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {upcoming.map((r) => {
                  const e = meta.get(r.equipment);
                  const day = zonedParts(new Date(r.start_at), tz).date === today ? t("board.today") : t("board.tomorrow");
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_COLOR[e?.icon ?? ""])}>
                        <EquipmentIcon icon={e?.icon ?? ""} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-medium">{r.full_name || "?"}</span>
                          {r.is_mine && <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("board.you")}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{equipmentName(e, lang, r.equipment)}</p>
                      </div>
                      <p className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Clock className="h-3 w-3" /> {day} {formatTime(r.start_at, lang, tz)}–{formatTime(r.end_at, lang, tz)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        state.status !== "loading" &&
        state.status !== "unconfigured" && (
          <a href={url(localePath(lang, state.status === "signed-out" ? "/login" : "/pending"))} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <LogIn className="h-4 w-4" /> {t("board.loginHint")}
          </a>
        )
      )}
    </div>
  );
}
