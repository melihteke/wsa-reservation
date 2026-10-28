import * as React from "react";
import { Check, Lock, Search, Trash2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/AuthNav";
import { displayName } from "@/lib/auth";
import { formatDate } from "@/lib/data";
import { getSupabase, type Profile, type Role, type Status } from "@/lib/supabase";
import { errorMessage, useTranslations, type Lang } from "@/i18n/ui";
import { SITE } from "@/config";
import { cn } from "@/lib/utils";

type Allowed = { email: string; role: Role; full_name: string | null; created_at: string };

export const card = "rounded-2xl border border-border bg-card p-5 shadow-sm";
export const btn = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50";

export function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "red" | "blue" | "muted" }) {
  const tones = {
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    red: "bg-destructive/10 text-destructive",
    blue: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

const STATUS_TONE: Record<Status, "green" | "amber" | "red"> = { approved: "green", pending: "amber", blocked: "red" };
const ROLE_TONE: Record<Role, "blue" | "amber" | "muted"> = { superadmin: "amber", admin: "blue", member: "muted" };

export default function AdminMembers({ lang, me }: { lang: Lang; me: Profile }) {
  const t = useTranslations(lang);
  const iAmSuper = me.role === "superadmin";
  const grantable: Role[] = iAmSuper ? ["member", "admin", "superadmin"] : ["member", "admin"];
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [allowed, setAllowed] = React.useState<Allowed[]>([]);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ email: "", name: "", role: "member" as Role });

  const load = React.useCallback(async () => {
    const supabase = getSupabase()!;
    const [p, a] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("allowed_emails").select("*").order("created_at", { ascending: false }),
    ]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (a.data) setAllowed(a.data as Allowed[]);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(key);
    setError(null);
    const { error: rpcError } = await fn();
    setBusy(null);
    if (rpcError) setError(errorMessage(t, rpcError));
    await load();
    return !rpcError;
  }

  const supabase = getSupabase()!;
  const update = (p: Profile, role: Role, status: Status) =>
    run(p.id, () => supabase.rpc("admin_update_member", { p_user: p.id, p_role: role, p_status: status }));
  const remove = (p: Profile) => {
    if (!window.confirm(t("admin.confirmDelete", { name: displayName(p) }))) return;
    return run(p.id, () => supabase.rpc("admin_delete_member", { p_user: p.id }));
  };

  const pending = profiles.filter((p) => p.status === "pending");
  const q = query.trim().toLowerCase();
  const others = profiles.filter((p) => p.status !== "pending" && (!q || `${p.full_name} ${p.email}`.toLowerCase().includes(q)));
  const date = (value: string) => formatDate(value, lang, SITE.timeZone, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className={card}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {t("admin.pending")} {pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.noPending")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar src={p.avatar_url} name={displayName(p)} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(p)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email} · {p.provider ?? "?"} · {t("admin.joined", { date: date(p.created_at) })}
                  </p>
                </div>
                <button type="button" disabled={busy === p.id} onClick={() => update(p, "member", "approved")} className={cn(btn, "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                  <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                </button>
                <button type="button" disabled={busy === p.id} onClick={() => update(p, "member", "blocked")} className={cn(btn, "border-destructive/40 text-destructive")}>
                  <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                </button>
                <button type="button" disabled={busy === p.id} onClick={() => remove(p)} className={cn(btn, "border-border text-muted-foreground")} aria-label={t("admin.delete")} title={t("admin.delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {t("admin.members")} <span className="text-sm font-normal text-muted-foreground">({others.length})</span>
            </h2>
            <label className="relative">
              <span className="sr-only">{t("admin.search")}</span>
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("admin.search")}
                className="h-8 w-56 rounded-full border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {others.map((p) => {
              const self = p.id === me.id;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar src={p.avatar_url} name={displayName(p)} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{displayName(p)}</span>
                      {p.role !== "member" && <Badge tone={ROLE_TONE[p.role]}>{t(`admin.role.${p.role}`)}</Badge>}
                      <Badge tone={STATUS_TONE[p.status]}>{t(`admin.status.${p.status}`)}</Badge>
                      {self && <Badge tone="muted">{t("admin.you")}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.email} · {p.provider ?? "?"} · {t("admin.joined", { date: date(p.created_at) })}
                    </p>
                  </div>
                  {!self && p.role === "superadmin" && (
                    <span className={cn(btn, "border-amber-500/40 text-amber-700 dark:text-amber-300")} title={t("admin.protectedHint")}>
                      <Lock className="h-3.5 w-3.5" /> {t("admin.protected")}
                    </span>
                  )}
                  {!self && p.role !== "superadmin" && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.status === "approved" && (
                        <select
                          value={p.role}
                          disabled={busy === p.id}
                          aria-label={`${t("admin.changeRole")}: ${displayName(p)}`}
                          title={t("admin.changeRole")}
                          onChange={(e) => update(p, e.target.value as Role, "approved")}
                          className="h-7 rounded-full border border-border bg-background px-2 text-xs font-medium"
                        >
                          {grantable.map((r) => (
                            <option key={r} value={r}>
                              {t(`admin.role.${r}`)}
                            </option>
                          ))}
                        </select>
                      )}
                      {p.status === "approved" ? (
                        <button type="button" disabled={busy === p.id} onClick={() => update(p, p.role, "blocked")} className={cn(btn, "border-destructive/40 text-destructive")}>
                          {t("admin.block")}
                        </button>
                      ) : (
                        <button type="button" disabled={busy === p.id} onClick={() => update(p, p.role, "approved")} className={cn(btn, "border-emerald-500/40 text-emerald-700 dark:text-emerald-300")}>
                          {t("admin.unblock")}
                        </button>
                      )}
                      <button type="button" disabled={busy === p.id} onClick={() => remove(p)} className={cn(btn, "border-border text-muted-foreground")} aria-label={t("admin.delete")} title={t("admin.delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-6">
          <section className={card}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="h-5 w-5" /> {t("admin.preapprove")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.preapproveText")}</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run("add", () => supabase.rpc("admin_add_email", { p_email: form.email, p_role: form.role, p_full_name: form.name || null }));
                if (ok) setForm({ email: "", name: "", role: "member" });
              }}
            >
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={t("admin.email")}
                aria-label={t("admin.email")}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("admin.name")}
                aria-label={t("admin.name")}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="role">
                  {t("admin.role")}
                </label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {grantable.map((r) => (
                    <option key={r} value={r}>
                      {t(`admin.role.${r}`)}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy === "add"} className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {t("admin.add")}
                </button>
              </div>
            </form>
          </section>

          <section className={card}>
            <h2 className="text-lg font-semibold">{t("admin.allowed")}</h2>
            {allowed.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("admin.noAllowed")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {allowed.map((a) => (
                  <li key={a.email} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{a.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.full_name ? `${a.full_name} · ` : ""}
                        {t(`admin.role.${a.role}`)}
                      </p>
                    </div>
                    {a.role === "superadmin" && !iAmSuper ? (
                      <Lock className="h-4 w-4 text-amber-600" aria-label={t("admin.protected")} />
                    ) : (
                    <button
                      type="button"
                      disabled={busy === a.email}
                      onClick={() => run(a.email, () => supabase.rpc("admin_remove_email", { p_email: a.email }))}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`${t("admin.remove")} ${a.email}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
