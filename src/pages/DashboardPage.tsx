import { ActivityFeed, useAllActivities } from "@/components/dashboard/ActivityFeed";
import { InvestigationCard } from "@/components/dashboard/InvestigationCard";
import { Chip, Panel, STAGE_STATUS_STYLE } from "@/components/ui/panel";
import { useJaal } from "@/state/JaalProvider";
import { STAGE_LABELS } from "@/services/investigationService";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/utils/formatters";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Fingerprint,
  FolderKanban,
  Plus,
  Search,
  Terminal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

const FEED_KINDS = new Set([
  "case_started",
  "tactic_detected",
  "identifier_extracted",
  "hash_generated",
  "stage_advanced",
  "report_created",
  "integrity_verified",
  "integrity_mismatch",
]);

export default function DashboardPage() {
  const { state } = useJaal();
  const activities = useAllActivities();
  const [query, setQuery] = useState("");
  const [commandStamp] = useState(() => Date.now());

  // Most relevant active case: prefer a live simulation, else newest active.
  const activeCase = useMemo(() => {
    const actives = state.investigations.filter((i) => i.status === "active");
    const live = actives
      .filter((i) => state.sessions[i.id]?.status === "running")
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return (
      live[0] ??
      [...actives].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0] ??
      null
    );
  }, [state.investigations, state.sessions]);

  const cases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.investigations
      .filter(
        (i) =>
          !q ||
          i.id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      )
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }, [state.investigations, query]);

  const feed = useMemo(
    () => activities.filter((a) => FEED_KINDS.has(a.kind)),
    [activities],
  );

  const activeRuntime = activeCase ? state.sessions[activeCase.id] : null;
  const activeStage =
    activeRuntime?.stages.find((s) => s.status === "active") ?? null;

  return (
    <div className="jaal-scanlines relative mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6">
      {/* Command header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="metal-surface jaal-hud relative mb-5 flex flex-col gap-4 overflow-hidden rounded-md p-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <p className="jaal-label !text-jcyan">
            JAAL / COMMAND · {formatDateTime(commandStamp)}
          </p>
          <h1 className="metal-text mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Investigation launchpad
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-72">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-jmuted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search investigations…"
              className="h-9 w-full rounded-sm border border-white/10 bg-[#04101f]/70 pl-8 pr-3 font-mono text-xs text-jtext shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)] placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:outline-none"
            />
          </div>
          <Link
            to="/investigations/new"
            className="metal-button flex h-9 items-center gap-1.5 rounded-sm px-4 font-mono text-[10px] uppercase tracking-wider"
          >
            <Plus className="size-3.5" /> Start investigation
          </Link>
        </div>
      </motion.header>

      {/* Current activity */}
      {activeCase ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4"
        >
          <Panel
            label={
              <div className="flex items-center gap-2">
                <span className="size-1.5 bg-jcyan jaal-pulse" />
                <p className="jaal-label !text-jcyan">Current activity</p>
              </div>
            }
            right={
              <Chip
                tone={
                  activeRuntime?.status === "running"
                    ? "border-jcyan/50 bg-jcyan/10 text-jcyan"
                    : "border-jamber/50 bg-jamber/10 text-jamber"
                }
                pulse={activeRuntime?.status === "running"}
              >
                {activeRuntime?.status ?? "active"}
              </Chip>
            }
            bodyClassName="p-4"
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs tracking-wider text-jcyan">
                    {activeCase.id}
                  </span>
                  <span className="border border-jborder/60 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-jmuted">
                    {activeCase.category}
                  </span>
                </div>
                <h2 className="mt-1 truncate text-base font-semibold text-jtext">
                  {activeCase.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-jmuted">
                  <span>
                    stage ·{" "}
                    <span className="text-jamber">
                      {activeStage
                        ? activeStage.label
                        : STAGE_LABELS[activeCase.currentStage]}
                    </span>
                    {activeStage && (
                      <Chip
                        style={STAGE_STATUS_STYLE[activeStage.status]}
                        className="ml-1.5 !px-1.5 !text-[8px]"
                      >
                        {activeStage.status}
                      </Chip>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Fingerprint className="size-3 text-jcyan" />
                    {activeRuntime?.evidence.length ?? 0} evidence
                  </span>
                  <span>last activity {relativeTime(activeCase.lastActivityAt)}</span>
                </div>
              </div>
              <Link
                to={`/investigations/${activeCase.id}`}
                className="metal-button group flex items-center gap-2 rounded-sm px-4 py-2 font-mono text-[11px] uppercase tracking-wider"
              >
                Resume investigation
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Panel>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="metal-card jaal-grid relative mb-4 rounded-md px-6 py-14 text-center"
        >
          <div className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l border-t border-jcyan/50" />
          <div className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b border-r border-jcyan/50" />
          <Terminal className="mx-auto size-6 text-jcyan/70" />
          <h2 className="mt-4 font-mono text-xl font-semibold uppercase tracking-[0.3em] text-jtext">
            No active investigation
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-jmuted">
            Start a controlled investigation to analyze scam behavior and
            extract evidence.
          </p>
          <Link
            to="/investigations/new"
            className="metal-button mt-6 inline-flex items-center gap-2 rounded-sm px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider"
          >
            <Plus className="size-4" /> Start investigation
          </Link>
        </motion.div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Investigations */}
        <Panel
          label={
            <div className="flex items-center gap-2">
              <FolderKanban className="size-3.5 text-jteal" />
              <p className="jaal-label">Investigations</p>
              <Chip tone="border-jborder/70 bg-jsurface text-jmuted">
                {cases.length}
              </Chip>
            </div>
          }
          right={
            <Link
              to="/investigations"
              className="font-mono text-[9px] uppercase tracking-wider text-jcyan hover:text-jtext"
            >
              view all →
            </Link>
          }
          bodyClassName="p-3"
          className="lg:col-span-3"
        >
          {cases.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderKanban className="size-6 text-jmuted/60" />
              <p className="text-sm text-jmuted">No investigations match.</p>
              <Link
                to="/investigations/new"
                className="border border-jcyan/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/10"
              >
                Start one now
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {cases.slice(0, 6).map((inv) => (
                <InvestigationCard
                  key={inv.id}
                  investigation={inv}
                  evidenceCount={state.sessions[inv.id]?.evidence.length ?? 0}
                  stageId={
                    state.sessions[inv.id]?.stages.find((s) => s.status === "active")
                      ?.id ?? inv.currentStage
                  }
                />
              ))}
            </div>
          )}
        </Panel>

        {/* Recent activity */}
        <Panel
          label={
            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-jamber" />
              <p className="jaal-label">Recent activity</p>
            </div>
          }
          className="lg:col-span-2"
          bodyClassName="max-h-[520px] overflow-y-auto"
        >
          <ActivityFeed
            entries={feed}
            limit={12}
            emptyText="No activity yet. Start a simulation to generate events."
          />
        </Panel>
      </div>

      <p className={cn("mt-4 font-mono text-[9px] uppercase tracking-widest text-jmuted/60")}>
        simulation mode · synthetic data only · no real scammers contacted
      </p>
    </div>
  );
}
