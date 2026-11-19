import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useJaal } from "@/state/JaalProvider";
import { STAGE_LABELS } from "@/services/investigationService";
import { cn } from "@/lib/utils";
import { formatClock, relativeTime } from "@/utils/formatters";
import {
  Activity,
  ChevronRight,
  LogOut,
  Menu,
  Radio,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { NotificationCenter } from "./NotificationCenter";

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const now = useClock();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, signOutDemo } = useJaal();
  const { user: authUser, isAuthenticated, signOut } = useAuth();

  const caseMatch = location.pathname.match(/^\/investigations\/(JAAL-\d+)/);
  const activeCase = caseMatch
    ? state.investigations.find((i) => i.id === caseMatch[1])
    : null;
  const runtime = caseMatch ? state.sessions[caseMatch[1]] : null;

  const pageTitle = useMemo(() => {
    if (activeCase) return activeCase.title;
    if (location.pathname.startsWith("/investigations/new")) return "New investigation";
    if (location.pathname.startsWith("/investigations")) return "Investigations";
    if (location.pathname.startsWith("/evidence")) return "Evidence Locker";
    if (location.pathname.startsWith("/reports")) return "Reports";
    if (location.pathname.startsWith("/settings")) return "Settings";
    return "Command dashboard";
  }, [location.pathname, activeCase]);

  const backend = state.backendStatus;
  const backendOnline = backend === "online";

  const handleSignOut = async () => {
    try {
      if (isAuthenticated) await signOut();
    } catch {
      /* Convex session may not exist */
    }
    signOutDemo();
    navigate("/");
  };

  const displayName =
    state.user?.name ?? authUser?.name ?? authUser?.email ?? "Operator";

  return (
    <header className="metal-topbar jaal-no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMenu}
        className="flex size-8 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jcyan/50 hover:text-jcyan lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 sm:block">
          <p className="jaal-label">Active view</p>
          <p className="truncate text-sm font-semibold leading-tight text-jtext">
            {pageTitle}
          </p>
        </div>
        {/* Persistent, never-hide disclosure: everything here is simulated. */}
        <span
          title="Simulated interactions only. JAAL does not autonomously contact real scammers, phone numbers, WhatsApp accounts or payment accounts, and never sends real money or collects real credentials."
          className="flex shrink-0 items-center gap-1.5 border border-jamber/50 bg-jamber/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-jamber"
        >
          <span className="size-1.5 shrink-0 bg-jamber jaal-pulse" />
          Simulation mode
        </span>
        {activeCase && (
          <div className="flex min-w-0 items-center gap-2 border border-jamber/40 bg-jamber/10 px-2 py-1">
            <span className="size-1.5 shrink-0 bg-jamber jaal-pulse" />
            <span className="font-mono text-[11px] text-jamber">
              {activeCase.id}
            </span>
            <ChevronRight className="size-3 hidden text-jmuted sm:block" />
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-jmuted md:inline">
              {STAGE_LABELS[
                runtime?.stages.find((s) => s.status === "active")?.id ??
                  activeCase.currentStage
              ] ?? activeCase.currentStage}
            </span>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Backend / simulation status */}
        <div
          title={
            backendOnline
              ? "Backend API reachable"
              : "Backend unavailable — running on the local simulation engine"
          }
          className="hidden items-center gap-2 border border-jborder/70 bg-jsurface px-2.5 py-1.5 md:flex"
        >
          <span
            className={cn(
              "size-1.5",
              backend === "checking"
                ? "bg-jamber jaal-pulse"
                : backendOnline
                  ? "bg-jgreen"
                  : "bg-jcyan jaal-pulse",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-jmuted">
            {backend === "checking"
              ? "probing api"
              : backendOnline
                ? "api online"
                : "local sim"}
          </span>
        </div>

        {/* Simulation mode */}
        <div className="flex items-center gap-2 border border-jcyan/40 bg-jcyan/10 px-2.5 py-1.5">
          <Radio className="size-3.5 text-jcyan" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-jcyan">
            Simulation
          </span>
        </div>

        {/* Clock */}
        <div className="hidden font-mono text-xs text-jmuted xl:block">
          <span className="text-jtext">{formatClock(now)}</span>
          <span className="ml-2 text-jmuted/70">{relativeTime(now)}</span>
        </div>

        <NotificationCenter />

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 border border-jborder/70 bg-jsurface px-2 py-1.5 transition-colors hover:border-jcyan/50"
            >
              <span className="flex size-5 items-center justify-center bg-jcyan/15 font-mono text-[10px] font-bold text-jcyan">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-28 truncate text-xs text-jtext md:inline">
                {displayName}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-jborder/80 bg-popover">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-semibold text-jtext">
                {displayName}
              </p>
              <p className="truncate font-mono text-[10px] font-normal text-jmuted">
                {state.user?.email ?? authUser?.email ?? "local session"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-jcyan">
                <Activity className="size-3" /> Simulation session
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-jborder/70" />
            <DropdownMenuItem
              className="gap-2 text-jmuted focus:bg-accent focus:text-jcyan"
              onClick={() => navigate("/settings")}
            >
              <SettingsIcon className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-jmuted focus:bg-accent focus:text-jcyan"
              onClick={() => navigate("/dashboard")}
            >
              <UserRound className="size-4" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-jborder/70" />
            <DropdownMenuItem
              className="gap-2 text-jred focus:bg-jred/10 focus:text-jred"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
