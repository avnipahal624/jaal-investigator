import { cn } from "@/lib/utils";
import { useJaal } from "@/state/JaalProvider";
import {
  FileText,
  Fingerprint,
  FolderKanban,
  LayoutDashboard,
  Mic,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation } from "react-router";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/investigations", label: "Investigations", icon: FolderKanban },
  { to: "/evidence", label: "Evidence Locker", icon: Fingerprint },
  { to: "/voice-intake", label: "Voice Intake", icon: Mic },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function SidebarBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="relative flex size-9 shrink-0 items-center justify-center border border-jcyan/50 bg-jcyan/10">
        <span className="font-mono text-sm font-semibold text-jcyan">JA</span>
        <span className="absolute -right-1 -top-1 size-1.5 bg-jamber jaal-pulse" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-none tracking-[0.3em] text-jtext">
            JAAL
          </p>
          <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-jmuted">
            Forensics Console
          </p>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const { state } = useJaal();
  const activeCase = location.pathname.match(/^\/investigations\/(JAAL-\d+)/);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4">
      <SidebarBrand compact={collapsed} />

      <NavLink
        to="/investigations/new"
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-2 border border-jcyan/40 bg-jcyan/10 px-3 py-2.5 text-sm font-medium text-jcyan transition-colors hover:bg-jcyan/20",
          collapsed && "justify-center px-0",
        )}
      >
        <Plus className="size-4 shrink-0" />
        {!collapsed && <span>New investigation</span>}
      </NavLink>

      <nav className="flex flex-col gap-1">
        {!collapsed && (
          <p className="jaal-label mb-1 px-2">Case navigation</p>
        )}
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent text-jcyan"
                  : "text-jmuted hover:bg-accent/50 hover:text-jtext",
                collapsed && "justify-center px-0",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 top-0 h-full w-0.5 transition-colors",
                    isActive ? "bg-jcyan" : "bg-transparent",
                  )}
                />
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {activeCase && !collapsed && (
        <div className="jaal-panel relative p-3">
          <p className="jaal-label mb-2">Active case</p>
          <p className="font-mono text-xs text-jcyan">{activeCase[1]}</p>
          <p className="mt-1 truncate text-[11px] text-jmuted">
            {state.investigations.find((i) => i.id === activeCase[1])?.title ??
              "—"}
          </p>
        </div>
      )}

      <div className={cn("mt-auto space-y-2", collapsed && "mt-4")}>
        {!collapsed && (
          <div className="border border-jborder/60 bg-jsurface/80 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-jgreen" />
              <p className="jaal-label !tracking-[0.14em] !text-jgreen">
                Simulation mode
              </p>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-jmuted">
              Synthetic conversations only. No real scammers or third parties
              are ever contacted.
            </p>
          </div>
        )}
        <p
          className={cn(
            "px-1 font-mono text-[9px] uppercase tracking-widest text-jmuted/60",
            collapsed && "hidden",
          )}
        >
          v1.0 · local demo
        </p>
      </div>
    </div>
  );
}
