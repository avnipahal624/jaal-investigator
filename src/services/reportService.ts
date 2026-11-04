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
    simulated: true,
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
      "No analyst notes recorded. All identifiers in this report are synthetic demo values extracted from a controlled simulation.",
  };
}

export function exportReportJson(report: EvidenceReport): void {
  downloadJson(
    `${report.id}_${report.caseId}.json`.toLowerCase(),
    {
      ...report,
      disclaimer:
        "SIMULATED REPORT — generated from a controlled JAAL demo conversation. Hashes verify content integrity only; they do not establish authenticity, guilt or legal admissibility.",
    },
  );
}

/** Trigger the browser print dialog for the printable report view. */
export function printReport(): void {
  window.print();
}
