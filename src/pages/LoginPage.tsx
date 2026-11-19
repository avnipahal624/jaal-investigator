import { NetworkBackdrop } from "@/components/login/NetworkBackdrop";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useJaal } from "@/state/JaalProvider";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/formatters";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Radio,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useConvexAuth } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";

const REMEMBER_KEY = "jaal.rememberEmail";

export default function LoginPage() {
  const { signInDemo, state } = useJaal();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/dashboard";
  // A local demo label alone is not an identity — only re-enter the console
  // once Convex Auth confirms one, otherwise RequireAuth bounces us straight
  // back here and we loop.
  const { isAuthenticated: hasIdentity } = useConvexAuth();

  const [email, setEmail] = useState(
    () => localStorage.getItem(REMEMBER_KEY) ?? "",
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | "login" | "demo">(null);
  const [sessionStamp] = useState(() => formatDateTime(Date.now()));

  // Already has a session → go straight to the console.
  useEffect(() => {
    if (state.user && hasIdentity) navigate(returnTo, { replace: true });
  }, [state.user, hasIdentity, navigate, returnTo]);

  const finish = () => {
    navigate(returnTo, { replace: true });
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid operator email address.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setLoading("login");
    await new Promise((r) => setTimeout(r, 700));
    if (remember) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
    const ok = await signInDemo(email.split("@")[0] || "Operator", email);
    setLoading(null);
    if (!ok) {
      setError(
        "Could not establish a session. Check your connection and try again.",
      );
      return;
    }
    finish();
  };

  const handleDemo = async () => {
    setError(null);
    setLoading("demo");
    await new Promise((r) => setTimeout(r, 550));
    const ok = await signInDemo("Simulation Operator", "operator@jaal.demo");
    setLoading(null);
    if (!ok) {
      setError(
        "Could not start a simulation session. Check your connection and try again.",
      );
      return;
    }
    finish();
  };

  return (
    <div className="metal-page relative min-h-screen overflow-hidden">
      <NetworkBackdrop />
      <div className="metal-orb pointer-events-none absolute -left-16 top-24 hidden size-36 opacity-50 lg:block" />
      <div className="metal-halo pointer-events-none absolute -right-20 bottom-10 hidden h-72 w-72 opacity-40 lg:block" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-5 py-10 lg:grid lg:grid-cols-[3fr_2fr] lg:items-center lg:gap-16 lg:px-10">
        {/* Brand side */}
        <motion.div
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-xl"
        >
          <div className="flex items-center gap-3">
            <div className="jaal-logo-metal relative flex size-11 items-center justify-center rounded-sm">
              <span className="font-mono text-base font-bold">JA</span>
              <span className="absolute -right-1 -top-1 size-1.5 bg-jamber jaal-pulse" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-[0.4em] text-jtext">JAAL</p>
              <p className="jaal-label mt-1">Cyber forensics console</p>
            </div>
          </div>

          <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight text-jtext sm:text-4xl">
            Every message is a clue.
            <br />
            <span className="metal-text">Turn the scammer into the evidence.</span>
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-jmuted">
            Run a controlled decoy conversation, watch the scam kill-chain
            unfold, extract suspicious identifiers and seal every item with a
            SHA-256 integrity hash.
          </p>

          <ul className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {[
              "Live kill-chain tracking",
              "Tactic detection engine",
              "Evidence integrity hashing",
              "Structured evidence reports",
            ].map((item) => (
              <li
                key={item}
                className="metal-card flex items-center gap-2 rounded-sm px-3 py-2 text-[11px] text-jmuted"
              >
                <span className="size-1 shrink-0 bg-jcyan" />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-jmuted/70">
            {sessionStamp} · session node idle
          </p>
        </motion.div>

        {/* Terminal login side */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="w-full max-w-md justify-self-end"
        >
          <div className="metal-surface jaal-hud relative rounded-md p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="jaal-label">Terminal access</p>
                <p className="mt-1 text-sm font-semibold text-jtext">
                  Sign in to the console
                </p>
              </div>
              <LockKeyhole className="size-4 text-jcyan" />
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="jaal-label">
                  Operator email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="operator@jaal.demo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-jborder/70 bg-jsurface font-mono text-sm text-jtext placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="jaal-label">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-jborder/70 bg-jsurface pr-10 font-mono text-sm text-jtext placeholder:text-jmuted/50 focus-visible:border-jcyan/70 focus-visible:ring-jcyan/40"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-jmuted transition-colors hover:text-jcyan"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-jmuted">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                    className="size-3.5 border-jborder data-[state=checked]:border-jcyan data-[state=checked]:bg-jcyan data-[state=checked]:text-background"
                  />
                  Remember me
                </label>
                <span className="font-mono text-[10px] text-jmuted/60">
                  sha-256 · local
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 border border-jred/40 bg-jred/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-jred" />
                  <p className="text-xs text-jred">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading !== null}
                className="metal-button w-full cursor-pointer gap-2 rounded-sm font-semibold"
              >
                {loading === "login" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {loading === "login" ? "Authenticating…" : "Login"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-jborder/70" />
              <span className="jaal-label">or</span>
              <span className="h-px flex-1 bg-jborder/70" />
            </div>

            <Button
              type="button"
              onClick={handleDemo}
              disabled={loading !== null}
              variant="outline"
              className={cn(
                "metal-button-ghost w-full cursor-pointer gap-2 rounded-sm",
              )}
            >
              {loading === "demo" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" />
              )}
              {loading === "demo" ? "Opening simulation…" : "Enter simulation (demo)"}
            </Button>

            <div className="mt-4 space-y-2 border-t border-jborder/60 pt-4">
              <p className="text-[11px] leading-relaxed text-jmuted">
                <span className="text-jamber">Local demo session.</span> This
                frontend demo stores a clearly-labelled simulation session on
                this device — no credentials are transmitted. For a full
                account, use{" "}
                <Link
                  to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
                  className="text-jcyan underline underline-offset-2 hover:text-jtext"
                >
                  account sign-in
                </Link>
                .
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-jmuted/60">
                Synthetic conversations only — no real scammers contacted
              </p>
            </div>
          </div>

          <Link
            to="/"
            className="mt-4 block text-center text-xs text-jmuted transition-colors hover:text-jcyan"
          >
            ← Back to landing
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
