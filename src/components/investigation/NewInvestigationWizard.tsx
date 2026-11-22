import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { useJaal, type CreateCaseInput } from "@/state/JaalProvider";
import {
  SCAM_CATEGORIES,
  type ScamCategory,
} from "@/types/investigation";
import { SCENARIOS, scenarioKeyForCategory } from "@/data/scenarios";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  FileText,
  Radio,
  Upload,
  Wand2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

const STEPS = [
  { id: 1, label: "Case setup" },
  { id: 2, label: "Conversation source" },
  { id: 3, label: "Investigation settings" },
];

const INIT_SEQUENCE = [
  "INITIALIZING CASE",
  "LOADING ANALYSIS ENGINE",
  "PREPARING CONVERSATION",
  "CASE READY",
];

type Source = "simulation" | "import";

export function NewInvestigationWizard() {
  const { state, createCase } = useJaal();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "initializing">("form");
  const [initIndex, setInitIndex] = useState(0);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ScamCategory>(
    state.settings.investigation.defaultCategory,
  );
  const [scenarioKey, setScenarioKey] = useState<string>(() =>
    scenarioKeyForCategory(state.settings.investigation.defaultCategory),
  );
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [source, setSource] = useState<Source>("simulation");
  const [transcript, setTranscript] = useState("");

  const [tacticDetection, setTacticDetection] = useState(true);
  const [identifierExtraction, setIdentifierExtraction] = useState(
    state.settings.investigation.autoExtract,
  );
  const [integrityHashing, setIntegrityHashing] = useState(
    state.settings.investigation.autoHash,
  );
  const [aiSuggestions, setAiSuggestions] = useState(
    state.settings.investigation.aiSuggestions,
  );

  const next = () => {
    setError(null);
    if (step === 1) {
      if (title.trim().length < 3) {
        setError("Give the investigation a title (at least 3 characters).");
        return;
      }
      if (description.trim().length < 10) {
        setError("Add a short case description so reports have context.");
        return;
      }
    }
    if (step === 2 && source === "import" && transcript.trim().length < 10) {
      setError("Paste at least one message line (e.g. “Scammer: …”).");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setTranscript(await file.text());
    setError(null);
  };

  const start = async () => {
    setPhase("initializing");
    setInitIndex(0);
    for (let i = 0; i < INIT_SEQUENCE.length; i++) {
      setInitIndex(i);
      await new Promise((r) => setTimeout(r, 420));
    }
    const input: CreateCaseInput = {
      title: title.trim(),
      category,
      description: description.trim(),
      notes: notes.trim(),
      source: source === "simulation" ? "simulation" : "import",
      scenarioKey:
        source === "simulation"
          ? scenarioKey || scenarioKeyForCategory(category)
          : undefined,
      detectionMode: state.settings.investigation.defaultDetectionMode,
      flags: { tacticDetection, identifierExtraction, integrityHashing, aiSuggestions },
      transcript: source === "simulation" ? undefined : transcript,
    };
    const caseId = createCase(input);
    navigate(`/investigations/${caseId}`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="jaal-label !text-jcyan">Case creation · controlled simulation</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
          New investigation
        </h1>
      </header>

      {/* Horizontal step indicator */}
      <div className="mb-6 flex items-center">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <div
              className={cn(
                "flex items-center gap-2 border px-3 py-2 transition-colors",
                step === s.id
                  ? "border-jcyan/60 bg-jcyan/10"
                  : step > s.id
                    ? "border-jteal/40 bg-jteal/5"
                    : "border-jborder/60 bg-jsurface",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center border font-mono text-[10px]",
                  step === s.id
                    ? "border-jcyan text-jcyan"
                    : step > s.id
                      ? "border-jteal text-jteal"
                      : "border-jborder text-jmuted/60",
                )}
              >
                {step > s.id ? "✓" : s.id}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest",
                  step === s.id ? "text-jcyan" : step > s.id ? "text-jteal" : "text-jmuted/60",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "mx-2 h-px flex-1",
                  step > s.id ? "bg-jteal/50" : "bg-jborder",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="jaal-panel jaal-hud relative p-5">
          <AnimatePresence mode="wait">
            {phase === "form" ? (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22 }}
              >
                {/* STEP 1 — case setup */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="title" className="jaal-label">
                        Investigation name
                      </Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Digital arrest scam — parcel flag"
                        className="border-jborder/70 bg-jsurface text-jtext placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="jaal-label">Synthetic scenario</Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {SCENARIOS.map((scenario) => (
                          <button
                            key={scenario.key}
                            type="button"
                            onClick={() => {
                              setScenarioKey(scenario.key);
                              setCategory(scenario.category as ScamCategory);
                              if (!title.trim()) setTitle(scenario.title);
                              if (!description.trim()) setDescription(scenario.description);
                            }}
                            className={cn(
                              "border px-3 py-2.5 text-left transition-colors",
                              scenarioKey === scenario.key
                                ? "border-jcyan/60 bg-jcyan/10"
                                : "border-jborder/70 bg-jsurface hover:border-jcyan/40",
                            )}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-jtext">{scenario.title}</span>
                              <span className="font-mono text-[8px] uppercase tracking-wider text-jamber">SIM</span>
                            </span>
                            <span className="mt-1 block text-[10px] leading-relaxed text-jmuted">
                              {scenario.badge} · {scenario.turns.length} scripted turns
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="jaal-label">Scam category</Label>
                      <Select
                        value={category}
                        onValueChange={(v) => {
                          setCategory(v as ScamCategory);
                          setScenarioKey(scenarioKeyForCategory(v));
                        }}
                      >
                        <SelectTrigger className="border-jborder/70 bg-jsurface text-jtext focus:ring-jcyan/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-jborder/80 bg-popover text-jtext">
                          {SCAM_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="desc" className="jaal-label">
                        Short description
                      </Label>
                      <Textarea
                        id="desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="What does this simulation aim to demonstrate?"
                        className="border-jborder/70 bg-jsurface text-jtext placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="notes" className="jaal-label">
                        Internal notes (optional)
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="Analyst-only notes shown in reports"
                        className="border-jborder/70 bg-jsurface text-jtext placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 2 — conversation source */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSource("simulation")}
                        className={cn(
                          "flex flex-col gap-2 border p-4 text-left transition-colors",
                          source === "simulation"
                            ? "border-jcyan/60 bg-jcyan/10"
                            : "border-jborder/70 bg-jsurface hover:border-jcyan/40",
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <Radio
                            className={cn(
                              "size-5",
                              source === "simulation" ? "text-jcyan" : "text-jmuted",
                            )}
                          />
                          <Chip tone="border-jamber/50 bg-jamber/10 text-jamber">
                            default
                          </Chip>
                        </span>
                        <span className="text-sm font-semibold text-jtext">
                          Simulated scam conversation
                        </span>
                        <span className="text-[11px] leading-relaxed text-jmuted">
                          Start a controlled synthetic conversation with a scammer
                          simulation. Contextual branches respond to your questions.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSource("import")}
                        className={cn(
                          "flex flex-col gap-2 border p-4 text-left transition-colors",
                          source === "import"
                            ? "border-jcyan/60 bg-jcyan/10"
                            : "border-jborder/70 bg-jsurface hover:border-jcyan/40",
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <Upload
                            className={cn(
                              "size-5",
                              source === "import" ? "text-jcyan" : "text-jmuted",
                            )}
                          />
                        </span>
                        <span className="text-sm font-semibold text-jtext">
                          Import transcript
                        </span>
                        <span className="text-[11px] leading-relaxed text-jmuted">
                          Paste or upload a text transcript for analysis. Lines use
                          the form “Name: message”.
                        </span>
                      </button>
                    </div>

                    <div className="flex gap-2 border border-jamber/40 bg-jamber/10 p-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-jamber" />
                      <p className="text-[11px] leading-relaxed text-jmuted">
                        This mode uses <span className="text-jamber">synthetic scam
                        data</span>. JAAL never contacts real scammers or any
                        third party — all messages are generated locally.
                      </p>
                    </div>

                    {source === "import" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="transcript" className="jaal-label">
                            Transcript
                          </Label>
                          <>
                            <input
                              ref={fileRef}
                              type="file"
                              accept=".txt,.text,text/plain"
                              className="hidden"
                              onChange={(e) => handleFile(e.target.files?.[0])}
                            />
                            <button
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="flex items-center gap-1.5 border border-jborder/70 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-jmuted transition-colors hover:border-jcyan/50 hover:text-jcyan"
                            >
                              <Upload className="size-3" /> Upload .txt
                            </button>
                          </>
                        </div>
                        <Textarea
                          id="transcript"
                          value={transcript}
                          onChange={(e) => setTranscript(e.target.value)}
                          rows={7}
                          placeholder={"Scammer: Your parcel is flagged…\nMe: Who is this?\nScammer: Inspector, Cyber Crime Division…"}
                          className="border-jborder/70 bg-jsurface font-mono text-xs text-jtext placeholder:text-jmuted/40 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3 — investigation settings */}
                {step === 3 && (
                  <div className="divide-y divide-jborder/50 border border-jborder/70">
                    {[
                      {
                        checked: tacticDetection,
                        onChange: setTacticDetection,
                        title: "Scam tactic analysis",
                        icon: Wand2,
                        desc: "Detect authority claims, fear, urgency, payment and isolation patterns.",
                      },
                      {
                        checked: identifierExtraction,
                        onChange: setIdentifierExtraction,
                        title: "Identifier extraction",
                        icon: FileText,
                        desc: "Pull UPI IDs, phone numbers, URLs and payment amounts into evidence.",
                      },
                      {
                        checked: integrityHashing,
                        onChange: setIntegrityHashing,
                        title: "Evidence hashing",
                        icon: CheckCircle2,
                        desc: "Record SHA-256 hashes so content changes can be detected later.",
                      },
                      {
                        checked: aiSuggestions,
                        onChange: setAiSuggestions,
                        title: "AI investigation suggestions",
                        icon: Brain,
                        desc: "Propose the next decoy question from the live conversation context.",
                      },
                    ].map((row) => (
                      <div
                        key={row.title}
                        className="flex items-start justify-between gap-4 p-3"
                      >
                        <div className="flex gap-2.5">
                          <row.icon className="mt-0.5 size-4 shrink-0 text-jcyan" />
                          <div>
                            <p className="text-xs font-semibold text-jtext">
                              {row.title}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-jmuted">
                              {row.desc}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={row.checked}
                          onCheckedChange={row.onChange}
                          className="data-[state=checked]:bg-jcyan data-[state=checked]:text-background"
                        />
                      </div>
                    ))}
                    <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-jmuted/70">
                      all features enabled by default · safe simulation configuration
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mt-4 flex items-start gap-2 border border-jred/40 bg-jred/10 px-3 py-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-jred" />
                    <p className="text-xs text-jred">{error}</p>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={back}
                    disabled={step === 1}
                    className="cursor-pointer gap-2 border-jborder/70 text-jmuted hover:text-jtext disabled:opacity-40"
                  >
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  {step < 3 ? (
                    <Button
                      onClick={next}
                      className="cursor-pointer gap-2 bg-jcyan font-semibold text-background hover:bg-jcyan/85"
                    >
                      Continue <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={start}
                      className="cursor-pointer gap-2 bg-jgreen font-semibold text-background hover:bg-jgreen/85"
                    >
                      <Cpu className="size-4" /> Initialize investigation
                    </Button>
                  )}
                </div>
              </motion.div>
            ) : (
              /* INIT SEQUENCE */
              <motion.div
                key="init"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-6"
              >
                <div className="mb-5 flex items-center gap-3">
                  <FileText className="size-4 text-jcyan" />
                  <div>
                    <p className="jaal-label">Case initialisation</p>
                    <p className="text-sm font-semibold text-jtext">{title}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {INIT_SEQUENCE.map((line, i) => (
                    <li
                      key={line}
                      className={cn(
                        "flex items-center gap-2 font-mono text-xs uppercase tracking-widest transition-opacity",
                        i <= initIndex ? "opacity-100" : "opacity-30",
                      )}
                    >
                      {i < initIndex ? (
                        <CheckCircle2 className="size-3.5 text-jgreen" />
                      ) : i === initIndex ? (
                        <span className="size-3.5 border border-jcyan jaal-pulse" />
                      ) : (
                        <span className="size-3.5 border border-jborder" />
                      )}
                      <span className={i <= initIndex ? "text-jcyan" : "text-jmuted"}>
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 h-1 w-full overflow-hidden bg-jsurface">
                  <motion.div
                    className="h-full bg-jcyan"
                    initial={{ width: "0%" }}
                    animate={{ width: `${((initIndex + 1) / INIT_SEQUENCE.length) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right — small case preview */}
        <aside className="jaal-panel h-fit p-4">
          <p className="jaal-label">Case preview</p>
          <p className="mt-3 font-mono text-[11px] tracking-wider text-jcyan">
            JAAL-{String(state.investigations.length + 1).padStart(3, "0")}
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-jtext">
            {title.trim() || "Untitled investigation"}
          </p>
          <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-jmuted">
            {description.trim() || "No description yet."}
          </p>
          <div className="mt-3 space-y-1.5 border-t border-jborder/60 pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="jaal-label !text-[9px]">Category</span>
              <span className="truncate font-mono text-[10px] text-jtext">
                {category}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="jaal-label !text-[9px]">Source</span>
              <span className="font-mono text-[10px] text-jtext">
                {source === "simulation" ? "Simulated" : "Imported"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="jaal-label !text-[9px]">Status</span>
              <Chip tone="border-jcyan/50 bg-jcyan/10 text-jcyan" pulse>
                simulation
              </Chip>
            </div>
          </div>
        </aside>
      </div>

      <button
        type="button"
        onClick={() => navigate("/investigations")}
        className="mt-4 text-xs text-jmuted transition-colors hover:text-jcyan"
      >
        ← Back to investigations
      </button>
    </div>
  );
}
