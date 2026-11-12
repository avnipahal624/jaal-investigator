import { useJaal } from "@/state/JaalProvider";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowLeft,
  Bot,
  ChevronRight,
  Command,
  Fingerprint,
  FileText,
  LayoutDashboard,
  Menu,
  Network,
  Radar,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Waypoints,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

const GROUPS = [
  {
    label: "Monitor",
    items: [
      { to: "/security", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/security/investigations", label: "Live investigations", icon: Activity },
    ],
  },
  {
    label: "Discover",
    items: [
      { to: "/security/apis", label: "API explorer", icon: Network },
      { to: "/security/graph", label: "Knowledge graph", icon: Waypoints },
      { to: "/security/deployments", label: "Deployments", icon: Rocket },
    ],
  },
  {
    label: "Respond",
    items: [
      { to: "/security/vulnerabilities", label: "Vulnerabilities", icon: ShieldAlert },
      { to: "/security/evidence", label: "Evidence vault", icon: Fingerprint },
      { to: "/security/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Control",
    items: [
      { to: "/security/agents", label: "Security agents", icon: Bot },
      { to: "/security/settings", label: "Safety & settings", icon: SlidersHorizontal },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useJaal();
  const bootstrap = useQuery(api.dast.bootstrap);
  const labName = bootstrap?.application?.name ?? "No lab initialized";
  const mode = bootstrap?.lab?.mode ?? "—";
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-[#1b2a3e] px-4">
        <div className="relative flex size-8 items-center justify-center border border-[#27C7B8]/45 bg-[#27C7B8]/10">
          <span className="font-mono text-[11px] font-bold text-[#27C7B8]">JA</span>
          <span className="absolute -right-1 -top-1 size-1.5 bg-[#F59E55]" />
        </div>
        <div>
          <p className="text-[13px] font-bold leading-none tracking-[0.24em] text-[#F3F6FC]">
            JAAL
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-[#5f7692]">
            Security Operations
          </p>
        </div>
      </div>

      <div className="border-b border-[#1b2a3e] px-3 py-3">
        <div className="border border-[#24364c] bg-[#0b1320] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#5f7692]">
              Active application
            </span>
            <span className="size-1.5 rounded-full bg-[#35C98A]" />
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-[#d9e3ef]">
            {labName}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="border border-[#B383F5]/35 bg-[#B383F5]/8 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-[#B383F5]">
              Synthetic lab
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#60788f]">
              {mode}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1.5 px-2 font-mono text-[8px] uppercase tracking-[0.22em] text-[#4e647b]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-2.5 border border-transparent px-2.5 py-2 text-[11px] transition-colors",
                      isActive
                        ? "border-[#27C7B8]/20 bg-[#27C7B8]/8 text-[#5de0d4]"
                        : "text-[#8ba0b6] hover:bg-[#121d2d] hover:text-[#d7e2ee]",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("size-3.5 shrink-0", isActive && "text-[#27C7B8]")} />
                      <span className="truncate">{item.label}</span>
                      {isActive && <span className="ml-auto size-1 bg-[#27C7B8]" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#1b2a3e] p-3">
        <div className="mb-2 flex items-center gap-2 border border-[#1e3145] bg-[#0b1320] px-2.5 py-2">
          <ShieldCheck className="size-3.5 text-[#35C98A]" />
          <div className="min-w-0">
            <p className="truncate text-[10px] text-[#c7d3e2]">
              {state.user?.name ?? "Security operator"}
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#5f7692]">
              Authenticated · owner-scoped
            </p>
          </div>
        </div>
        <a
          href="/dashboard"
          className="flex items-center gap-1.5 px-1 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#5f7692] transition-colors hover:text-[#27C7B8]"
        >
          <ArrowLeft className="size-3" /> Forensic console
        </a>
      </div>
    </div>
  );
}

export function SecurityShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const bootstrap = useQuery(api.dast.bootstrap);
  const title = (() => {
    if (location.pathname.startsWith("/security/investigations")) return "Live investigations";
    if (location.pathname.startsWith("/security/apis")) return "API explorer";
    if (location.pathname.startsWith("/security/graph")) return "Knowledge graph";
    if (location.pathname.startsWith("/security/agents")) return "Security agents";
    if (location.pathname.startsWith("/security/vulnerabilities")) return "Vulnerability center";
    if (location.pathname.startsWith("/security/deployments")) return "Deployment intelligence";
    if (location.pathname.startsWith("/security/evidence")) return "Evidence vault";
    if (location.pathname.startsWith("/security/reports")) return "Report center";
    if (location.pathname.startsWith("/security/settings")) return "Safety & settings";
    return "Security overview";
  })();

  return (
    <div className="security-grid min-h-screen bg-[#080D18] text-[#F3F6FC]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] border-r border-[#1b2a3e] bg-[#0a101b] lg:block">
        <SidebarBody />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="relative h-full w-[260px] border-r border-[#1b2a3e] bg-[#0a101b]">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 text-[#91A3BB]"
            >
              <X className="size-4" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#1b2a3e] bg-[#080D18]/92 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
              className="text-[#91A3BB] lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            <div className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#4f667d] sm:flex">
              <Command className="size-3" />
              JAAL / SECURITY
              <ChevronRight className="size-3" />
            </div>
            <span className="truncate text-[12px] font-medium text-[#c7d3e2]">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 border border-[#35C98A]/30 bg-[#35C98A]/8 px-2 py-1 md:flex">
              <span className="size-1.5 rounded-full bg-[#35C98A]" />
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#35C98A]">
                {bootstrap?.policy?.emergencyStop ? "Emergency stop" : "Scope enforced"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border border-[#24364c] bg-[#0e1725] px-2 py-1">
              <Radar className="size-3 text-[#27C7B8]" />
              <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7890a8]">
                {bootstrap?.lab?.mode ?? "No lab"}
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1540px] px-3 py-5 sm:px-5 lg:px-6">
          <Outlet />
        </main>
        <footer className="security-no-print mx-auto flex w-full max-w-[1540px] flex-col gap-1 border-t border-[#162436] px-5 py-4 font-mono text-[8px] uppercase tracking-[0.14em] text-[#465d74] sm:flex-row sm:items-center sm:justify-between">
          <span>JAAL Agentic DAST · every deploy, every endpoint, every vulnerability investigated</span>
          <span>Authorized synthetic lab · no external targets</span>
        </footer>
      </div>
    </div>
  );
}
