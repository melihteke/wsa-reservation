import * as React from "react";
import { LogIn, LogOut, ShieldCheck, Ticket } from "lucide-react";
import { displayName, isAdmin, isApproved, signOut, useAuth } from "@/lib/auth";
import { localePath, useTranslations, type Lang } from "@/i18n/ui";
import { url } from "@/lib/url";
import { cn } from "@/lib/utils";

type Props = { lang: Lang; path: string };

export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  if (src && !broken) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("h-7 w-7 shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary", className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Auth-dependent part of the header: My bookings / Admin links, sign in / out. */
export default function AuthNav({ lang, path }: Props) {
  const t = useTranslations(lang);
  const { state } = useAuth();
  const link = (href: string) => url(localePath(lang, href));
  const item = (active: boolean) =>
    cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors", active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground");

  if (state.status === "loading" || state.status === "unconfigured") return null;
  if (state.status === "signed-out") {
    return (
      <a href={link("/login")} className={item(path.startsWith("/login"))}>
        <LogIn className="h-4 w-4" />
        <span>{t("nav.login")}</span>
      </a>
    );
  }

  const name = displayName(state.profile ?? { full_name: null, email: state.session.user.email ?? "" });
  return (
    <>
      {isApproved(state) && (
        <a href={link("/my")} className={item(path.startsWith("/my"))} title={t("nav.my")}>
          <Ticket className="h-4 w-4" />
          <span className="hidden lg:inline">{t("nav.my")}</span>
        </a>
      )}
      {isAdmin(state) && (
        <a href={link("/admin")} className={item(path.startsWith("/admin"))} title={t("nav.admin")}>
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden lg:inline">{t("nav.admin")}</span>
        </a>
      )}
      {!isApproved(state) && (
        <a href={link("/pending")} className={item(path.startsWith("/pending"))}>
          {t("pending.title")}
        </a>
      )}
      <span className="ml-1 hidden items-center gap-2 sm:flex" title={name}>
        <Avatar src={state.profile?.avatar_url} name={name} />
      </span>
      <button type="button" onClick={() => signOut(lang)} className={item(false)} title={t("nav.logout")} aria-label={t("nav.logout")}>
        <LogOut className="h-4 w-4" />
      </button>
    </>
  );
}
