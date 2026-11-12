import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  // JAAL account kinds. A consumer is a "Normal People" reporter; an
  // investigator is an authorised console operator. Both are enforced
  // SERVER-SIDE from the stored `users.role` — never from a client flag.
  CONSUMER: "consumer",
  INVESTIGATOR: "investigator",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.CONSUMER),
  v.literal(ROLES.INVESTIGATOR),
);

const flagsValidator = v.object({
  tacticDetection: v.boolean(),
  identifierExtraction: v.boolean(),
  integrityHashing: v.boolean(),
  aiSuggestions: v.boolean(),
});

const runStatusValidator = v.union(
  v.literal("running"),
  v.literal("paused"),
  v.literal("completed"),
);

const integrityStatusValidator = v.union(
  v.literal("NOT_HASHED"),
  v.literal("HASH_GENERATED"),
  v.literal("INTEGRITY_VERIFIED"),
  v.literal("HASH_MISMATCH"),
  // Explicit tamper-demonstration state: content was altered by the
  // authenticated operator through the simulation path. Never presented as
  // verified — verification must be re-run against the recorded hash.
  v.literal("TAMPER_SIMULATION"),
);

const historyEntryValidator = v.object({
  at: v.number(),
  by: v.string(),
  action: v.string(),
  detail: v.optional(v.string()),
  hash: v.optional(v.string()),
  status: v.optional(v.string()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---------------------------------------------------------------- JAAL ---

    /** One investigation (case). `caseId` is the human-readable JAAL-XXX label. */
    investigations: defineTable({
      caseId: v.string(),
      /** Identity subject of the owning user, or "demo" for simulation login. */
      owner: v.string(),
      title: v.string(),
      category: v.string(),
      description: v.string(),
      notes: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("completed"),
        v.literal("archived"),
      ),
      source: v.union(
        v.literal("simulation"),
        v.literal("paste"),
        v.literal("import"),
      ),
      detectionMode: v.union(
        v.literal("simulation"),
        v.literal("balanced"),
        v.literal("manual"),
      ),
      flags: flagsValidator,
      currentStage: v.string(),
      createdAt: v.number(),
      lastActivityAt: v.number(),
      completedAt: v.optional(v.number()),
      // Run state (simulation cursor + CaseRuntime status).
      runStatus: runStatusValidator,
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
      cursor: v.number(),
      turnCount: v.number(),
      /** KillChainStage[] as structured JSON (content-derived). */
      stages: v.any(),
      schemaVersion: v.number(),
    })
      .index("by_owner", ["owner"])
      .index("by_owner_case", ["owner", "caseId"]),

    /** Conversation messages; original content is never altered. */
    messages: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      messageNumber: v.number(),
      sender: v.union(v.literal("scammer"), v.literal("decoy"), v.literal("system")),
      content: v.string(),
      source: v.string(),
      timestamp: v.number(),
      status: v.optional(v.string()),
    }).index("by_investigation", ["investigationId"]),

    /** Per-message tactic analysis results (structured JSON). */
    analyses: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      messageId: v.string(),
      intent: v.string(),
      tactics: v.any(),
      summary: v.string(),
      reasoningSummary: v.string(),
      engineMode: v.string(),
      createdAt: v.number(),
    }).index("by_investigation", ["investigationId"]),

    /** Detected tactics (one row per tactic+message, deduplicated). */
    tactics: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      tactic: v.string(),
      messageId: v.optional(v.string()),
      sourceText: v.string(),
      timestamp: v.number(),
      explanation: v.string(),
    }).index("by_investigation", ["investigationId"]),

    /** Extracted identifiers with SHA-256 integrity records. */
    evidence: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      sourceMessageId: v.optional(v.string()),
      sourceMessageText: v.string(),
      label: v.string(),
      evidenceType: v.string(),
      extractedValue: v.string(),
      normalizedValue: v.string(),
      /** Deterministic snapshot that gets hashed. */
      content: v.string(),
      extractionMethod: v.string(),
      extractionTimestamp: v.number(),
      /** Heuristic rule-based extraction confidence in [0,1] — review aid only. */
      confidence: v.optional(v.number()),
      integrityHash: v.optional(v.string()),
      integrityAlgorithm: v.optional(v.string()),
      integrityStatus: integrityStatusValidator,
      hashGeneratedAt: v.optional(v.number()),
      notes: v.string(),
      tampered: v.optional(v.boolean()),
      /** First (pre-tamper) snapshot — preserved so a simulation never erases the original. */
      originalContent: v.optional(v.string()),
      /** Every content mutation: { at, by, action, detail }. */
      contentHistory: v.optional(v.array(historyEntryValidator)),
      /** Every hash generation / re-baseline: { at, by, action, hash, detail }. */
      hashHistory: v.optional(v.array(historyEntryValidator)),
      /** Every verification result: { at, by, status, hash, detail }. */
      verificationHistory: v.optional(v.array(historyEntryValidator)),
      /** Deterministic canonical manifest (see buildEvidenceManifest)… */
      manifest: v.optional(v.any()),
      /** …and its SHA-256. Changes whenever any manifest field changes. */
      manifestHash: v.optional(v.string()),
      /** Analyst review verdict — stored separately from the original extraction. */
      reviewStatus: v.optional(
        v.union(
          v.literal("confirmed"),
          v.literal("incorrect"),
          v.literal("needs_review"),
        ),
      ),
      reviewNote: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_investigation", ["investigationId"]),

    /** Investigation events powering the activity console. */
    events: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      kind: v.string(),
      title: v.string(),
      detail: v.string(),
      timestamp: v.number(),
    }).index("by_investigation", ["investigationId"]),

    /** Log lines (info/warn/success/error) for the console streams. */
    logs: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      level: v.string(),
      message: v.string(),
      timestamp: v.number(),
    }).index("by_investigation", ["investigationId"]),

    /** AI investigation strategy suggestions (pending = shown to operator). */
    strategies: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      objective: v.string(),
      informationGap: v.string(),
      suggestedQuestion: v.string(),
      reason: v.string(),
      relatedMessageIds: v.array(v.string()),
      engineMode: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("dismissed"),
        v.literal("superseded"),
        v.literal("exhausted"),
      ),
      createdAt: v.number(),
    })
      .index("by_investigation", ["investigationId"])
      .index("by_investigation_status", ["investigationId", "status"]),

    /** Generated evidence reports (full structured payload as JSON). */
    reports: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      reportId: v.string(),
      reportVersion: v.number(),
      summary: v.any(),
      reportData: v.any(),
      generatedAt: v.number(),
      reportStatus: v.string(),
      simulated: v.boolean(),
    })
      .index("by_owner", ["owner"])
      .index("by_investigation", ["investigationId"]),

    /**
     * AI action usage records — rolling-window rate limiting per owner.
     * Written only by the server; never exposed as a query surface.
     */
    ai_requests: defineTable({
      owner: v.string(),
      caseId: v.string(),
      kind: v.string(),
      at: v.number(),
    }).index("by_owner_at", ["owner", "at"]),

    /**
     * JAAL INTELLIGENCE ENGINE — one row per (case, module) AI analysis.
     * The latest result per module wins; AI output is stored SEPARATELY from
     * original messages/evidence and can never mutate them.
     */
    ai_analyses: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      module: v.union(
        v.literal("threat"),
        v.literal("prediction"),
        v.literal("correlation"),
        v.literal("report"),
      ),
      status: v.union(
        v.literal("PROCESSING"),
        v.literal("COMPLETED"),
        v.literal("FAILED"),
        v.literal("UNAVAILABLE"),
      ),
      /** Version of the prompt + output schema that produced this result. */
      schemaVersion: v.number(),
      /** Fingerprint of the conversation/evidence version that was analysed. */
      fingerprint: v.string(),
      inputMessageCount: v.number(),
      provider: v.optional(v.string()),
      model: v.optional(v.string()),
      /** Validated structured output — never rendered without validation. */
      output: v.optional(v.any()),
      limitations: v.array(v.string()),
      /** Failure CATEGORY only (e.g. "provider-error") — never raw content. */
      error: v.optional(v.string()),
      durationMs: v.optional(v.number()),
      at: v.number(),
    })
      .index("by_owner_case", ["owner", "caseId"])
      .index("by_case_module", ["investigationId", "module"]),

    /** Investigation Copilot — per-case chat history (owner-scoped). */
    copilot_messages: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      /** Structured answer parts (validated) for assistant turns. */
      sections: v.optional(v.any()),
      refs: v.optional(v.any()),
      status: v.optional(v.string()),
      error: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_investigation", ["investigationId"])
      .index("by_owner_case", ["owner", "caseId"]),

    /**
     * AI / rule-based relationship SUGGESTIONS — always PENDING_REVIEW
     * until the investigator accepts or rejects them. Never auto-promoted.
     */
    correlation_suggestions: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      source: v.any(), // { kind: "indicator"|"message"|"tactic", recordId, label }
      target: v.any(),
      relation: v.string(),
      category: v.string(),
      explanation: v.string(),
      messageRefs: v.array(v.string()),
      evidenceRefs: v.array(v.string()),
      confidence: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
      ),
      origin: v.union(v.literal("AI"), v.literal("RULE_BASED")),
      status: v.union(
        v.literal("PENDING_REVIEW"),
        v.literal("ACCEPTED"),
        v.literal("REJECTED"),
      ),
      reviewer: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      reviewNote: v.optional(v.string()),
      fingerprint: v.string(),
      at: v.number(),
    })
      .index("by_investigation", ["investigationId"])
      .index("by_investigation_status", ["investigationId", "status"]),

    /** Confirmed relationships — created ONLY by investigator acceptance. */
    correlations: defineTable({
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),
      source: v.any(),
      target: v.any(),
      relation: v.string(),
      basis: v.string(),
      messageRefs: v.array(v.string()),
      evidenceRefs: v.array(v.string()),
      suggestionId: v.id("correlation_suggestions"),
      acceptedBy: v.string(),
      acceptedAt: v.number(),
    }).index("by_investigation", ["investigationId"]),

    /**
     * JAAL VOICE SCAM INTELLIGENCE — one row per submitted call recording.
     *
     * The ORIGINAL uploaded audio is preserved untouched in Convex file
     * storage (`storageId`); its SHA-256 (`fileHash`) is computed over the
     * exact uploaded bytes and never recomputed over a modified copy.
     *
     * Transcription and AI analysis are stored SEPARATELY from the original
     * recording. Neither can mutate `storageId`/`fileHash`. Each records which
     * provider actually ran, and transcription/analysis failures are honest
     * (an UNAVAILABLE/FAILED state is never dressed up as a result).
     *
     * Ownership: every read is scoped to `owner` (the consumer who uploaded)
     * or to a verified investigator for the linked case. There is no public
     * access path to the audio.
     */
    voice_recordings: defineTable({
      /** Consumer report this recording belongs to (original report preserved). */
      investigationId: v.id("investigations"),
      owner: v.string(),
      caseId: v.string(),

      // Original file — preserved, never altered.
      storageId: v.string(),
      fileName: v.string(),
      mimeType: v.string(),
      sizeBytes: v.number(),
      /** SHA-256 (lowercase hex) of the original uploaded bytes. */
      fileHash: v.string(),
      hashAlgorithm: v.string(),
      durationSeconds: v.optional(v.number()),
      /** Explicit consumer consent + privacy acknowledgement recorded at upload. */
      consentAt: v.number(),
      consentVersion: v.string(),

      // Optional consumer-provided call context (all optional — never forced).
      callerPhone: v.optional(v.string()),
      claimedIdentity: v.optional(v.string()),
      approximateCallAt: v.optional(v.number()),
      whatHappened: v.optional(v.string()),
      moneyRequested: v.optional(v.boolean()),
      credentialsRequested: v.optional(v.boolean()),
      moneyTransferredOrShared: v.optional(v.boolean()),

      // Transcription — separate from analysis; honest about provider + status.
      transcript: v.optional(v.string()),
      /** [{ speaker, startMs, endMs, text }] — only when the provider supports it. */
      transcriptSegments: v.optional(v.any()),
      transcription: v.object({
        status: v.union(
          v.literal("NOT_STARTED"),
          v.literal("PROCESSING"),
          v.literal("COMPLETED"),
          v.literal("FAILED"),
          v.literal("UNAVAILABLE"),
          /** Positive speech-detection evidence: audio contained no speech. */
          v.literal("NO_SPEECH"),
        ),
        provider: v.optional(v.string()),
        /** Language reported by the speech-to-text provider, when it says so. */
        language: v.optional(v.string()),
        /** Failure category only ("no-provider" | "provider-error"). */
        error: v.optional(v.string()),
        at: v.optional(v.number()),
      }),
      /**
       * When true the transcript text came from the consumer typing/pasting
       * what was said, not from a speech-to-text provider. Kept distinct so the
       * UI and investigators never mistake self-reported text for a machine
       * transcript of the audio.
       */
      transcriptSource: v.optional(
        v.union(v.literal("SPEECH_PROVIDER"), v.literal("CONSUMER_PROVIDED")),
      ),

      // AI voice-scam analysis — separate from transcription.
      analysis: v.object({
        status: v.union(
          v.literal("NOT_STARTED"),
          v.literal("PROCESSING"),
          v.literal("COMPLETED"),
          v.literal("FAILED"),
          v.literal("UNAVAILABLE"),
        ),
        /** Overall assessment label — never a numeric fraud probability. */
        assessment: v.optional(
          v.union(
            v.literal("HIGH_CONCERN"),
            v.literal("WARNING_SIGNS_FOUND"),
            v.literal("NO_OBVIOUS_WARNING_SIGNS"),
            v.literal("UNABLE_TO_ASSESS"),
          ),
        ),
        summary: v.optional(v.string()),
        /** Validated structured findings — never rendered unvalidated. */
        findings: v.optional(v.any()),
        /**
         * Identifiers quoted in the transcript (phone / URL / UPI / org /
         * payment instruction). Extracted text, NOT verified intelligence —
         * a match against the indicator database is a separate lookup.
         */
        indicators: v.optional(v.any()),
        recommendedSteps: v.optional(v.array(v.string())),
        limitations: v.optional(v.array(v.string())),
        provider: v.optional(v.string()),
        model: v.optional(v.string()),
        /** Failure category only. */
        error: v.optional(v.string()),
        at: v.optional(v.number()),
      }),

      // Investigator linkage + review state (never overwrites AI output).
      intakeStatus: v.union(
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("MORE_INFORMATION_NEEDED"),
        v.literal("ACCEPTED"),
        v.literal("CLOSED"),
      ),
      /**
       * Client-generated key for one submission attempt. A retried tap, network
       * retry or screen re-entry with the same key returns the report that
       * already exists instead of creating a second one.
       */
      idempotencyKey: v.optional(v.string()),
      /**
       * Single-flight lease held by the processing action. Set while work runs;
       * expires on its own if the action is killed, so a later retry can resume
       * instead of being blocked forever. Never exposed to consumers.
       */
      processLeaseUntil: v.optional(v.number()),
      processRunId: v.optional(v.string()),
      linkedInvestigationId: v.optional(v.id("investigations")),
      reviewedBy: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      /** Investigator per-finding verdicts, keyed by finding id — stored apart from AI. */
      findingReviews: v.optional(v.any()),
      internalNotes: v.optional(v.any()),
      infoRequests: v.optional(v.any()),

      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["owner"])
      .index("by_owner_case", ["owner", "caseId"])
      .index("by_investigation", ["investigationId"])
      .index("by_storage", ["storageId"])
      .index("by_owner_idempotency", ["owner", "idempotencyKey"]),

    /** Per-user settings (appearance / investigation / simulation). */
    settings: defineTable({
      owner: v.string(),
      appearance: v.any(),
      investigation: v.any(),
      simulation: v.any(),
      updatedAt: v.number(),
    }).index("by_owner", ["owner"]),

    // ------------------------------------------------- JAAL PROTECTION ---

    /**
     * THREAT-INTELLIGENCE INDICATORS — shared, normalised, cross-user lookup
     * store used by the consumer app's proactive protection features
     * (caller screening, link protection, message checks).
     *
     * PROVENANCE IS FIRST-CLASS. `USER_REPORTED` means one or more JAAL users
     * flagged this identifier; it is NOT proof of wrongdoing and is never
     * presented as confirmed fraud. `VERIFIED` can only be set by an
     * investigator through `protection:verifyIndicator`. The reporter's
     * identity and their report contents are NEVER exposed by a lookup —
     * only the normalised value, a short reason, aggregate counts and the
     * provenance flag.
     */
    indicators: defineTable({
      type: v.union(
        v.literal("phone"),
        v.literal("url"),
        v.literal("domain"),
        v.literal("upi"),
        v.literal("message_pattern"),
      ),
      /** Normalised lookup key (see normalizeIndicator). */
      value: v.string(),
      /** Human-facing form — phone numbers are stored masked. */
      displayValue: v.string(),
      provenance: v.union(v.literal("USER_REPORTED"), v.literal("VERIFIED")),
      /** Short justification from the reporter (capped; no private content). */
      reason: v.string(),
      reportCount: v.number(),
      /** Distinct accounts that reported this indicator. */
      reporterCount: v.number(),
      sourceCaseId: v.optional(v.string()),
      createdBy: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastReportedAt: v.number(),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.string()),
    })
      .index("by_type_value", ["type", "value"])
      .index("by_type_updated", ["type", "updatedAt"]),

    /**
     * PROTECTION ALERTS — the user-visible history of meaningful security
     * findings raised by JAAL. Every alert states what happened, why it was
     * raised, the evidence/indicator behind it and a safe next step.
     *
     * `origin` separates a confirmed threat-intelligence match
     * (`THREAT_INTEL`) from an AI-generated assessment (`AI_ANALYSIS`) so the
     * two are never conflated in the UI.
     */
    protection_alerts: defineTable({
      owner: v.string(),
      kind: v.union(
        v.literal("caller"),
        v.literal("message"),
        v.literal("link"),
        v.literal("analysis"),
        v.literal("report"),
      ),
      title: v.string(),
      /** What happened. */
      explanation: v.string(),
      /** Which evidence or indicator triggered the alert. */
      evidence: v.string(),
      /** What the user can safely do next. */
      recommendedAction: v.string(),
      origin: v.union(v.literal("THREAT_INTEL"), v.literal("AI_ANALYSIS")),
      indicatorType: v.optional(v.string()),
      indicatorValue: v.optional(v.string()),
      read: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_owner_created", ["owner", "createdAt"])
      .index("by_owner_read", ["owner", "read"]),

    /**
     * PER-USER PROTECTION PREFERENCES — one row per owner. Defaults are
     * all-off: no protection capability is ever enabled without an explicit
     * user action, and every feature can be switched off again here.
     */
    protection_settings: defineTable({
      owner: v.string(),
      /** Caller protection (Android Call Screening role / iOS Call Directory). */
      callerProtection: v.boolean(),
      /** Notification / message protection (explicit notification access). */
      messageProtection: v.boolean(),
      /** Proactive link checks before opening a shared link. */
      linkProtection: v.boolean(),
      /** Consent to send submitted content to JAAL's AI provider for analysis. */
      aiProcessing: v.boolean(),
      /** Local notifications for security alerts. */
      alertNotifications: v.boolean(),
      /** Whether content shared INTO the app may be checked by JAAL. */
      shareToJaal: v.boolean(),
      updatedAt: v.number(),
    }).index("by_owner", ["owner"]),

    // ------------------------------------------------ AGENTIC DAST ---
    // Isolated from the forensic JAAL tables above. Every DAST row is owned by
    // the authenticated Convex identity and scoped to an application. The
    // original console, cases, evidence and reports are untouched.

    dastApplications: defineTable({
      owner: v.string(),
      name: v.string(),
      description: v.string(),
      environment: v.union(v.literal("SYNTHETIC_LAB"), v.literal("STAGING")),
      baseUrl: v.string(),
      transport: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_owner", ["owner"]),

    dastTargets: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      baseUrl: v.string(),
      allowedHosts: v.array(v.string()),
      allowedPaths: v.array(v.string()),
      scheme: v.string(),
      status: v.union(v.literal("AUTHORIZED"), v.literal("DISABLED")),
      authorizedBy: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner", ["owner"])
      .index("by_application", ["applicationId"]),

    dastPolicies: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      maxRequestsPerRun: v.number(),
      maxConcurrency: v.number(),
      rateLimitPerMinute: v.number(),
      approvalRequired: v.boolean(),
      emergencyStop: v.boolean(),
      allowRedirects: v.boolean(),
      historicalWindowDays: v.number(),
      zombieWindowDays: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["owner"])
      .index("by_application", ["applicationId"]),

    dastAgents: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      key: v.string(),
      name: v.string(),
      purpose: v.string(),
      status: v.string(),
      currentTask: v.optional(v.string()),
      lastRunAt: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      success: v.optional(v.boolean()),
      error: v.optional(v.string()),
      paused: v.boolean(),
      lastInvestigationId: v.optional(v.id("dastInvestigations")),
      updatedAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application_key", ["applicationId", "key"]),

    dastDeployments: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      version: v.string(),
      commit: v.string(),
      source: v.string(),
      status: v.string(),
      receivedAt: v.number(),
      manifest: v.any(),
      changes: v.any(),
      priorityScore: v.number(),
      investigationId: v.optional(v.id("dastInvestigations")),
      idempotencyKey: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application_version", ["applicationId", "version"])
      .index("by_application_idempotency", ["applicationId", "idempotencyKey"]),

    dastEndpoints: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      method: v.string(),
      path: v.string(),
      host: v.string(),
      service: v.string(),
      authType: v.string(),
      observedRoles: v.array(v.string()),
      parameters: v.any(),
      businessFlow: v.string(),
      classification: v.union(
        v.literal("ACTIVE"),
        v.literal("ZOMBIE"),
        v.literal("SHADOW"),
        v.literal("UNKNOWN"),
      ),
      documented: v.boolean(),
      confidence: v.number(),
      riskLevel: v.string(),
      lastObservedAt: v.optional(v.number()),
      lastSuccessAt: v.optional(v.number()),
      lastLegitimateTrafficAt: v.optional(v.number()),
      firstSeenAt: v.number(),
      source: v.string(),
      description: v.string(),
      ownerTeam: v.string(),
      findingsCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application_path", ["applicationId", "method", "path"])
      .index("by_application_classification", ["applicationId", "classification"]),

    dastObservations: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      endpointId: v.optional(v.id("dastEndpoints")),
      method: v.string(),
      path: v.string(),
      actorRole: v.string(),
      statusCode: v.number(),
      latencyMs: v.number(),
      requestSample: v.string(),
      responseSample: v.string(),
      observedAt: v.number(),
      source: v.string(),
      error: v.optional(v.string()),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application_observed", ["applicationId", "observedAt"])
      .index("by_endpoint", ["endpointId"]),

    dastFlows: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      key: v.string(),
      name: v.string(),
      description: v.string(),
      endpointPaths: v.array(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application_key", ["applicationId", "key"]),

    dastInvestigations: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      caseId: v.string(),
      title: v.string(),
      trigger: v.string(),
      deploymentId: v.optional(v.id("dastDeployments")),
      status: v.string(),
      stage: v.string(),
      currentAgent: v.string(),
      safetyStatus: v.string(),
      changedEndpointIds: v.array(v.id("dastEndpoints")),
      stats: v.any(),
      summary: v.string(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_owner_status", ["owner", "status"]),

    dastPlans: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      investigationId: v.id("dastInvestigations"),
      endpointId: v.optional(v.id("dastEndpoints")),
      testKey: v.string(),
      category: v.string(),
      title: v.string(),
      rationale: v.string(),
      aiRationale: v.optional(v.string()),
      role: v.string(),
      fixture: v.string(),
      expected: v.string(),
      validation: v.string(),
      maxRequests: v.number(),
      risk: v.string(),
      requiresApproval: v.boolean(),
      stopConditions: v.array(v.string()),
      verification: v.string(),
      status: v.string(),
      createdAt: v.number(),
    }).index("by_investigation", ["investigationId"]),

    dastApprovals: defineTable({
      owner: v.string(),
      investigationId: v.id("dastInvestigations"),
      planIds: v.array(v.id("dastPlans")),
      status: v.union(
        v.literal("PENDING"),
        v.literal("APPROVED"),
        v.literal("DENIED"),
        v.literal("EXPIRED"),
        v.literal("CONSUMED"),
      ),
      /** SHA-256 of the immutable plan fields; detects plan replacement. */
      planDigest: v.optional(v.string()),
      /** SHA-256 of target scope, policy and deployment version. */
      scopeDigest: v.optional(v.string()),
      /** 2 = canonical sorted-key serialization; absent = pre-v2 legacy digest. */
      digestVersion: v.optional(v.number()),
      /** Approval is stale after this timestamp and must be re-requested. */
      expiresAt: v.optional(v.number()),
      consumedAt: v.optional(v.number()),
      requestedAt: v.number(),
      decidedAt: v.optional(v.number()),
      decidedBy: v.optional(v.string()),
      note: v.optional(v.string()),
    }).index("by_investigation_status", ["investigationId", "status"]),

    dastExecutions: defineTable({
      owner: v.string(),
      investigationId: v.id("dastInvestigations"),
      planId: v.id("dastPlans"),
      testKey: v.string(),
      status: v.string(),
      requestCount: v.number(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      assertions: v.any(),
      result: v.any(),
      error: v.optional(v.string()),
    }).index("by_investigation", ["investigationId"]),

    dastFindings: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      investigationId: v.id("dastInvestigations"),
      planId: v.optional(v.id("dastPlans")),
      findingId: v.string(),
      testKey: v.string(),
      title: v.string(),
      category: v.string(),
      endpointId: v.optional(v.id("dastEndpoints")),
      method: v.string(),
      path: v.string(),
      deploymentVersion: v.string(),
      severity: v.string(),
      technicalSeverity: v.string(),
      businessImpact: v.string(),
      confidence: v.number(),
      status: v.string(),
      expected: v.string(),
      actual: v.string(),
      reproduction: v.any(),
      requestEvidence: v.string(),
      responseEvidence: v.string(),
      evidenceHash: v.string(),
      rootCause: v.string(),
      remediation: v.string(),
      ownerTeam: v.string(),
      affectedRoles: v.array(v.string()),
      discoveredAt: v.number(),
      verifiedAt: v.optional(v.number()),
      retestStatus: v.string(),
      retestHistory: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_owner_status", ["owner", "status"])
      .index("by_investigation", ["investigationId"])
      .index("by_finding_id", ["findingId"]),

    dastEvidence: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      findingId: v.optional(v.id("dastFindings")),
      investigationId: v.optional(v.id("dastInvestigations")),
      type: v.string(),
      label: v.string(),
      content: v.string(),
      sha256: v.string(),
      algorithm: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_created", ["owner", "createdAt"])
      .index("by_finding", ["findingId"])
      .index("by_investigation", ["investigationId"]),

    dastReports: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      investigationId: v.id("dastInvestigations"),
      title: v.string(),
      markdown: v.string(),
      summary: v.string(),
      findingCount: v.number(),
      metrics: v.any(),
      status: v.string(),
      generatedAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_investigation", ["investigationId"]),

    dastRetests: defineTable({
      owner: v.string(),
      findingId: v.id("dastFindings"),
      investigationId: v.id("dastInvestigations"),
      status: v.string(),
      outcome: v.string(),
      detail: v.string(),
      requestCount: v.number(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      evidenceHash: v.optional(v.string()),
    })
      .index("by_owner", ["owner"])
      .index("by_finding", ["findingId"])
      .index("by_investigation", ["investigationId"]),

    dastAudit: defineTable({
      owner: v.string(),
      applicationId: v.optional(v.id("dastApplications")),
      investigationId: v.optional(v.id("dastInvestigations")),
      type: v.string(),
      actor: v.string(),
      message: v.string(),
      severity: v.string(),
      metadata: v.any(),
      at: v.number(),
    })
      .index("by_owner_at", ["owner", "at"])
      .index("by_application_at", ["applicationId", "at"])
      .index("by_investigation", ["investigationId"]),

    dastOwners: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      team: v.string(),
      email: v.string(),
      createdAt: v.number(),
    })
      .index("by_owner_application", ["owner", "applicationId"])
      .index("by_application", ["applicationId"]),

    dastLabConfig: defineTable({
      applicationId: v.id("dastApplications"),
      mode: v.union(v.literal("VULNERABLE"), v.literal("FIXED")),
      refunds: v.any(),
      updatedAt: v.number(),
    }).index("by_application", ["applicationId"]),

    dastJobs: defineTable({
      owner: v.string(),
      applicationId: v.id("dastApplications"),
      investigationId: v.optional(v.id("dastInvestigations")),
      kind: v.string(),
      status: v.string(),
      attempts: v.number(),
      leaseUntil: v.optional(v.number()),
      payload: v.any(),
      lastError: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["owner"])
      .index("by_investigation", ["investigationId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
