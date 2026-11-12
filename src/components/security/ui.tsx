import { cn } from "@/lib/utils";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
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
        "border border-[#24344F] bg-[#152238]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
    >
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-[#24344F] px-4 py-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#7E93A8]">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-0.5 truncate text-[13px] font-semibold tracking-tight text-[#E5EDF5]">
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
    default: "text-[#E5EDF5]",
    teal: "text-[#2DD4BF]",
    critical: "text-[#F87171]",
    high: "text-[#F5B942]",
    success: "text-[#34D399]",
    muted: "text-[#9FB3C8]",
  }[tone];
  return (
    <div className="relative border border-[#24344F] bg-[#152238] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-[#7E93A8]">
          {label}
        </p>
        {icon && <span className="text-[#6B8199]">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-[#7E93A8]">{hint}</p>}
      <span className="absolute bottom-0 left-0 h-px w-8 bg-[#2DD4BF]/50" />
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
    neutral: "border-[#2A3B55] bg-[#1B2C45] text-[#9FB3C8]",
    teal: "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]",
    critical: "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]",
    high: "border-[#F5B942]/40 bg-[#F5B942]/10 text-[#F5B942]",
    medium: "border-[#F5B942]/40 bg-[#F5B942]/10 text-[#F5B942]",
    low: "border-[#9FB3C8]/40 bg-[#9FB3C8]/10 text-[#9FB3C8]",
    success: "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]",
    violet: "border-[#F5B942]/40 bg-[#F5B942]/10 text-[#F5B942]",
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
      ? "text-[#9FB3C8] border-[#9FB3C8]/40 bg-[#9FB3C8]/10"
      : method === "POST"
        ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/10"
        : "text-[#F5B942] border-[#F5B942]/40 bg-[#F5B942]/10";
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
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7E93A8]">
        {label}
      </dt>
      <dd className="mt-1 text-[12px] leading-relaxed text-[#C7D5E5]">{children}</dd>
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
    <header className="mb-5 flex flex-col gap-4 border-b border-[#24344F] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#2DD4BF]">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#E5EDF5]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[#9FB3C8]">
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
      "border-[#2DD4BF]/50 bg-[#2DD4BF]/12 text-[#5EEAD4] hover:bg-[#2DD4BF]/20",
    ghost:
      "border-[#2A3B55] bg-transparent text-[#9FB3C8] hover:border-[#3b5472] hover:text-[#E5EDF5]",
    danger:
      "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171] hover:bg-[#F87171]/20",
    subtle:
      "border-transparent bg-[#1B2C45] text-[#C7D5E5] hover:bg-[#1d2b41]",
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
    <div className="flex min-h-[280px] flex-col items-center justify-center border border-dashed border-[#2A3B55] bg-[#0F1B2D]/60 px-6 py-12 text-center">
      <div className="mb-4 flex size-11 items-center justify-center border border-[#2DD4BF]/30 bg-[#2DD4BF]/8 text-[#2DD4BF]">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[#E5EDF5]">{title}</h3>
      <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[#9FB3C8]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity as DastSeverity] ?? "#9FB3C8";
  return <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />;
}

export function LoadingState({
  label = "Loading security data",
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-2.5">
      <div className="h-3 w-40 animate-pulse bg-[#24344F]" />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: Math.min(4, rows) }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse border border-[#24344F] bg-[#152238]" />
        ))}
      </div>
      <div className="space-y-2 border border-[#24344F] bg-[#152238] p-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-9 animate-pulse border border-[#1B2C45] bg-[#0F1B2D]" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Security data could not be loaded",
  body,
  action,
}: {
  title?: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[220px] flex-col items-center justify-center border border-[#F87171]/40 bg-[#F87171]/5 px-6 py-10 text-center"
    >
      <h3 className="text-sm font-semibold text-[#E5EDF5]">{title}</h3>
      <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-[#9FB3C8]">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  total: number;
  pageSize: number;
}) {
  if (total <= pageSize) return null;
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-2 border-t border-[#24344F] px-3 py-2.5 sm:flex-row"
    >
      <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
        {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="h-7 border border-[#2A3B55] px-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#9FB3C8] disabled:opacity-35"
        >
          Previous
        </button>
        <span className="px-1 font-mono text-[8px] text-[#7E93A8]">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          className="h-7 border border-[#2A3B55] px-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#9FB3C8] disabled:opacity-35"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-[#050b14]/80 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 border border-[#2A3B55] bg-[#152238] p-5 shadow-2xl focus:outline-none">
          <AlertDialog.Title className="text-[15px] font-semibold tracking-tight text-[#E5EDF5]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[11px] leading-relaxed text-[#9FB3C8]">
            {description}
          </AlertDialog.Description>
          {details && (
            <div className="mt-3 border border-[#2A3B55] bg-[#0F1B2D] px-3 py-2.5 text-[10px] leading-relaxed text-[#C7D5E5]">
              {details}
            </div>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={busy}
                className="inline-flex h-8 items-center justify-center border border-[#2A3B55] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9FB3C8] transition-colors hover:text-[#E5EDF5] disabled:opacity-40"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className={cn(
                  "inline-flex h-8 items-center justify-center border px-3 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40",
                  tone === "danger"
                    ? "border-[#F87171]/45 bg-[#F87171]/12 text-[#F87171] hover:bg-[#F87171]/20"
                    : "border-[#2DD4BF]/50 bg-[#2DD4BF]/12 text-[#5EEAD4] hover:bg-[#2DD4BF]/20",
                )}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
