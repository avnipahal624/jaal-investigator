import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Circle, Loader2, MinusCircle, ShieldAlert } from "lucide-react";

type Answers = {
  codeShared: boolean;
  moneySent: boolean;
  linkOpened: boolean;
  authorityClaimed: boolean;
};
type ActionRow = {
  actionKey: string;
  title: string;
  reason: string;
  priority: "now" | "soon" | "optional";
  trigger: string;
  status: "not_started" | "done" | "not_applicable";
};

const PRIORITY_STYLE: Record<ActionRow["priority"], string> = {
  now: "border-jred/40 bg-jred/10 text-jred",
  soon: "border-jamber/40 bg-jamber/10 text-jamber",
  optional: "border-jborder/60 bg-jsurface text-jmuted",
};

const QUESTIONS: Array<{ key: keyof Answers; label: string; help: string }> = [
  { key: "codeShared", label: "Was a code or password shared?", help: "Only answer yes if it was actually shared." },
  { key: "moneySent", label: "Was money sent?", help: "A payment request alone is not a transfer." },
  { key: "linkOpened", label: "Was the link opened?", help: "This changes the account-check advice." },
  { key: "authorityClaimed", label: "Did they claim to be an authority?", help: "Police, bank, delivery company or support." },
];

export function CaseActionsPanel({ caseId }: { caseId: string }) {
  const data = useQuery(api.caseWorkspace.getCaseActions, { caseId }) as
    | { answers: Answers; actions: ActionRow[] }
    | undefined;
  const saveAnswers = useMutation(api.caseWorkspace.setCaseAnswers);
  const setStatus = useMutation(api.caseWorkspace.setCaseActionStatus);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="jaal-panel flex items-center gap-2 p-6 text-xs text-jmuted">
        <Loader2 className="size-4 animate-spin text-jcyan" /> Reading case conditions…
      </div>
    );
  }

  const updateAnswer = async (key: keyof Answers, value: boolean) => {
    setError(null);
    try {
      await saveAnswers({ caseId, ...data.answers, [key]: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the answer.");
    }
  };

  const updateStatus = async (actionKey: string, status: ActionRow["status"]) => {
    setError(null);
    try {
      await setStatus({ caseId, actionKey, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the action status.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="jaal-label !text-jcyan">What should I do now?</p>
        <h2 className="mt-1 text-lg font-semibold text-jtext">Actions generated from this case</h2>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-jmuted">
          These suggestions come from what is actually present in this case. JAAL does not contact anyone, freeze
          accounts or report automatically. You mark each action yourself.
        </p>
      </div>

      <section className="jaal-panel p-4">
        <p className="jaal-label">A few direct questions</p>
        <p className="mt-1 text-[10px] text-jmuted">
          None of these are inferred from a request. Answer only what you know.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {QUESTIONS.map((question) => (
            <div key={question.key} className="border border-jborder/60 bg-jsurface/40 p-3">
              <p className="text-[11px] text-jtext">{question.label}</p>
              <p className="mt-0.5 text-[10px] text-jmuted">{question.help}</p>
              <div className="mt-2 flex gap-1">
                {[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => void updateAnswer(question.key, option.value)}
                    className={cn(
                      "border px-3 py-1 font-mono text-[9px] uppercase tracking-wider",
                      data.answers[question.key] === option.value
                        ? option.value
                          ? "border-jamber/50 bg-jamber/10 text-jamber"
                          : "border-jcyan/40 bg-jcyan/10 text-jcyan"
                        : "border-jborder/60 text-jmuted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-2">
        {data.actions.map((action) => (
          <section
            key={action.actionKey}
            className={cn(
              "border p-3.5",
              action.status === "done"
                ? "border-jgreen/40 bg-jgreen/5"
                : action.status === "not_applicable"
                  ? "border-jborder/50 bg-jsurface/30 opacity-70"
                  : "border-jborder/70 bg-jsurface/40",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider", PRIORITY_STYLE[action.priority])}>
                    {action.priority}
                  </span>
                  <h3 className="text-[12px] font-medium text-jtext">{action.title}</h3>
                  {action.status === "done" && <Check className="size-3.5 text-jgreen" />}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-jmuted">{action.reason}</p>
                <p className="mt-1 text-[10px] text-jmuted/70">
                  <span className="text-jcyan">Why this appears:</span> {action.trigger}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void updateStatus(action.actionKey, action.status === "done" ? "not_started" : "done")}
                  className={cn(
                    "border px-2 py-1 font-mono text-[8px] uppercase tracking-wider",
                    action.status === "done" ? "border-jgreen/50 bg-jgreen/10 text-jgreen" : "border-jborder/60 text-jmuted hover:text-jtext",
                  )}
                >
                  <Check className="mr-1 inline size-2.5" /> Done
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void updateStatus(
                      action.actionKey,
                      action.status === "not_applicable" ? "not_started" : "not_applicable",
                    )
                  }
                  className={cn(
                    "border px-2 py-1 font-mono text-[8px] uppercase tracking-wider",
                    action.status === "not_applicable" ? "border-jborder/80 bg-jsurface text-jtext" : "border-jborder/60 text-jmuted",
                  )}
                >
                  <MinusCircle className="mr-1 inline size-2.5" /> N/A
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="flex items-start gap-2 border border-jborder/60 bg-jsurface/30 p-3 text-[10px] leading-relaxed text-jmuted">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-jamber" />
        <span>
          If money was sent, contact your bank using the number on its official card or website — not a number from
          the suspicious conversation. JAAL cannot guarantee recovery or removal of content.
        </span>
      </div>
      {data.actions.every((action) => action.status === "not_started") && (
        <p className="flex items-center gap-2 text-[10px] text-jmuted">
          <Circle className="size-3" /> Mark an action when you have actually completed it.
        </p>
      )}
      {error && (
        <p className="flex items-center gap-2 text-[11px] text-jred">
          <AlertTriangle className="size-3.5" /> {error}
        </p>
      )}
    </div>
  );
}
