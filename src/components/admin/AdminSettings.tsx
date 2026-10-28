import * as React from "react";
import EquipmentIcon from "@/components/EquipmentIcon";
import { card } from "@/components/admin/AdminMembers";
import { useFleet, useSettings } from "@/lib/data";
import { equipmentName } from "@/lib/equipment";
import { getSupabase, type Equipment } from "@/lib/supabase";
import { errorMessage, useTranslations, type Lang } from "@/i18n/ui";

const input = "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export default function AdminSettings({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const { settings, reload } = useSettings();
  const { fleet, reload: reloadFleet } = useFleet(true);
  const [form, setForm] = React.useState(settings);
  const [items, setItems] = React.useState<Equipment[]>(fleet);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => setForm(settings), [settings]);
  React.useEffect(() => setItems(fleet), [fleet]);

  async function saveSettings(event: React.SyntheticEvent) {
    event.preventDefault();
    const { error } = await getSupabase()!
      .from("settings")
      .update({
        open_time: form.open_time.slice(0, 5),
        close_time: form.close_time.slice(0, 5),
        max_minutes: Number(form.max_minutes),
        booking_days: Number(form.booking_days),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setMessage(error ? { ok: false, text: errorMessage(t, error) } : { ok: true, text: t("admin.saved") });
    await reload();
  }

  async function saveFleet(event: React.SyntheticEvent) {
    event.preventDefault();
    const supabase = getSupabase()!;
    const results = await Promise.all(
      items.map((e) => supabase.from("equipment_types").update({ quantity: Number(e.quantity), active: e.active }).eq("slug", e.slug)),
    );
    const error = results.find((r) => r.error)?.error;
    setMessage(error ? { ok: false, text: errorMessage(t, error) } : { ok: true, text: t("admin.saved") });
    await reloadFleet();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {message && (
        <p role="status" className={`rounded-xl border p-3 text-sm lg:col-span-2 ${message.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {message.text}
        </p>
      )}
      <form className={card} onSubmit={saveSettings}>
        <h2 className="text-lg font-semibold">{t("admin.settings")}</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("admin.open")}
            <input type="time" step={1800} required value={form.open_time.slice(0, 5)} onChange={(e) => setForm({ ...form, open_time: e.target.value })} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("admin.close")}
            <input type="time" step={1800} required value={form.close_time.slice(0, 5)} onChange={(e) => setForm({ ...form, close_time: e.target.value })} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("admin.maxMinutes")}
            <input type="number" min={30} max={720} step={30} required value={form.max_minutes} onChange={(e) => setForm({ ...form, max_minutes: Number(e.target.value) })} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("admin.bookingDays")}
            <input type="number" min={1} max={7} required value={form.booking_days} onChange={(e) => setForm({ ...form, booking_days: Number(e.target.value) })} className={input} />
          </label>
        </div>
        <button type="submit" className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {t("admin.save")}
        </button>
      </form>

      <form className={card} onSubmit={saveFleet}>
        <h2 className="text-lg font-semibold">{t("admin.fleet")}</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">{t("admin.col.equipment")}</th>
              <th className="py-2 font-medium">{t("admin.quantity")}</th>
              <th className="py-2 text-center font-medium">{t("admin.active")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((e, i) => (
              <tr key={e.slug}>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <EquipmentIcon icon={e.icon} className="h-5 w-5" /> {equipmentName(e, lang)}
                  </span>
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={e.quantity}
                    aria-label={`${t("admin.quantity")} ${equipmentName(e, lang)}`}
                    onChange={(ev) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(ev.target.value) } : x)))}
                    className={`${input} w-20`}
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={e.active}
                    aria-label={`${t("admin.active")} ${equipmentName(e, lang)}`}
                    onChange={(ev) => setItems(items.map((x, j) => (j === i ? { ...x, active: ev.target.checked } : x)))}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {t("admin.save")}
        </button>
      </form>
    </div>
  );
}
