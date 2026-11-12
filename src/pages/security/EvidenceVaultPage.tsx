import {
  ActionButton,
  Chip,
  EmptyState,
  PageHeader,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { sha256Hex } from "@/utils/hash";
import { formatTimestamp, relativeTime } from "@/types/dast";
import { useQuery } from "convex/react";
import {
  CheckCircle2,
  Download,
  Fingerprint,
  LockKeyhole,
  Search,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function EvidenceVaultPage() {
  const evidence = useQuery(api.dast.evidence);
  const findings = useQuery(api.dast.findings);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [checks, setChecks] = useState<Record<string, "checking" | "match" | "mismatch">>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const findingLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const finding of findings ?? []) {
      map.set(finding._id, `${finding.findingId} · ${finding.title}`);
    }
    return map;
  }, [findings]);

  const types = useMemo(
    () => Array.from(new Set((evidence ?? []).map((row) => row.type))).sort(),
    [evidence],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (evidence ?? []).filter((row) => {
      if (type !== "ALL" && row.type !== type) return false;
      if (
        term &&
        !`${row.label} ${row.sha256} ${row.type} ${row.findingId ? findingLabels.get(row.findingId) ?? "" : ""}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [evidence, type, query, findingLabels]);

  async function verify(id: string, content: string, sha256: string) {
    setChecks((current) => ({ ...current, [id]: "checking" }));
    try {
      const recomputed = await sha256Hex(content);
      const match = recomputed === sha256;
      setChecks((current) => ({ ...current, [id]: match ? "match" : "mismatch" }));
      toast[match ? "success" : "error"](
        match ? "Evidence matches its recorded SHA-256" : "Hash mismatch — evidence may be altered",
      );
    } catch {
      setChecks((current) => ({ ...current, [id]: "mismatch" }));
      toast.error("Could not compute SHA-256");
    }
  }

  function downloadManifest() {
    const manifest = (evidence ?? []).map((row) => ({
      id: row._id,
      type: row.type,
      label: row.label,
      sha256: row.sha256,
      algorithm: row.algorithm,
      findingId: row.findingId ?? null,
      investigationId: row.investigationId ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), artifacts: manifest }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "jaal-evidence-manifest.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="RESPOND / CHAIN OF CUSTODY"
        title="Evidence vault"
        description="Sanitized HTTP exchanges and retest artifacts, each sealed with SHA-256. Verify a hash directly in the browser; a mismatch is shown honestly."
        actions={
          <ActionButton variant="ghost" onClick={downloadManifest} disabled={!evidence?.length}>
            <Download className="size-3" /> Evidence manifest
          </ActionButton>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Artifacts" value={evidence?.length ?? 0} />
        <Stat
          label="HTTP exchanges"
          value={(evidence ?? []).filter((row) => row.type === "HTTP_EXCHANGE").length}
        />
        <Stat
          label="Retest evidence"
          value={(evidence ?? []).filter((row) => row.type === "RETEST_EXCHANGE").length}
        />
        <Stat label="Algorithm" value="SHA-256" />
      </div>

      <div className="mt-4 border border-[#24344F] bg-[#152238]">
        <div className="flex flex-col gap-2 border-b border-[#24344F] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6B8199]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artifact, finding or hash…"
              className="h-8 w-full border border-[#2A3B55] bg-[#0F1B2D] pl-8 pr-3 text-[11px] text-[#d7e2ee] placeholder:text-[#4d647a] focus:border-[#2DD4BF]/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ALL", ...types].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={
                  type === value
                    ? "border border-[#2DD4BF]/50 bg-[#2DD4BF]/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#2DD4BF]"
                    : "border border-[#2A3B55] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9FB3C8] hover:text-[#E5EDF5]"
                }
              >
                {value.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {!evidence || evidence.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Fingerprint className="size-5" />}
              title="No evidence artifacts yet"
              body="Evidence appears only after a verified finding or a retest. Each artifact is the sanitized exchange that proves the assertion."
              action={
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#F5B942]">
                  <LockKeyhole className="size-3" /> Awaiting approved execution
                </span>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[#1B2C45]">
            {rows.map((row) => {
              const state = checks[row._id];
              const isOpen = expanded === row._id;
              return (
                <div key={row._id}>
                  <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-[#34D399]/30 bg-[#34D399]/8">
                        <Fingerprint className="size-3.5 text-[#34D399]" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-[#d7e2ee]">{row.label}</p>
                        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B8199]">
                          {row.type.replaceAll("_", " ")} · {row.algorithm} ·{" "}
                          {relativeTime(row.createdAt)}
                          {row.findingId
                            ? ` · ${findingLabels.get(row.findingId) ?? "finding"}`
                            : ""}
                        </p>
                        <p className="mt-1 max-w-[560px] truncate font-mono text-[8px] text-[#9FB3C8]">
                          {row.sha256}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {state === "match" && (
                        <Chip tone="success">
                          <CheckCircle2 className="size-3" /> verified
                        </Chip>
                      )}
                      {state === "mismatch" && (
                        <Chip tone="critical">
                          <XCircle className="size-3" /> mismatch
                        </Chip>
                      )}
                      {state === "checking" && <Chip tone="neutral">hashing…</Chip>}
                      <ActionButton
                        variant="ghost"
                        onClick={() => verify(row._id, row.content, row.sha256)}
                        disabled={state === "checking"}
                      >
                        <ShieldCheck className="size-3" /> Verify
                      </ActionButton>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : row._id)}
                        className="border border-[#2A3B55] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9FB3C8] hover:text-[#E5EDF5]"
                      >
                        {isOpen ? "Hide" : "Preview"}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[#1B2C45] bg-[#080f1a] px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
                          Sanitized artifact · {formatTimestamp(row.createdAt)}
                        </p>
                        <span className="flex items-center gap-1 font-mono text-[8px] text-[#6B8199]">
                          <ShieldX className="size-3" /> traveller PII redacted
                        </span>
                      </div>
                      <pre className="max-h-[300px] overflow-auto border border-[#2A3B55] bg-[#0F1B2D] p-3 font-mono text-[9px] leading-relaxed text-[#9fb4c9]">
                        {row.content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="p-6 text-center text-[11px] text-[#7E93A8]">
                No artifacts match the current filters.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 border border-[#24344F] bg-[#0F1B2D] px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
        <span className="flex items-center gap-1.5">
          <Fingerprint className="size-3 text-[#34D399]" /> SHA-256 recorded at capture
        </span>
        <span className="flex items-center gap-1.5">
          <LockKeyhole className="size-3 text-[#2DD4BF]" /> Owner-scoped access
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-[#64B5F6]" /> Verification recomputes content
        </span>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[#24344F] bg-[#152238] px-3 py-2.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#E5EDF5]">{value}</p>
    </div>
  );
}
