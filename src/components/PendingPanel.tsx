import * as React from "react";
import { Clock, ShieldX } from "lucide-react";
import { isApproved, signOut, useAuth } from "@/lib/auth";
import { localePath, useTranslations, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";
import { Notice, Spinner } from "@/components/Gate";

export default function PendingPanel({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const { state, refresh } = useAuth();
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (state.status === "signed-out") window.location.replace(url(localePath(lang, "/login")));
    if (isApproved(state)) window.location.replace(url(localePath(lang, "/reserve")));
  }, [state, lang]);

  if (state.status === "unconfigured") return <Notice>{t("gate.notConfigured")}</Notice>;
  if (state.status !== "signed-in" || isApproved(state)) return <Spinner label={t("gate.loading")} />;

  const blocked = state.profile?.status === "blocked";
  const email = state.profile?.email || state.session.user.email || "";
  const Icon = blocked ? ShieldX : Clock;
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${blocked ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{blocked ? t("pending.blockedTitle") : t("pending.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{blocked ? t("pending.blockedText", { email }) : t("pending.text", { email })}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!blocked && (
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await refresh();
              setChecking(false);
            }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {t("pending.check")}
          </button>
        )}
        <button type="button" onClick={() => signOut(lang)} className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary">
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );
}
