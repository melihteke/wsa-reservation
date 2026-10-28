import * as React from "react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import Gate from "@/components/Gate";
import EquipmentIcon from "@/components/EquipmentIcon";
import { formatDate, formatTime, useFleet, useNow, useReservationChanges, useSettings } from "@/lib/data";
import { bySlug, equipmentName, ICON_COLOR } from "@/lib/equipment";
import { getSupabase, type Profile, type Reservation } from "@/lib/supabase";
import { addDays, bookingDays, durationOptions, formatMinutes, peakUsage, startSlots, toMinutes, zonedParts, zonedToUtc } from "@/lib/rules";
import { errorMessage, localePath, useTranslations, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";
import { cn } from "@/lib/utils";

export default function ReservePage({ lang }: { lang: Lang }) {
  return <Gate lang={lang}>{({ profile }) => <ReserveForm lang={lang} profile={profile} />}</Gate>;
}

type Slim = Pick<Reservation, "id" | "user_id" | "equipment" | "start_at" | "end_at">;

function ReserveForm({ lang, profile }: { lang: Lang; profile: Profile }) {
  const t = useTranslations(lang);
  const { fleet } = useFleet();
  const { settings } = useSettings();
  const now = useNow(60_000);
  const tz = settings.time_zone;
  const days = bookingDays(now, settings);

  const [equipment, setEquipment] = React.useState<string>("");
  const [day, setDay] = React.useState<string>(days[0]!);
  const [start, setStart] = React.useState<string>("");
  const [minutes, setMinutes] = React.useState<number>(120);
  const [taken, setTaken] = React.useState<Slim[]>([]);
  const [mine, setMine] = React.useState<Slim | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const from = zonedToUtc(days[0]!, "00:00", tz).toISOString();
    const to = zonedToUtc(addDays(days.at(-1)!, 1), "00:00", tz).toISOString();
    const { data } = await supabase
      .from("reservations")
      .select("id, user_id, equipment, start_at, end_at")
      .is("cancelled_at", null)
      .lt("start_at", to)
      .gt("end_at", from);
    const rows = (data as Slim[] | null) ?? [];
    setTaken(rows);
    const current = await supabase
      .from("reservations")
      .select("id, user_id, equipment, start_at, end_at")
      .eq("user_id", profile.id)
      .is("cancelled_at", null)
      .gt("end_at", new Date().toISOString())
      .order("start_at")
      .limit(1);
    setMine(((current.data as Slim[] | null) ?? [])[0] ?? null);
  }, [days[0], days.at(-1), tz, profile.id]);

  React.useEffect(() => {
    load();
  }, [load]);
  useReservationChanges(true, load);

  React.useEffect(() => {
    if (!days.includes(day)) setDay(days[0]!);
  }, [days.join(), day]);

  const meta = bySlug(fleet);
  const selected = meta.get(equipment);
  const slots = startSlots(day, now, settings);
  const durations = start ? durationOptions(start, settings) : [];
  const effectiveMinutes = durations.length ? Math.min(minutes, durations.at(-1)!) : minutes;

  React.useEffect(() => {
    if (start && !slots.includes(start)) setStart("");
  }, [slots.join(), start]);

  const freeAt = (slug: string, slot: string, length: number) => {
    const total = meta.get(slug)?.quantity ?? 0;
    const room = toMinutes(settings.close_time) - toMinutes(slot);
    const s = zonedToUtc(day, slot, tz);
    const e = new Date(s.getTime() + Math.min(length, room) * 60_000);
    return total - peakUsage(taken.filter((r) => r.equipment === slug), s, e);
  };
  const freeNow = (slug: string) => {
    const total = meta.get(slug)?.quantity ?? 0;
    return total - taken.filter((r) => r.equipment === slug && new Date(r.start_at) <= now && new Date(r.end_at) > now).length;
  };

  const dayLabel = (d: string) => {
    const today = zonedParts(now, tz).date;
    const base = d === today ? t("board.today") : d === addDays(today, 1) ? t("board.tomorrow") : "";
    const date = formatDate(zonedToUtc(d, "12:00", tz), lang, tz);
    return base ? `${base[0]!.toUpperCase()}${base.slice(1)} · ${date}` : date;
  };

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !equipment || !start) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const startAt = zonedToUtc(day, start, tz);
    const { data, error: rpcError } = await supabase.rpc("create_reservation", {
      p_equipment: equipment,
      p_start: startAt.toISOString(),
      p_minutes: effectiveMinutes,
    });
    setBusy(false);
    if (rpcError) {
      setError(errorMessage(t, rpcError));
    } else {
      const r = data as Reservation;
      setSuccess(
        t("reserve.success", {
          equipment: equipmentName(selected, lang, equipment),
          day: dayLabel(day).toLowerCase(),
          start: formatTime(r.start_at, lang, tz),
          end: formatTime(r.end_at, lang, tz),
        }),
      );
      setStart("");
    }
    await load();
  }

  const fmt = (time: string) => time.slice(0, 5);
  const blocked = Boolean(mine);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("reserve.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("reserve.rules", { hours: settings.max_minutes / 60, step: settings.step_minutes, open: fmt(settings.open_time), close: fmt(settings.close_time) })}
        </p>
      </div>

      {success && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-medium">{success}</p>
            <a className="mt-1 inline-block font-medium text-primary hover:underline" href={url(localePath(lang, "/my"))}>
              {t("nav.my")} →
            </a>
          </div>
        </div>
      )}

      {blocked && mine && !success && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-3">
            <EquipmentIcon icon={meta.get(mine.equipment)?.icon ?? ""} className="h-6 w-6 text-amber-600" />
            <div>
              <p className="font-medium">
                {equipmentName(meta.get(mine.equipment), lang, mine.equipment)} · {formatDate(mine.start_at, lang, tz)} {formatTime(mine.start_at, lang, tz)}–{formatTime(mine.end_at, lang, tz)}
              </p>
              <p className="text-muted-foreground">{t("reserve.haveOne")}</p>
            </div>
          </div>
          <a className="rounded-full border border-border bg-background px-4 py-2 font-medium hover:bg-secondary" href={url(localePath(lang, "/my"))}>
            {t("nav.my")}
          </a>
        </div>
      )}

      <form onSubmit={submit} className={cn("space-y-6", blocked && "pointer-events-none opacity-50")} aria-disabled={blocked}>
        <fieldset>
          <legend className="text-sm font-semibold">{t("reserve.equipment")}</legend>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {fleet.map((e) => {
              const free = freeNow(e.slug);
              const active = equipment === e.slug;
              return (
                <label
                  key={e.slug}
                  className={cn(
                    "flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
                  )}
                >
                  <input type="radio" name="equipment" value={e.slug} checked={active} onChange={() => setEquipment(e.slug)} className="sr-only" />
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", ICON_COLOR[e.icon])}>
                    <EquipmentIcon icon={e.icon} />
                  </span>
                  <span className="text-sm font-medium">{equipmentName(e, lang)}</span>
                  <span className="text-xs text-muted-foreground">{t("board.available", { free: Math.max(free, 0), total: e.quantity })}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("reserve.day")}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                aria-pressed={day === d}
                className={cn("rounded-full border px-4 py-2 text-sm font-medium", day === d ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary")}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("reserve.start")}</legend>
          {slots.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("reserve.noSlots")}</p>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {slots.map((slot) => {
                const free = equipment ? freeAt(equipment, slot, effectiveMinutes) : null;
                const full = free !== null && free <= 0;
                const low = free !== null && !full && free <= Math.max(1, Math.floor((selected?.quantity ?? 0) / 4));
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={full}
                    onClick={() => setStart(slot)}
                    aria-pressed={start === slot}
                    className={cn(
                      "flex flex-col items-center rounded-lg border px-2 py-1.5 text-sm tabular-nums transition",
                      start === slot ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                      full && "cursor-not-allowed opacity-40 line-through",
                    )}
                  >
                    <span className="font-medium">{slot}</span>
                    {free !== null && (
                      <span className={cn("text-[10px]", start === slot ? "text-primary-foreground/80" : full ? "text-destructive" : low ? "text-amber-600" : "text-muted-foreground")}>
                        {full ? t("reserve.full") : t("reserve.free", { n: free })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("reserve.duration")}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(durations.length ? durations : durationOptions(fmt(settings.open_time), settings)).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!start}
                onClick={() => setMinutes(m)}
                aria-pressed={effectiveMinutes === m}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50",
                  effectiveMinutes === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                )}
              >
                {formatMinutes(m, t("common.hours"), t("common.min"))}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || blocked || !equipment || !start}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
          {busy ? t("reserve.busy") : t("reserve.submit")}
          {equipment && start && !busy && (
            <span className="font-normal opacity-80">
              · {equipmentName(selected, lang)} {start}–{formatTime(new Date(zonedToUtc(day, start, tz).getTime() + effectiveMinutes * 60_000), lang, tz)}
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
