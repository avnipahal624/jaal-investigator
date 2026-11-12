import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  CLASSIFICATION_META,
  FINDING_STATUS_META,
  SEVERITY_COLOR,
  type DastClassification,
  type DastSeverity,
} from "@/types/dast";

export function Panel({
  children,
  className,
  title,
  eyebrow,
  action,
  flush,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "border border-[#1b2a3e] bg-[#101827]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
    >
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-[#1b2a3e] px-4 py-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#5f7692]">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-0.5 truncate text-[13px] font-semibold tracking-tight text-[#F3F6FC]">
                {title}
              </h2>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "teal" | "critical" | "high" | "success" | "muted";
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-[#F3F6FC]",
    teal: "text-[#27C7B8]",
    critical: "text-[#F05D67]",
    high: "text-[#F59E55]",
    success: "text-[#35C98A]",
    muted: "text-[#91A3BB]",
  }[tone];
  return (
    <div className="relative border border-[#1b2a3e] bg-[#101827] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-[#6f849c]">
          {label}
        </p>
        {icon && <span className="text-[#486077]">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-[#6f849c]">{hint}</p>}
      <span className="absolute bottom-0 left-0 h-px w-8 bg-[#27C7B8]/50" />
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: "neutral" | "teal" | "critical" | "high" | "medium" | "low" | "success" | "violet";
  className?: string;
  dot?: boolean;
}) {
  const map = {
    neutral: "border-[#2a3b52] bg-[#172235] text-[#91A3BB]",
    teal: "border-[#27C7B8]/40 bg-[#27C7B8]/10 text-[#27C7B8]",
    critical: "border-[#F05D67]/40 bg-[#F05D67]/10 text-[#F05D67]",
    high: "border-[#F59E55]/40 bg-[#F59E55]/10 text-[#F59E55]",
    medium: "border-[#F5C96A]/40 bg-[#F5C96A]/10 text-[#F5C96A]",
    low: "border-[#64B5F6]/40 bg-[#64B5F6]/10 text-[#64B5F6]",
    success: "border-[#35C98A]/40 bg-[#35C98A]/10 text-[#35C98A]",
    violet: "border-[#B383F5]/40 bg-[#B383F5]/10 text-[#B383F5]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.09em]",
        map,
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "CRITICAL"
      ? "critical"
      : severity === "HIGH"
        ? "high"
        : severity === "MEDIUM"
          ? "medium"
          : severity === "LOW"
            ? "low"
            : "neutral";
  return <Chip tone={tone}>{severity}</Chip>;
}

export function ClassificationBadge({ value }: { value: string }) {
  const meta = CLASSIFICATION_META[value as DastClassification] ?? CLASSIFICATION_META.UNKNOWN;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em]"
      style={{ color: meta.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function FindingStatusBadge({ status }: { status: string }) {
  const meta =
    FINDING_STATUS_META[status as keyof typeof FINDING_STATUS_META] ??
    FINDING_STATUS_META.INCONCLUSIVE;
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]"
      style={{
        color: meta.color,
        borderColor: `${meta.color}55`,
        backgroundColor: `${meta.color}12`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const tone =
    method === "GET"
      ? "text-[#64B5F6] border-[#64B5F6]/40 bg-[#64B5F6]/10"
      : method === "POST"
        ? "text-[#35C98A] border-[#35C98A]/40 bg-[#35C98A]/10"
        : "text-[#F59E55] border-[#F59E55]/40 bg-[#F59E55]/10";
  return (
    <span
      className={cn(
        "inline-flex min-w-11 justify-center border px-1.5 py-0.5 font-mono text-[9px] font-semibold",
        tone,
      )}
    >
      {method}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#60788f]">
        {label}
      </dt>
      <dd className="mt-1 text-[12px] leading-relaxed text-[#c7d3e2]">{children}</dd>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-4 border-b border-[#1b2a3e] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#27C7B8]">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#F3F6FC]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[#91A3BB]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  title,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary:
      "border-[#27C7B8]/50 bg-[#27C7B8]/12 text-[#5de0d4] hover:bg-[#27C7B8]/20",
    ghost:
      "border-[#2a3b52] bg-transparent text-[#91A3BB] hover:border-[#3b5472] hover:text-[#F3F6FC]",
    danger:
      "border-[#F05D67]/40 bg-[#F05D67]/10 text-[#F05D67] hover:bg-[#F05D67]/20",
    subtle:
      "border-transparent bg-[#172235] text-[#c7d3e2] hover:bg-[#1d2b41]",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 border px-3 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center border border-dashed border-[#26384f] bg-[#0c1421]/60 px-6 py-12 text-center">
      <div className="mb-4 flex size-11 items-center justify-center border border-[#27C7B8]/30 bg-[#27C7B8]/8 text-[#27C7B8]">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[#F3F6FC]">{title}</h3>
      <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[#7890a8]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity as DastSeverity] ?? "#91A3BB";
  return <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />;
}
