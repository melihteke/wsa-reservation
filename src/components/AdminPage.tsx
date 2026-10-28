import * as React from "react";
import { BarChart3, Settings, Users } from "lucide-react";
import Gate from "@/components/Gate";
import AdminMembers from "@/components/admin/AdminMembers";
import AdminStats from "@/components/admin/AdminStats";
import AdminSettings from "@/components/admin/AdminSettings";
import { useTranslations, type Lang } from "@/i18n/ui";
import { cn } from "@/lib/utils";

type Tab = "members" | "stats" | "settings";

function tabFromHash(): Tab {
  const hash = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return hash === "stats" || hash === "settings" ? hash : "members";
}

export default function AdminPage({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const [tab, setTab] = React.useState<Tab>(() => tabFromHash());
  React.useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const choose = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  };
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "members", label: t("admin.tabMembers"), icon: <Users className="h-4 w-4" /> },
    { id: "stats", label: t("admin.tabStats"), icon: <BarChart3 className="h-4 w-4" /> },
    { id: "settings", label: t("admin.tabSettings"), icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <Gate lang={lang} admin>
      {({ profile }) => (
        <div className="space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight">{t("admin.title")}</h1>
          <div role="tablist" aria-label={t("admin.title")} className="inline-flex gap-1 rounded-xl bg-muted/70 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={tab === item.id}
                onClick={() => choose(item.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
                  tab === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "members" && <AdminMembers lang={lang} me={profile} />}
            {tab === "stats" && <AdminStats lang={lang} />}
            {tab === "settings" && <AdminSettings lang={lang} />}
          </div>
        </div>
      )}
    </Gate>
  );
}
