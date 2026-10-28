import * as React from "react";
import { Clock } from "lucide-react";
import Gate from "@/components/Gate";
import EquipmentIcon from "@/components/EquipmentIcon";
import { formatDate, formatTime, useFleet, useNow, useReservationChanges } from "@/lib/data";
import { bySlug, equipmentName, ICON_COLOR } from "@/lib/equipment";
import { getSupabase, type Profile, type Reservation } from "@/lib/supabase";
import { formatMinutes } from "@/lib/rules";
import { errorMessage, localePath, useTranslations, type Lang, type T } from "@/i18n/ui";
import { SITE } from "@/config";
import { url } from "@/lib/url";
import { cn } from "@/lib/utils";

export default function MyReservationsPage({ lang }: { lang: Lang }) {
  return <Gate lang={lang}>{({ profile }) => <MyReservations lang={lang} profile={profile} />}</Gate>;
}

export function reservationStatus(r: Reservation, now: Date) {
  if (r.cancelled_at) return "cancelled" as const;
  if (new Date(r.end_at) <= now) return "done" as const;
  if (new Date(r.start_at) <= now) return "active" as const;
  return "upcoming" as const;
}

export function StatusBadge({ status, t }: { status: ReturnType<typeof reservationStatus>; t: T }) {
  const styles = {
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    upcoming: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    done: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", styles[status])}>{t(`my.status.${status}`)}</span>;
}

function MyReservations({ lang, profile }: { lang: Lang; profile: Profile }) {
  const t = useTranslations(lang);
  const { fleet } = useFleet();
  const now = useNow(30_000);
  const tz = SITE.timeZone;
  const [rows, setRows] = React.useState<Reservation[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.from("reservations").select("*").eq("user_id", profile.id).order("start_at", { ascending: false }).limit(200);
    setRows((data as Reservation[] | null) ?? []);
  }, [profile.id]);

  React.useEffect(() => {
    load();
  }, [load]);
  useReservationChanges(true, load);

  async function cancel(r: Reservation) {
    const running = new Date(r.start_at) <= new Date();
    if (!window.confirm(running ? t("my.confirmEnd") : t("my.confirmCancel"))) return;
    setBusy(r.id);
    setError(null);
    const { error: rpcError } = await getSupabase()!.rpc("cancel_reservation", { p_id: r.id });
    setBusy(null);
    if (rpcError) setError(errorMessage(t, rpcError));
    await load();
  }

  const meta = bySlug(fleet);
  const current = (rows ?? []).filter((r) => ["active", "upcoming"].includes(reservationStatus(r, now)));
  const history = (rows ?? []).filter((r) => !current.includes(r));
  const done = history.filter((r) => !r.cancelled_at);
  const hours = done.reduce((sum, r) => sum + (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 3_600_000, 0);

  const Row = ({ r }: { r: Reservation }) => {
    const e = meta.get(r.equipment);
    const status = reservationStatus(r, now);
    const minutes = Math.round((new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 60000);
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", ICON_COLOR[e?.icon ?? ""])}>
          <EquipmentIcon icon={e?.icon ?? ""} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {equipmentName(e, lang, r.equipment)} <StatusBadge status={status} t={t} />
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="h-3 w-3" />
            {formatDate(r.start_at, lang, tz)} · {formatTime(r.start_at, lang, tz)}–{formatTime(r.end_at, lang, tz)} · {formatMinutes(minutes, t("common.hours"), t("common.min"))}
          </p>
        </div>
        {(status === "active" || status === "upcoming") && (
          <button
            type="button"
            disabled={busy === r.id}
            onClick={() => cancel(r)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium disabled:opacity-50",
              status === "active" ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300" : "border-destructive/40 text-destructive hover:bg-destructive/10",
            )}
          >
            {status === "active" ? t("my.endNow") : t("my.cancel")}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("my.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("my.count", { n: done.length, hours: hours.toFixed(1) })}</p>
        </div>
        <a href={url(localePath(lang, "/reserve"))} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {t("nav.reserve")}
        </a>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <section>
        <h2 className="text-sm font-semibold">{t("my.current")}</h2>
        {rows && current.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("my.none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
            {current.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold">{t("my.history")}</h2>
        {rows && history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("my.noHistory")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
            {history.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
