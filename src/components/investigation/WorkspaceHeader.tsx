import { Chip, RUN_STATUS_STYLE, STAGE_STATUS_STYLE } from "@/components/ui/panel";
import { isAiEngine, statusStyle } from "@/theme/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGE_LABELS } from "@/services/investigationService";
import type { CaseRuntime, Investigation } from "@/types/investigation";
import { formatElapsed } from "@/utils/formatters";
import { motion } from "framer-motion";
import {
  FileSignature,
  Fingerprint,
  Flag,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

function useElapsed(startedAt: number, endedAt: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running && endedAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running, endedAt]);
  return formatElapsed((endedAt ?? now) - startedAt);
}

/**
 * Investigation header — left: case identity, center: live stage/elapsed/
 * evidence, right: pause, end and more options, with a thin kill-chain
 * progress line beneath.
 */
export function WorkspaceHeader({
  investigation,
  runtime,
  onPause,
  onEnd,
  onReset,
  onReport,
  onOpenEvidence,
}: {
  investigation: Investigation;
  runtime: CaseRuntime;
  onPause: () => void;
  onEnd: () => void;
  onReset: () => void;
  onReport: () => void;
  /** Tablet only — opens the evidence locker sheet. */
  onOpenEvidence?: () => void;
}) {
  const status = runtime.status;
  const elapsed = useElapsed(runtime.startedAt, runtime.endedAt, status === "running");
  const activeStage = runtime.stages.find((s) => s.status === "active");
  const detected = runtime.stages.filter((s) => s.status !== "pending").length;
  const progress = (detected / runtime.stages.length) * 100;

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="jaal-no-print shrink-0 border-b border-jborder/70 bg-jsurface/80"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2.5">
        {/* Left — case identity */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center border border-jamber/50 bg-jamber/10">
            <Flag className="size-4 text-jamber" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] tracking-wider text-jcyan">
                {investigation.id}
              </span>
              <span className="border border-jborder/60 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-jmuted">
                {investigation.category}
              </span>
              {isAiEngine(runtime.strategy?.source) ? (
                <span
                  className="flex items-center gap-1 border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider"
                  style={statusStyle("engine", "claude")}
                >
                  <Radio className="size-2.5" /> groq / live ai
                </span>
              ) : (
                <span
                  className="flex items-center gap-1 border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider"
                  style={statusStyle("engine", "simulation")}
                >
                  <Radio className="size-2.5" /> simulation
                </span>
              )}
              <Chip style={RUN_STATUS_STYLE[status]} pulse={status === "running"}>
                {status === "running" ? "live" : status}
              </Chip>
            </div>
            <h1 className="mt-0.5 truncate text-sm font-semibold text-jtext sm:text-base">
              {investigation.title}
            </h1>
          </div>
        </div>

        {/* Center — live status */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-widest text-jmuted">
          <span className="flex items-center gap-1.5">
            stage
            <span className={activeStage ? "text-jamber" : "text-jmuted"}>
              {activeStage ? activeStage.label : STAGE_LABELS[investigation.currentStage]}
            </span>
            {activeStage && (
              <Chip
                style={STAGE_STATUS_STYLE[activeStage.status]}
                className="!px-1.5 !text-[8px]"
              >
                {activeStage.status}
              </Chip>
            )}
          </span>
          <span>
            elapsed <span className="text-jtext">{elapsed}</span>
          </span>
          <span>
            evidence{" "}
            <span className="text-jcyan">
              {String(runtime.evidence.length).padStart(2, "0")}
            </span>
          </span>
        </div>

        {/* Right — controls */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {onOpenEvidence && (
            <Button
              size="sm"
              onClick={onOpenEvidence}
              className="h-7 cursor-pointer gap-1.5 border border-jcyan/50 bg-jcyan/10 px-2.5 font-mono text-[10px] uppercase tracking-wider text-jcyan hover:bg-jcyan/20 hover:text-jcyan xl:hidden"
            >
              <Fingerprint className="size-3" /> Evidence
            </Button>
          )}
          <Button
            size="sm"
            onClick={onPause}
            disabled={status === "completed"}
            title={status === "paused" ? "Resume simulation" : "Pause simulation"}
            className="h-7 cursor-pointer gap-1.5 border border-jamber/50 bg-jamber/10 px-2.5 font-mono text-[10px] uppercase tracking-wider text-jamber hover:bg-jamber/20 hover:text-jamber disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "paused" ? <Play className="size-3" /> : <Pause className="size-3" />}
            {status === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            onClick={onEnd}
            disabled={status === "completed"}
            className="h-7 cursor-pointer gap-1.5 border border-jred/50 bg-jred/10 px-2.5 font-mono text-[10px] uppercase tracking-wider text-jred hover:bg-jred/20 hover:text-jred disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="size-3" /> End investigation
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More options"
                className="flex size-7 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jcyan/60 hover:text-jcyan"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-jborder/80 bg-popover">
              <DropdownMenuItem
                className="gap-2 text-jmuted focus:bg-accent focus:text-jcyan"
                onClick={onReport}
              >
                <FileSignature className="size-4" /> Generate report
              </DropdownMenuItem>
              {status === "completed" && (
                <DropdownMenuItem asChild className="gap-2 text-jmuted focus:bg-accent focus:text-jcyan">
                  <Link to={`/investigations/${investigation.id}/complete`}>
                    <Flag className="size-4" /> Completion screen
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="gap-2 text-jmuted focus:bg-accent focus:text-jcyan">
                <Link to={`/evidence?case=${investigation.id}`}>
                  <Flag className="size-4" /> Open evidence locker
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-jborder/70" />
              <DropdownMenuItem
                className="gap-2 text-jred focus:bg-jred/10 focus:text-jred"
                onClick={onReset}
              >
                <RotateCcw className="size-4" /> Reset simulation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thin kill-chain progress line */}
      <div className="h-0.5 w-full bg-jsurface">
        <motion.div
          className="h-full bg-gradient-to-r from-jteal via-jcyan to-jamber"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </motion.header>
  );
}
