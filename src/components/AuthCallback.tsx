import * as React from "react";
import { getSupabase, type Profile } from "@/lib/supabase";
import { localePath, useTranslations, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";
import { Notice, Spinner } from "@/components/Gate";

/** OAuth lands here; supabase-js exchanges the ?code= for a session, then we route by approval status. */
export default function AuthCallback({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return setError(t("gate.notConfigured"));
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const providerError = params.get("error_description") || hash.get("error_description");
    if (providerError) return setError(providerError);

    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) return setError(sessionError?.message ?? t("callback.failed"));
      const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.session.user.id).maybeSingle();
      const approved = (profile as Pick<Profile, "status"> | null)?.status === "approved";
      window.location.replace(url(localePath(lang, approved ? "/reserve" : "/pending")));
    })();
  }, [lang]);

  if (error) {
    return (
      <Notice>
        <p className="font-medium text-foreground">{t("callback.failed")}</p>
        <p className="mt-1">{error}</p>
        <a className="mt-4 inline-block font-medium text-primary hover:underline" href={url(localePath(lang, "/login"))}>
          {t("callback.retry")}
        </a>
      </Notice>
    );
  }
  return <Spinner label={t("callback.busy")} />;
}
