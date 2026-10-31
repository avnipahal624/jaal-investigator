import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAuth,
} from "@/hooks/use-auth";
import {
  useRoleIntent,
} from "@/hooks/use-role.tsx";
import { ArrowRight, Loader2, Mail, UserX, Shield, User } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const {
    isLoading: authLoading,
    isAuthenticated,
    signIn,
  } = useAuth();
  const { intent, setIntent } = useRoleIntent();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const consumerRedirect = "/consumer/dashboard";
  const investigatorRedirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth ?? "/dashboard",
  );

  const redirect =
    intent === "consumer"
      ? consumerRedirect
      : investigatorRedirect;

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);

      navigate(redirect, { replace: true });
    } catch (error) {
      console.error(
        "OTP verification error:",
        error instanceof Error ? error.message : error,
      );

      setError("The verification code you entered is incorrect.");
      setIsLoading(false);

      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!intent) {
        setError(
          "Please choose whether you are reporting a scam or using investigation tools first.",
        );
        setIsLoading(false);
        return;
      }

      await signIn("anonymous");
      navigate(redirect, { replace: true });
    } catch (error) {
      console.error(
        "Guest login error:",
        error instanceof Error ? error.message : error,
      );
      setError(
        `Failed to sign in as guest: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  const selectAsConsumer = () => setIntent("consumer");
  const selectAsInvestigator = () => setIntent("investigator");

  return (
    <div className="theme-consumer min-h-screen flex flex-col relative overflow-hidden">
      {/* Soft sky background + decorative blobs */}
      <div className="fixed inset-0 -z-10 gradient-sky" aria-hidden="true" />
      <span
        className="blob w-[340px] h-[340px] top-[-60px] left-[-80px]"
        aria-hidden="true"
      />
      <span
        className="blob w-[260px] h-[260px] bottom-[-40px] right-[-60px]"
        aria-hidden="true"
      />

      <header className="flex items-center justify-center py-6 px-6 text-center">
        <div className="mx-auto flex flex-col items-center gap-1 max-w-sm text-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-lg font-semibold shadow-md">
              J
            </div>
            <span className="text-[var(--color-consumer-deep)] font-semibold text-2xl tracking-tight">
              JAAL
            </span>
          </div>
          <p className="text-[var(--color-consumer-muted)] text-sm font-medium">
            The digital net against scams.
          </p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div
          className="w-full max-w-[960px] mx-auto grid gap-10 lg:grid-cols-5 items-center"
          role="main"
        >
          {/* Role selection */}
          <div className="lg:col-span-2 space-y-4">
            <h1 className="text-[var(--color-consumer-deep)] text-3xl font-semibold tracking-tight text-balance">
              Choose how you want to use JAAL
            </h1>
            <p className="text-[var(--color-consumer-muted)] text-base leading-relaxed">
              JAAL has two experiences. Pick the one that fits what you need
              right now.
            </p>

            {/* Normal People card */}
            <button
              type="button"
              className={`group relative w-full rounded-2xl border-2 p-6 text-left transition-all duration-200 ${
                intent === "consumer"
                  ? "border-[var(--color-consumer-primary)] bg-[var(--color-consumer-glass-strong)] shadow-lg shadow-[var(--color-consumer-primary)]/10"
                  : "border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] hover:border-[var(--color-consumer-primary)]/50 hover:shadow-md"
              }`}
              onClick={selectAsConsumer}
              aria-pressed={intent === "consumer"}
            >
              <div className="flex gap-4 items-start">
                <div
                  className={`shrink-0 rounded-xl w-12 h-12 flex items-center justify-center text-white transition-colors ${
                    intent === "consumer"
                      ? "bg-[var(--color-consumer-primary)]"
                      : "bg-[var(--color-consumer-border)]"
                  }`}
                  aria-hidden="true"
                >
                  <User className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full transition-colors ${
                        intent === "consumer"
                          ? "bg-[var(--color-consumer-primary)]"
                          : "bg-[var(--color-consumer-border)]"
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-lg font-semibold ${
                        intent === "consumer"
                          ? "text-[var(--color-consumer-deep)]"
                          : "text-[var(--color-consumer-text)]"
                      }`}
                    >
                      Normal People
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      intent === "consumer"
                        ? "text-[var(--color-consumer-text-soft)]"
                        : "text-[var(--color-consumer-muted)]"
                    }`}
                  >
                    Report suspicious activity and stay safe.
                  </p>
                </div>
              </div>
            </button>

            {/* Investigator card */}
            <button
              type="button"
              className={`group relative w-full rounded-2xl border-2 p-6 text-left transition-all duration-200 ${
                intent === "investigator"
                  ? "border-[var(--color-consumer-primary)] bg-[var(--color-glass-strong)] shadow-lg shadow-[var(--color-consumer-primary)]/10"
                  : "border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] hover:border-[var(--color-consumer-primary)]/50 hover:shadow-md"
              }`}
              onClick={selectAsInvestigator}
              aria-pressed={intent === "investigator"}
            >
              <div className="flex gap-4 items-start">
                <div
                  className={`shrink-0 rounded-xl w-12 h-12 flex items-center justify-center text-white transition-colors ${
                    intent === "investigator"
                      ? "bg-[var(--color-consumer-primary)]"
                      : "bg-[var(--color-consumer-border)]"
                  }`}
                  aria-hidden="true"
                >
                  <Shield className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full transition-colors ${
                        intent === "investigator"
                          ? "bg-[var(--color-consumer-primary)]"
                          : "bg-[var(--color-consumer-border)]"
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-lg font-semibold ${
                        intent === "investigator"
                          ? "text-[var(--color-consumer-deep)]"
                          : "text-[var(--color-consumer-text)]"
                      }`}
                    >
                      Investigator
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      intent === "investigator"
                        ? "text-[var(--color-consumer-text-soft)]"
                        : "text-[var(--color-consumer-muted)]"
                    }`}
                  >
                    Access investigation tools and evidence.
                  </p>
                </div>
              </div>
            </button>

            <p className="text-xs text-[var(--color-consumer-muted)] leading-relaxed">
              Selecting Investigator on this screen does not grant
              investigator permissions. Access is enforced by JAAL on the
              backend.
            </p>

            {/* CTA card */}
            <Card
              className="glass-strong border-[var(--color-consumer-border)] shadow-md"
              style={{ borderRadius: "22px" }}
            >
              <form
                onSubmit={handleEmailSubmit}
                className="flex flex-col gap-4"
              >
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-[var(--color-consumer-deep)]">
                    Sign in to JAAL
                  </CardTitle>
                  <CardDescription className="text-[var(--color-consumer-muted)]">
                    Use your email. A one-time code will be sent to you.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-consumer-muted)]"
                        strokeWidth={1.75}
                      />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9 bg-white border-[var(--color-consumer-border)] text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      disabled={isLoading || !intent}
                      className="border-[var(--color-consumer-border)] text-[var(--color-consumer-primary)] hover:bg-[var(--color-consumer-primary-soft)]"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {error && (
                    <p className="text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)]">
                      {error}
                    </p>
                  )}

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 h-px bg-[var(--color-consumer-border)]" />
                    <span className="text-xs text-[var(--color-consumer-muted)] uppercase tracking-wider">
                      or
                    </span>
                    <div className="flex-1 h-px bg-[var(--color-consumer-border)]" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-[var(--color-consumer-border)] text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)]"
                    onClick={handleGuestLogin}
                    disabled={isLoading || !intent}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Continue as Guest
                  </Button>
                </CardContent>

                <CardFooter className="border-t border-[var(--color-consumer-border)] pt-3 flex-col gap-2 text-xs text-[var(--color-consumer-muted)] text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)]"
                    onClick={() => setStep("signIn")}
                    disabled={isLoading}
                  >
                    Use different email
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          {/* Right side illustration + reassurance */}
          <div className="lg:col-span-3 flex items-center justify-center">
            <div className="relative w-full max-w-md">
              <div className="glass-strong p-8 shadow-xl relative overflow-hidden">
                {/* Friendly illustration: two people checking a phone */}
                <div className="flex justify-center mb-6" aria-hidden="true">
                  <svg
                    viewBox="0 0 200 140"
                    className="w-full max-w-[200px]"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Older couple, simplified friendly forms */}
                    <circle
                      cx="70"
                      cy="42"
                      r="20"
                      fill="var(--color-consumer-primary)"
                      opacity="0.18"
                    />
                    <circle
                      cx="130"
                      cy="42"
                      r="20"
                      fill="var(--color-consumer-teal)"
                      opacity="0.22"
                    />
                    <rect
                      x="40"
                      y="62"
                      width="60"
                      height="60"
                      rx="16"
                      fill="var(--color-consumer-primary)"
                      opacity="0.16"
                    />
                    <rect
                      x="100"
                      y="62"
                      width="60"
                      height="60"
                      rx="16"
                      fill="var(--color-consumer-teal)"
                      opacity="0.18"
                    />
                    <rect
                      x="80"
                      y="78"
                      width="40"
                      height="56"
                      rx="10"
                      fill="var(--color-consumer-deep)"
                      opacity="0.12"
                    />
                    <rect
                      x="86"
                      y="84"
                      width="28"
                      height="44"
                      rx="6"
                      fill="var(--color-consumer-border)"
                    />
                  </svg>
                </div>

                <div className="text-center">
                  <h2 className="text-[var(--color-consumer-deep)] text-xl font-semibold">
                    Helping everyday people
                  </h2>
                  <p className="mt-3 text-[var(--color-consumer-muted)] text-sm leading-relaxed">
                    Report what happened. JAAL organises the details, checks
                    for warning signs, and shows you practical next steps.
                  </p>
                  <ul className="mt-5 flex flex-col gap-2 text-left text-sm text-[var(--color-consumer-text-soft)]">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-[var(--color-consumer-teal)] text-base leading-none">
                        ✓
                      </span>
                      Report in plain language — no jargon
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-[var(--color-consumer-teal)] text-base leading-none">
                        ✓
                      </span>
                      Clear, readable warning signs
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-[var(--color-consumer-teal)] text-base leading-none">
                        ✓
                      </span>
                      Practical advice for next steps
                    </li>
                  </ul>
                </div>
              </div>

              {/* Shield footer */}
              <div
                className="mt-6 text-center text-xs text-[var(--color-consumer-muted)]"
                aria-label="Trustline"
              >
                <div className="inline-flex items-center gap-2">
                  <Shield
                    className="w-4 h-4 text-[var(--color-consumer-teal)]"
                    strokeWidth={1.75}
                  />
                  <span className="font-medium text-[var(--color-consumer-teal)]">
                    Together for a Safer Digital India.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* OTP step */}
      {step !== "signIn" && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-title"
        >
          <div className="glass-strong p-8 shadow-2xl w-full max-w-sm">
            <CardHeader className="text-center pb-2">
              <CardTitle id="otp-title" className="text-[var(--color-consumer-deep)]">
                Check your email
              </CardTitle>
              <CardDescription className="text-[var(--color-consumer-muted)]">
                We sent a code to {step.email}
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <CardContent className="flex flex-col items-center gap-4">
                <InputOTP
                  value={otp}
                  onChange={setOtp}
                  maxLength={6}
                  disabled={isLoading}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      otp.length === 6 &&
                      !isLoading
                    ) {
                      const form = (
                        event.target as HTMLElement
                      ).closest("form");
                      if (form) {
                        form.requestSubmit();
                      }
                    }
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="bg-white border-[var(--color-consumer-border)] text-[var(--color-consumer-text)] focus:border-[var(--color-consumer-primary)]"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                {error && (
                  <p className="text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)] w-full text-center">
                    {error}
                  </p>
                )}

                <p className="text-sm text-[var(--color-consumer-muted)] text-center">
                  Didn't receive a code?{" "}
                  <Button
                    variant="link"
                    className="p-0 h-auto text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)]"
                    onClick={() => setStep("signIn")}
                  >
                    Try again
                  </Button>
                </p>
              </CardContent>

              <CardFooter className="border-t border-[var(--color-consumer-border)] pt-3">
                <Button
                  type="submit"
                  className="w-full btn-primary shadow-md"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify code
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
