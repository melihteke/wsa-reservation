import * as React from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import EquipmentIcon from "@/components/EquipmentIcon";
import { Avatar } from "@/components/AuthNav";
import { reservationStatus, StatusBadge } from "@/components/MyReservationsPage";
import { Badge, btn, card } from "@/components/admin/AdminMembers";
import { formatDate, formatTime, useFleet, useNow } from "@/lib/data";
import { bySlug, equipmentName } from "@/lib/equipment";
import { getSupabase, type Reservation, type Role, type Status } from "@/lib/supabase";
import { errorMessage, useTranslations, type Lang } from "@/i18n/ui";
import { SITE } from "@/config";
import { cn } from "@/lib/utils";

type MemberStat = {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: Role;
  status: Status;
  reservations: number;
  cancelled: number;
  hours: number;
  by_equipment: Record<string, number>;
  last_start: string | null;
};
type EquipmentStat = { slug: string; reservations: number; cancelled: number; hours: number; members: number };
type Row = Reservation & { profile: { full_name: string | null; email: string } | null };

const PERIODS = ["30", "90", "365", "all"] as const;
type Period = (typeof PERIODS)[number];

function range(period: Period) {
  const to = new Date(Date.now() + 3 * 86_400_000);
  const from = period === "all" ? new Date("2000-01-01T00:00:00Z") : new Date(Date.now() - Number(period) * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  // Guard against spreadsheet formula injection from user-controlled names.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export default function AdminStats({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const { fleet } = useFleet(true);
  const now = useNow(60_000);
  const tz = SITE.timeZone;
  const [period, setPeriod] = React.useState<Period>("90");
  const [members, setMembers] = React.useState<MemberStat[]>([]);
  const [equipment, setEquipment] = React.useState<EquipmentStat[]>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const supabase = getSupabase()!;
    const { from, to } = range(period);
    const [m, e, r] = await Promise.all([
      supabase.rpc("admin_member_stats", { p_from: from, p_to: to }),
      supabase.rpc("admin_equipment_stats", { p_from: from, p_to: to }),
      supabase
        .from("reservations")
        .select("*, profile:profiles!reservations_user_id_fkey(full_name, email)")
        .gte("start_at", from)
        .lt("start_at", to)
        .order("start_at", { ascending: false })
        .limit(1000),
    ]);
    const firstError = m.error ?? e.error ?? r.error;
    setError(firstError ? errorMessage(t, firstError) : null);
    setMembers((m.data as MemberStat[] | null) ?? []);
    setEquipment((e.data as EquipmentStat[] | null) ?? []);
    setRows((r.data as Row[] | null) ?? []);
  }, [period]);

  React.useEffect(() => {
    load();
  }, [load]);

  const meta = bySlug(fleet);
  const chart = equipment.map((e) => ({
    name: equipmentName(meta.get(e.slug), lang, e.slug),
    [t("admin.col.reservations")]: e.reservations,
    [t("admin.col.hours")]: Number(e.hours),
  }));
  const active = members.filter((m) => m.reservations > 0 || m.cancelled > 0);

  function exportCsv() {
    const header = ["id", t("admin.col.member"), t("admin.col.email"), t("admin.col.equipment"), t("admin.col.start"), t("admin.col.end"), t("admin.col.status")];
    const lines = rows.map((r) =>
      [
        r.id,
        r.profile?.full_name ?? "",
        r.profile?.email ?? "",
        equipmentName(meta.get(r.equipment), lang, r.equipment),
        new Date(r.start_at).toISOString(),
        new Date(r.end_at).toISOString(),
        t(`my.status.${reservationStatus(r, now)}`),
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wsa-reservations-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function cancel(r: Row) {
    if (!window.confirm(new Date(r.start_at) <= new Date() ? t("my.confirmEnd") : t("my.confirmCancel"))) return;
    const { error: rpcError } = await getSupabase()!.rpc("cancel_reservation", { p_id: r.id });
    if (rpcError) setError(errorMessage(t, rpcError));
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-muted/70 p-1" role="radiogroup" aria-label={t("admin.period")}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium", period === p ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t(`admin.period.${p}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className={cn(btn, "border-border px-4 py-1.5 text-sm")}>
          <Download className="h-4 w-4" /> {t("admin.export")}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className={card}>
        <h2 className="text-lg font-semibold">{t("admin.perEquipment")}</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--muted)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t("admin.col.reservations")} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey={t("admin.col.hours")} fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("admin.col.equipment")}</th>
                <th className="py-1 text-right font-medium">{t("admin.col.total")}</th>
                <th className="py-1 text-right font-medium">{t("admin.col.hours")}</th>
                <th className="py-1 text-right font-medium">{t("admin.col.members")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {equipment.map((e) => (
                <tr key={e.slug}>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <EquipmentIcon icon={meta.get(e.slug)?.icon ?? ""} className="h-4 w-4" /> {equipmentName(meta.get(e.slug), lang, e.slug)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">{e.reservations}</td>
                  <td className="py-1.5 text-right">{Number(e.hours).toFixed(1)}</td>
                  <td className="py-1.5 text-right">{e.members}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">{t("admin.perMember")}</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.noData")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t("admin.col.member")}</th>
                  {fleet.map((e) => (
                    <th key={e.slug} className="py-2 text-center font-medium" title={equipmentName(e, lang)}>
                      <EquipmentIcon icon={e.icon} className="mx-auto h-4 w-4" title={equipmentName(e, lang)} />
                    </th>
                  ))}
                  <th className="py-2 text-right font-medium">{t("admin.col.total")}</th>
                  <th className="py-2 text-right font-medium">{t("admin.col.hours")}</th>
                  <th className="py-2 text-right font-medium">{t("admin.col.cancelled")}</th>
                  <th className="py-2 text-right font-medium">{t("admin.col.last")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {active.map((m) => (
                  <tr key={m.user_id}>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <Avatar src={m.avatar_url} name={m.full_name || m.email} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.full_name || m.email}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                        </span>
                        {m.status !== "approved" && <Badge tone="red">{t(`admin.status.${m.status}`)}</Badge>}
                      </span>
                    </td>
                    {fleet.map((e) => (
                      <td key={e.slug} className="py-2 text-center">
                        {m.by_equipment[e.slug] ?? <span className="text-muted-foreground/50">·</span>}
                      </td>
                    ))}
                    <td className="py-2 text-right font-semibold">{m.reservations}</td>
                    <td className="py-2 text-right">{Number(m.hours).toFixed(1)}</td>
                    <td className="py-2 text-right text-muted-foreground">{m.cancelled}</td>
                    <td className="py-2 text-right text-xs text-muted-foreground">{m.last_start ? formatDate(m.last_start, lang, tz) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">
          {t("admin.recent")} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.noData")}</p>
        ) : (
          <div className="mt-3 max-h-[480px] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t("admin.col.start")}</th>
                  <th className="py-2 font-medium">{t("admin.col.member")}</th>
                  <th className="py-2 font-medium">{t("admin.col.equipment")}</th>
                  <th className="py-2 font-medium">{t("admin.col.status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const status = reservationStatus(r, now);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 tabular-nums">
                        {formatDate(r.start_at, lang, tz)} {formatTime(r.start_at, lang, tz)}–{formatTime(r.end_at, lang, tz)}
                      </td>
                      <td className="py-2">{r.profile?.full_name || r.profile?.email || "?"}</td>
                      <td className="py-2">
                        <span className="flex items-center gap-1.5">
                          <EquipmentIcon icon={meta.get(r.equipment)?.icon ?? ""} className="h-4 w-4" /> {equipmentName(meta.get(r.equipment), lang, r.equipment)}
                        </span>
                      </td>
                      <td className="py-2">
                        <StatusBadge status={status} t={t} />
                      </td>
                      <td className="py-2 text-right">
                        {(status === "active" || status === "upcoming") && (
                          <button type="button" onClick={() => cancel(r)} className={cn(btn, "border-destructive/40 text-destructive")}>
                            {status === "active" ? t("my.endNow") : t("my.cancel")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
