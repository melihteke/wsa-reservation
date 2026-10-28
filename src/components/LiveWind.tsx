import * as React from "react";
import { Gauge, RefreshCw, Thermometer, Wind } from "lucide-react";
import { beaufort, compass } from "@/lib/units";
import { locale, useTranslations, type Lang } from "@/i18n/ui";

type Props = { lat: number; lon: number; place: string; timeZone: string; lang: Lang };

type Current = { time: string; speed: number; gust: number; dir: number; temp: number };
type Hour = { time: string; speed: number; gust: number; dir: number };
type State = { status: "loading" } | { status: "error" } | { status: "ok"; current: Current; hours: Hour[]; fetchedAt: Date };

const REFRESH_MS = 10 * 60 * 1000;

export function WindArrow({ deg, className = "" }: { deg: number; className?: string }) {
  // Meteorological direction is where wind comes FROM; the arrow points where it blows TO.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ transform: `rotate(${(deg + 180) % 360}deg)` }}>
      <path d="M12 2 L19 20 L12 16 L5 20 Z" fill="currentColor" />
    </svg>
  );
}

const BEAUFORT_NL = ["Windstil", "Zwak", "Zwak", "Matig", "Matig", "Vrij krachtig", "Krachtig", "Hard", "Stormachtig", "Storm", "Zware storm", "Zeer zware storm", "Orkaan"];

export default function LiveWind({ lat, lon, place, timeZone, lang }: Props) {
  const t = useTranslations(lang);
  const [state, setState] = React.useState<State>({ status: "loading" });

  const load = React.useCallback(async () => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m` +
        `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&forecast_hours=12` +
        `&wind_speed_unit=kn&timezone=${encodeURIComponent(timeZone)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const c = json.current;
      const h = json.hourly;
      setState({
        status: "ok",
        fetchedAt: new Date(),
        current: { time: c.time, speed: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m, temp: c.temperature_2m },
        hours: (h.time as string[]).map((time, i) => ({ time, speed: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i], dir: h.wind_direction_10m[i] })).filter((_, i) => i % 2 === 1).slice(0, 6),
      });
    } catch {
      setState((prev) => (prev.status === "ok" ? prev : { status: "error" }));
    }
  }, [lat, lon, timeZone]);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("wind.kicker")}</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight">{place}</h2>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label={t("wind.refresh")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {state.status === "loading" && <div className="mt-6 h-28 animate-pulse rounded-xl bg-muted" aria-label={t("wind.loading")} />}
      {state.status === "error" && (
        <p className="mt-6 text-sm text-muted-foreground">{t("wind.error")}</p>
      )}
      {state.status === "ok" && (() => {
        const { current, hours, fetchedAt } = state;
        const bft = beaufort(current.speed);
        return (
          <>
            <div className="mt-5 flex items-center gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-sea/40 bg-sea/10 text-sea">
                <WindArrow deg={current.dir} className="h-9 w-9 fill-current" />
              </div>
              <div className="min-w-0">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {current.speed.toFixed(0)}
                  <span className="ml-1 text-base font-medium text-muted-foreground">kn</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("wind.from")} <span className="font-medium text-foreground">{compass(current.dir)}</span> ({Math.round(current.dir)}°) · {t("wind.gusts")}{" "}
                  <span className="font-medium text-foreground">{current.gust.toFixed(0)} kn</span>
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium">
                <Gauge className="h-3.5 w-3.5" /> Bft {bft.force} · {lang === "nl" ? BEAUFORT_NL[bft.force] : bft.name}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium">
                <Thermometer className="h-3.5 w-3.5" /> {current.temp.toFixed(0)} °C
              </span>
            </div>
            <div className="mt-5 grid grid-cols-6 gap-1 border-t border-border pt-4 text-center">
              {hours.map((h) => (
                <div key={h.time} className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">{h.time.slice(11, 16)}</p>
                  <WindArrow deg={h.dir} className="mx-auto mt-1 h-4 w-4 fill-current text-sea" />
                  <p className="mt-1 text-xs font-semibold tabular-nums">{h.speed.toFixed(0)}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{h.gust.toFixed(0)}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Wind className="h-3 w-3" /> {t("wind.footer")}{" "}
              {fetchedAt.toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit", timeZone })}
            </p>
          </>
        );
      })()}
    </div>
  );
}
