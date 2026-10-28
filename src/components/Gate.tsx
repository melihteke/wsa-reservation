import * as React from "react";
import { Loader2 } from "lucide-react";
import { isAdmin, isApproved, useAuth, type AuthState } from "@/lib/auth";
import { localePath, useTranslations, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";
import type { Profile } from "@/lib/supabase";

type Props = {
  lang: Lang;
  admin?: boolean;
  children: (ctx: { profile: Profile; refresh: () => Promise<void> }) => React.ReactNode;
};

export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/** Renders children only for approved members (or admins); otherwise sends people where they belong. */
export default function Gate({ lang, admin = false, children }: Props) {
  const t = useTranslations(lang);
  const { state, refresh } = useAuth();

  React.useEffect(() => {
    if (state.status === "signed-out") window.location.replace(url(localePath(lang, "/login")));
    if (state.status === "signed-in" && !isApproved(state)) window.location.replace(url(localePath(lang, "/pending")));
  }, [state, lang]);

  if (state.status === "unconfigured") return <Notice>{t("gate.notConfigured")}</Notice>;
  if (!ready(state)) return <Spinner label={t("gate.loading")} />;
  if (admin && !isAdmin(state)) return <Notice>{t("gate.adminOnly")}</Notice>;
  return <>{children({ profile: (state as Extract<AuthState, { status: "signed-in" }>).profile!, refresh })}</>;
}

function ready(state: AuthState) {
  return state.status === "signed-in" && isApproved(state);
}
