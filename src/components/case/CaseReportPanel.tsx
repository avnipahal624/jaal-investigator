import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useJaal } from "@/state/JaalProvider";
import type { EvidenceReport } from "@/types/report";
import { exportReportJson, filterReportForExport } from "@/services/reportService";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Lock,
  Printer,
  ShieldCheck,
} from "lucide-react";

type Draft = {
  reportId: string;
  generatedAt: number;
  reportData: EvidenceReport;
  simulated: boolean;
  draftNarrative: string | null;
  excludedEvidenceIds: string[];
  excludedTacticKeys: string[];
  redactSensitive: boolean;
  reviewedAt: number | null;
};

const SENSITIVE = /intimate|nude|naked|sexual|photo|video|blackmail|extort/i;

export function CaseReportPanel({ caseId }: { caseId: string }) {
  const draft = useQuery(api.caseWorkspace.getCaseReportDraft, { caseId }) as Draft | null | undefined;
  const update = useMutation(api.caseWorkspace.updateCaseReportDraft);
  const { createReport } = useJaal();
  const [narrative, setNarrative] = useState("");
  const [excludedEvidence, setExcludedEvidence] = useState<string[]>([]);
  const [excludedTactics, setExcludedTactics] = useState<string[]>([]);
  const [redactSensitive, setRedactSensitive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setNarrative(draft.draftNarrative ?? draft.reportData.summary.scenario ?? "");
    setExcludedEvidence(draft.excludedEvidenceIds ?? []);
    setExcludedTactics(draft.excludedTacticKeys ?? []);
    setRedactSensitive(draft.redactSensitive ?? true);
    setCreating(false);
  }, [draft?.reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleEvidence = useMemo(
    () => (draft?.reportData.evidence ?? []).filter((row) => !excludedEvidence.includes(row.id)),
    [draft, excludedEvidence],
  );
  const sensitiveEvidence = useMemo(
    () =>
      (draft?.reportData.evidence ?? []).filter(
        (row) => SENSITIVE.test(`${row.label} ${row.value}`) && excludedEvidence.includes(row.id),
      ),
    [draft, excludedEvidence],
  );

  if (draft === undefined) {
    return (
      <div className="jaal-panel flex items-center gap-2 p-6 text-xs text-jmuted">
        <Loader2 className="size-4 animate-spin text-jcyan" /> Loading report draft…
      </div>
    );
  }

  if (draft === null) {
    return (
      <div className="jaal-panel p-8 text-center">
        <FileText className="mx-auto size-8 text-jmuted/60" />
        <h2 className="mt-3 text-base font-semibold text-jtext">No report generated for this case</h2>
        <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-jmuted">
          Generate a draft from the current reviewed evidence. The report is a snapshot; editing the draft never
          changes the original messages or recording.
        </p>
        <button
          type="button"
          disabled={creating}
          onClick={() => {
            setCreating(true);
            const report = createReport(caseId);
            if (!report) {
              setCreating(false);
              setError("This case could not be read.");
            }
          }}
          className="metal-button mt-4 inline-flex items-center gap-2 rounded-sm px-4 py-2 text-[11px] font-semibold disabled:opacity-50"
        >
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
          {creating ? "Generating draft…" : "Generate report draft"}
        </button>
        {error && <p className="mt-2 text-[11px] text-jred">{error}</p>}
      </div>
    );
  }

  const report = draft.reportData;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await update({
        caseId,
        reportId: draft.reportId,
        narrative,
        excludedEvidenceIds: excludedEvidence,
        excludedTacticKeys: excludedTactics,
        redactSensitive,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report draft.");
    } finally {
      setSaving(false);
    }
  };

  const buildExport = (): EvidenceReport =>
    filterReportForExport(report, {
      narrative,
      excludedEvidenceIds: excludedEvidence,
      excludedTacticKeys: excludedTactics,
      redactSensitive,
    });

  const exportNow = () => {
    exportReportJson(buildExport());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="jaal-label !text-jcyan">Reviewed report</p>
          <h2 className="mt-1 text-lg font-semibold text-jtext">{report.title}</h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-jmuted">
            {draft.reportId} · generated {new Date(draft.generatedAt).toLocaleString()}
            {draft.reviewedAt ? ` · reviewed ${new Date(draft.reviewedAt).toLocaleString()}` : " · draft not reviewed"}
          </p>
        </div>
        <span
          className={cn(
            "border px-2 py-1 font-mono text-[8px] uppercase tracking-wider",
            draft.simulated
              ? "border-jamber/50 bg-jamber/10 text-jamber"
              : "border-jcyan/40 bg-jcyan/10 text-jcyan",
          )}
        >
          {draft.simulated ? "Simulation / demonstration case" : "User-supplied evidence"}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <section className="jaal-panel p-4">
            <label className="jaal-label" htmlFor="report-narrative">
              Incident summary · editable
            </label>
            <textarea
              id="report-narrative"
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
              rows={7}
              className="mt-2 w-full border border-jborder/70 bg-jsurface p-3 text-[11px] leading-relaxed text-jtext outline-none focus:border-jcyan/60"
            />
            <p className="mt-1 text-[10px] text-jmuted">
              Only the report narrative changes. Source messages and recordings remain untouched.
            </p>
          </section>

          <section className="jaal-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="jaal-label">Key source evidence</h3>
              <span className="font-mono text-[9px] text-jmuted">
                {visibleEvidence.length}/{report.evidence.length} included
              </span>
            </div>
            <p className="mt-1 text-[10px] text-jmuted">
              Excluded findings stay in the case but are omitted from this export.
            </p>
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
              {report.evidence.length === 0 ? (
                <p className="text-[11px] text-jmuted">No extracted evidence rows in this report.</p>
              ) : (
                report.evidence.map((row) => {
                  const excluded = excludedEvidence.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 border px-2.5 py-2",
                        excluded ? "border-jborder/40 bg-jsurface/30 opacity-60" : "border-jborder/60 bg-jsurface/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() =>
                          setExcludedEvidence((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                        className="mt-0.5 accent-[#6fd7ff]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[11px] text-jtext">
                          {row.label}: {SENSITIVE.test(`${row.label} ${row.value}`) && redactSensitive ? "•••• sensitive" : row.value}
                        </span>
                        <span className="mt-0.5 block font-mono text-[9px] text-jmuted">
                          {row.type} · {row.hashStatus} · source {row.sourceMessageNumber ? `#${row.sourceMessageNumber}` : "not linked"}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          <section className="jaal-panel p-4">
            <h3 className="jaal-label">Tactics in this report</h3>
            <div className="mt-2 space-y-1">
              {report.tactics.length === 0 ? (
                <p className="text-[11px] text-jmuted">No tactics recorded.</p>
              ) : (
                report.tactics.map((row) => {
                  const key = `${row.tactic}:${row.timestamp}`;
                  const included = !excludedTactics.includes(key);
                  return (
                    <label key={key} className="flex items-start gap-2 border border-jborder/50 px-2.5 py-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() =>
                          setExcludedTactics((current) =>
                            included ? [...current, key] : current.filter((item) => item !== key),
                          )
                        }
                        className="mt-0.5 accent-[#6fd7ff]"
                      />
                      <span>
                        <span className="text-jtext">{row.name}</span>
                        <span className="mt-0.5 block text-[10px] text-jmuted">{row.explanation}</span>
                        {row.messageNumber && (
                          <span className="mt-0.5 block font-mono text-[9px] text-jcyan">
                            source message #{row.messageNumber}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <section className="jaal-panel p-4">
            <h3 className="jaal-label">Preview structure</h3>
            <ol className="mt-2 space-y-1.5 text-[11px] text-jmuted">
              {[
                "Case information",
                "Incident summary",
                "Chronological timeline",
                "Key source evidence",
                "Indicators",
                "Tactics and supporting sources",
                "Voice/call moments with timestamps",
                "Actions marked complete",
                "Evidence integrity",
                "Limits and unverified claims",
              ].map((label, index) => (
                <li key={label} className="flex gap-2">
                  <span className="font-mono text-[9px] text-jcyan">{String(index + 1).padStart(2, "0")}</span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 border-t border-jborder/50 pt-3 text-[10px] text-jmuted">
              <p>{report.evidence.length} source evidence rows · {report.tactics.length} tactics</p>
              <p>{report.integrity.hashed} hashed · {report.integrity.mismatched} mismatched</p>
              <p>{report.simulated ? "Labeled as a demonstration case." : "User-supplied case."}</p>
            </div>
          </section>

          <section className="jaal-panel p-4">
            <h3 className="jaal-label flex items-center gap-1.5">
              <Lock className="size-3" /> Sensitive material
            </h3>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-jmuted">
              <input
                type="checkbox"
                checked={redactSensitive}
                onChange={(event) => setRedactSensitive(event.target.checked)}
                className="mt-0.5 accent-[#6fd7ff]"
              />
              Exclude sensitive excerpts from export by default. Intimate-image and blackmail material is never
              displayed or exported by default.
            </label>
            {sensitiveEvidence.length > 0 && (
              <p className="mt-2 text-[10px] text-jamber">
                {sensitiveEvidence.length} sensitive-looking row{sensitiveEvidence.length === 1 ? "" : "s"} currently excluded.
              </p>
            )}
          </section>

          <section className="jaal-panel p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="metal-button inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[10px] font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save reviewed draft
              </button>
              <button
                type="button"
                onClick={exportNow}
                className="metal-button-ghost inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[10px]"
              >
                <Download className="size-3.5" /> Export JSON
              </button>
              <Link
                to={`/reports/${report.id}`}
                className="metal-button-ghost inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[10px]"
              >
                <Printer className="size-3.5" /> Open stored report
              </Link>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-jmuted">
              JSON export applies the exclusions and edited narrative above. The stored report link opens the full
              snapshot for review and printing.
            </p>
            {saved && (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-jgreen">
                <ShieldCheck className="size-3.5" /> Draft saved with review timestamp.
              </p>
            )}
            {error && (
              <p className="mt-2 flex items-center gap-2 text-[11px] text-jred">
                <AlertTriangle className="size-3.5" /> {error}
              </p>
            )}
          </section>
        </aside>
      </div>

      <section className="jaal-panel p-4">
        <h3 className="jaal-label">Provenance and limits</h3>
        <div className="mt-2 grid gap-2 text-[10px] leading-relaxed text-jmuted md:grid-cols-2">
          <p><span className="text-jcyan">Source content:</span> messages and audio supplied by the user or the labeled simulation.</p>
          <p><span className="text-jcyan">Rule-based:</span> identifiers extracted by deterministic rules; review status is stored separately.</p>
          <p><span className="text-jcyan">AI-assisted:</span> {draft.reportData.provenance?.aiAssisted?.join("; ") || "No AI narrative is claimed for this report."}</p>
          <p><span className="text-jcyan">Human-reviewed:</span> {draft.reviewedAt ? `saved ${new Date(draft.reviewedAt).toLocaleString()}` : "not yet reviewed"}</p>
          <p><span className="text-jamber">Unverified:</span> hashes prove content integrity, not that a claim is true or that a person is guilty.</p>
          <p><span className="text-jamber">Not performed:</span> no automatic report was submitted to authorities, a bank or a platform.</p>
        </div>
        {report.unknowns.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-jmuted">
            {report.unknowns.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
