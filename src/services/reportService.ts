import { TACTIC_META } from "@/services/investigationService";
import { isAiEngine } from "@/theme/status";
import { buildCaseSummary, buildUnknowns } from "@/services/summaryService";
import type { CaseRuntime, Investigation } from "@/types/investigation";
import type { EvidenceReport } from "@/types/report";
import { downloadJson } from "@/utils/export";

/** Build a structured evidence report from live investigation state. */
export function buildReport(
  investigation: Investigation,
  runtime: CaseRuntime,
  generatedBy: string,
  now = Date.now(),
): EvidenceReport {
  const integrity = runtime.evidence.reduce(
    (acc, item) => {
      acc.collected += 1;
      if (
        item.hashStatus === "generated" ||
        item.hashStatus === "verified" ||
        item.hashStatus === "mismatch" ||
        item.hashStatus === "tampered"
      )
        acc.hashed += 1;
      if (item.hashStatus === "verified") acc.verified += 1;
      if (item.hashStatus === "mismatch" || item.hashStatus === "tampered")
        acc.mismatched += 1;
      if (item.hashStatus === "none") acc.unhashed += 1;
      return acc;
    },
    { collected: 0, hashed: 0, verified: 0, mismatched: 0, unhashed: 0 },
  );

  const messageNumbers: Record<string, number> = {};
  runtime.messages.forEach((m, i) => {
    messageNumbers[m.id] = i + 1;
  });

  // ---- Provenance: keep finding classes explicitly separated --------------
  const strategyIsAi = isAiEngine(runtime.strategy?.source);
  const reviewed = runtime.evidence.filter(
    (e) => e.reviewStatus === "confirmed" || e.reviewStatus === "incorrect",
  );
  const provenance: NonNullable<EvidenceReport["provenance"]> = {
    conversation:
      "Verbatim messages as stored in the case record (original conversation evidence).",
    ruleBased: [
      "Scam tactics — rule-based content pattern detection (no model involved).",
      "Extracted indicators — rule-based regex extraction with validation; see detectionMethod on each row.",
      "Kill-chain stage progression — content-derived stage detection.",
      strategyIsAi
        ? "Strategy superseded by an AI-assisted suggestion (see AI-assisted)."
        : "Investigation strategy — deterministic rule engine over the conversation state.",
    ],
    aiAssisted: strategyIsAi
      ? ["Investigation strategy suggestion — Groq LLM (validated structured output)."]
      : [],
    humanReviewed: reviewed.length
      ? reviewed.map(
          (e) =>
            `${e.label}: ${e.value} — ${e.reviewStatus}${
              e.reviewNote ? ` (${e.reviewNote})` : ""
            }`,
        )
      : [],
    unverifiedAssumptions: [
      "Tactic detections are heuristic pattern matches — they do not prove intent or guilt.",
      "Extracted identifiers were not checked against any external authority; they may be synthetic or spoofed.",
      "Timestamps reflect recorded session times, not independently attested times.",
      "A matching SHA-256 shows content is unchanged since recording — not authorship, origin, or legal admissibility.",
    ],
    simulationOnly: [
      "Scammer replies in simulation-sourced cases are scripted (SIM-ENGINE) — no real scammer was contacted.",
      "Identifiers in simulation-sourced cases are synthetic demo values.",
    ],
  };
  if (provenance.aiAssisted.length === 0) {
    provenance.aiAssisted.push(
      "None — no AI-assisted interpretation was produced for this case.",
    );
  }
  if (provenance.humanReviewed.length === 0) {
    provenance.humanReviewed.push("No analyst review verdicts recorded yet.");
  }

  return {
    id: `RPT-${investigation.id.replace("JAAL-", "")}-${now.toString(36).toUpperCase().slice(-5)}`,
    caseId: investigation.id,
    title: investigation.title,
    category: investigation.category,
    generatedAt: now,
    generatedBy,
    simulated: investigation.source === "simulation",
    hashAlgorithm: "SHA-256",
    provenance,
    status: investigation.status,
    currentStage: runtime.stages.find((s) => s.status === "active")?.id ?? investigation.currentStage,
    evidenceCount: runtime.evidence.length,
    integrity,
    description: investigation.description,
    summary: buildCaseSummary(investigation, runtime),
    unknowns: buildUnknowns(investigation, runtime),
    transcript: runtime.messages.map((m) => ({
      author: m.author,
      text: m.text,
      timestamp: m.timestamp,
    })),
    tactics: runtime.tactics.map((t) => ({
      tactic: t.tactic,
      name: TACTIC_META[t.tactic].name,
      timestamp: t.timestamp,
      sourceText: t.sourceText,
      explanation: t.explanation,
      messageId: t.messageId ?? null,
      messageNumber:
        t.messageId != null ? (messageNumbers[t.messageId] ?? null) : null,
    })),
    stages: runtime.stages.map((s) => ({
      id: s.id,
      number: s.number,
      label: s.label,
      status: s.status,
      detectedAt: s.detectedAt,
      reason: s.reason,
    })),
    evidence: runtime.evidence.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.label,
      value: e.value,
      extractedAt: e.extractedAt,
      hash: e.hash,
      hashStatus: e.hashStatus,
      review: {
        status: e.reviewStatus ?? null,
        note: e.reviewNote ?? null,
        reviewedAt: e.reviewedAt ?? null,
      },
      sourceMessageId: e.sourceMessageId ?? null,
      sourceMessageNumber:
        e.sourceMessageId != null
          ? (messageNumbers[e.sourceMessageId] ?? null)
          : null,
      hashAlgorithm: e.hash ? "SHA-256" : null,
      confidence: e.confidence ?? null,
      detectionMethod: e.detectionMethod ?? null,
    })),
    timeline: runtime.activities.map((a) => ({
      timestamp: a.timestamp,
      kind: a.kind,
      title: a.title,
      detail: a.detail,
    })),
    verification: runtime.evidence.map((e) => ({
      id: e.id,
      label: `${e.label}: ${e.value}`,
      hash: e.hash,
      status: e.hashStatus,
      note:
        e.hashStatus === "verified"
          ? "Content matches the recorded hash. This confirms content integrity only — not authenticity."              : e.hashStatus === "mismatch"
                ? "Content no longer matches the recorded hash."
                : e.hashStatus === "tampered"
                  ? "Content altered through the tamper simulation — original snapshot and hash preserved. Re-run verification to confirm the mismatch."
                  : e.hashStatus === "generated"
                    ? "Hash recorded. Independent verification against this baseline has not yet been run."
                    : "Evidence collected. No hash recorded yet.",
      hashAlgorithm: e.hash ? "SHA-256" : null,
    })),
    analystNotes:
      investigation.notes ||
      (investigation.source === "simulation"
        ? "No analyst notes recorded. All identifiers in this report are synthetic demo values extracted from a controlled simulation."
        : "No analyst notes recorded. This report contains user-supplied evidence; hashes verify content integrity only."),
  };
}

const SENSITIVE_EXPORT_PATTERN = /intimate|nude|naked|sexual|photo|video|blackmail|extort/i;

/**
 * Build the report that will actually leave JAAL. Excluded findings are
 * removed, sensitive-looking rows are removed by default, and only the
 * editable narrative is replaced — source messages are never rewritten.
 */
export function filterReportForExport(
  report: EvidenceReport,
  options: {
    narrative?: string;
    note?: string;
    actionsCompleted?: EvidenceReport["actionsCompleted"];
    excludedEvidenceIds?: string[];
    excludedTacticKeys?: string[];
    redactSensitive?: boolean;
  } = {},
): EvidenceReport {
  const excluded = new Set(options.excludedEvidenceIds ?? []);
  const excludedTactics = new Set(options.excludedTacticKeys ?? []);
  const redactSensitive = options.redactSensitive ?? true;
  const narrative = options.narrative ?? report.summary.scenario;
  return {
    ...report,
    description: narrative,
    analystNotes: options.note?.trim()
      ? `${report.analystNotes}\n\nInvestigator note: ${options.note.trim()}`
      : report.analystNotes,
    actionsCompleted: options.actionsCompleted ?? report.actionsCompleted ?? [],
    summary: {
      ...report.summary,
      scenario: narrative,
      moments: report.summary.moments.filter(
        (moment) =>
          !redactSensitive ||
          !SENSITIVE_EXPORT_PATTERN.test(`${moment.label} ${moment.text}`),
      ),
    },
    evidence: report.evidence.filter((row) => {
      if (excluded.has(row.id)) return false;
      if (redactSensitive && SENSITIVE_EXPORT_PATTERN.test(`${row.label} ${row.value}`)) return false;
      return true;
    }),
    tactics: report.tactics.filter(
      (row) => !excludedTactics.has(`${row.tactic}:${row.timestamp}`),
    ),
  };
}

export function exportReportJson(report: EvidenceReport): void {
  downloadJson(
    `${report.id}_${report.caseId}.json`.toLowerCase(),
    {
      ...report,
      disclaimer: report.simulated
        ? "SIMULATED REPORT — generated from a controlled JAAL demo conversation. Hashes verify content integrity only; they do not establish authenticity, guilt or legal admissibility."
        : "REPORT — contains user-supplied evidence. Hashes verify that content is unchanged since collection; they do not establish authorship, guilt or legal admissibility.",
    },
  );
}

/** Trigger the browser print dialog for the printable report view. */
export function printReport(): void {
  window.print();
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Build a self-contained, printable copy of the filtered report. Only the
 * report data passed in is rendered, so exclusions and sensitive filtering
 * applied by `filterReportForExport` are preserved in the printed document.
 */
export function buildPrintableReportHtml(report: EvidenceReport): string {
  const evidence = report.evidence
    .map(
      (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(
        row.sourceMessageNumber ? `message #${row.sourceMessageNumber}` : row.id.startsWith("voice:") ? "recording finding" : "not linked",
      )}</td><td>${escapeHtml(row.hashStatus)}</td></tr>`,
    )
    .join("");
  const tactics = report.tactics
    .map(
      (row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.sourceText)}</td><td>${escapeHtml(
        row.messageNumber ? `message #${row.messageNumber}` : "source unavailable",
      )}</td></tr>`,
    )
    .join("");
  const indicators = report.evidence
    .map(
      (row) => `<li><strong>${escapeHtml(row.label)}</strong>: ${escapeHtml(row.value)} — ${escapeHtml(
        row.sourceMessageNumber ? `source message #${row.sourceMessageNumber}` : "source link unavailable",
      )}</li>`,
    )
    .join("");
  const moments = report.summary.moments
    .map(
      (moment) => `<li><strong>${escapeHtml(moment.label)}</strong> — ${escapeHtml(moment.text)}</li>`,
    )
    .join("");
  const timeline = report.timeline
    .map(
      (event) => `<li><span>${escapeHtml(fmtDate(event.timestamp))}</span> ${escapeHtml(event.title)} — ${escapeHtml(event.detail)}</li>`,
    )
    .join("");
  const actions = (report.actionsCompleted ?? [])
    .map((action) => `<li><strong>${escapeHtml(action.title)}</strong> — ${escapeHtml(action.reason)} <em>(${escapeHtml(fmtDate(action.completedAt))})</em></li>`)
    .join("");
  const limits = report.unknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const integrity = report.verification
    .map(
      (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.status)}</td><td class="mono">${escapeHtml(row.hash ?? "—")}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(report.id)} — ${escapeHtml(report.title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Georgia, "Times New Roman", serif; color: #132033; margin: 32px; line-height: 1.5; }
  h1, h2, h3 { font-family: Helvetica, Arial, sans-serif; color: #0b2b45; }
  h1 { font-size: 24px; margin: 0 0 4px; border-bottom: 3px solid #0b6e8f; padding-bottom: 10px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; margin-top: 26px; border-bottom: 1px solid #b9d4df; padding-bottom: 5px; }
  .meta, .mono { font-family: "Courier New", monospace; font-size: 10px; color: #526577; }
  .banner { border: 1px solid #b9791c; background: #fff7e8; color: #704300; padding: 8px 12px; margin: 16px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; margin-top: 8px; }
  th, td { border: 1px solid #c9d7df; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eef5f8; font-family: Helvetica, Arial, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  ul { padding-left: 20px; font-size: 11px; }
  .note { border-left: 3px solid #0b6e8f; padding: 4px 12px; font-size: 11px; color: #33485c; }
  @media print { body { margin: 16mm; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style></head><body>
  <p class="mono">JAAL INVESTIGATOR · REVIEWED CASE REPORT</p>
  <h1>${escapeHtml(report.title)}</h1>
  <p class="meta">${escapeHtml(report.id)} · ${escapeHtml(report.caseId)} · generated ${escapeHtml(fmtDate(report.generatedAt))} · version ${escapeHtml(report.reportVersion ?? 1)}</p>
  ${report.simulated ? '<p class="banner">SIMULATION / DEMONSTRATION CASE — synthetic messages and identifiers. No real person, organisation or payment destination was contacted.</p>' : '<p class="banner">USER-SUPPLIED EVIDENCE CASE — hashes prove content integrity only, not authorship or legal admissibility.</p>'}
  <h2>1. Case information</h2>
  <p>${escapeHtml(report.description)}</p>
  <p class="meta">Category: ${escapeHtml(report.category)} · status: ${escapeHtml(report.status)} · current stage: ${escapeHtml(report.currentStage)} · prepared by: ${escapeHtml(report.generatedBy)}</p>
  <h2>2. Incident summary</h2>
  <p>${escapeHtml(report.summary.scenario)}</p>
  <h2>3. Chronological timeline</h2>
  <ul>${timeline || "<li>No timeline events.</li>"}</ul>
  <h2>4. Key source evidence</h2>
  <table><thead><tr><th>Finding</th><th>Value</th><th>Source</th><th>Integrity</th></tr></thead><tbody>${evidence || '<tr><td colspan="4">No evidence rows included.</td></tr>'}</tbody></table>
  <h2>5. Indicators</h2>
  <ul>${indicators || "<li>No indicators included.</li>"}</ul>
  <h2>6. Tactics and supporting sources</h2>
  <table><thead><tr><th>Tactic</th><th>Supporting text</th><th>Source</th></tr></thead><tbody>${tactics || '<tr><td colspan="3">No tactics included.</td></tr>'}</tbody></table>
  <h2>7. Voice and call moments</h2>
  <ul>${moments || "<li>No reviewed voice moments included.</li>"}</ul>
  <h2>8. Actions marked complete</h2>
  <ul>${actions || "<li>No action was marked complete by a person.</li>"}</ul>
  <h2>9. Evidence integrity</h2>
  <p class="meta">${report.integrity.collected} collected · ${report.integrity.hashed} hashed · ${report.integrity.verified} verified · ${report.integrity.mismatched} mismatched · ${report.integrity.unhashed} unhashed</p>
  <table><thead><tr><th>Evidence</th><th>Status</th><th>Hash</th></tr></thead><tbody>${integrity || '<tr><td colspan="3">No hash records.</td></tr>'}</tbody></table>
  <h2>10. Limits and unverified claims</h2>
  <ul>${limits || "<li>No additional limitations recorded.</li>"}</ul>
  <p class="note"><strong>Analyst note:</strong> ${escapeHtml(report.analystNotes || "No analyst note recorded.")}</p>
  <p class="meta">JAAL does not submit reports to authorities or organisations, contact banks, freeze accounts, or remove content. Hashes verify content integrity only.</p>
</body></html>`;
}

/** Open a print-ready, filtered report in a new window and invoke printing. */
export function printReviewedReport(report: EvidenceReport): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.opener = null;
  win.document.write(buildPrintableReportHtml(report));
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 250);
}
