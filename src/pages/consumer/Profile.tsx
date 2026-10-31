import { useState } from "react";
import { Link } from "react-router";
import { User, Shield, LogOut, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRoleIntent } from "@/hooks/use-role";

export default function ConsumerProfilePage() {
  const { user, signOut } = useAuth();
  const { intent } = useRoleIntent();
  const [signingOut, setSigningOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut?.();
      setSignedOut(true);
    } catch (error) {
      console.error("signOut error:", error);
    } finally {
      setSigningOut(false);
    }
  };

  if (signedOut) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-14 h-14 rounded-full bg-[var(--color-consumer-mint)] text-[var(--color-consumer-teal)] flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)]">
          You've been signed out
        </h1>
        <p className="mt-2 text-[var(--color-consumer-muted)]">
          You can sign back in whenever you're ready.
        </p>
        <Link
          to="/auth"
          className="mt-5 inline-flex items-center gap-2 btn-primary px-5 py-2.5 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
        >
          Sign in again
          <Shield className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <User className="w-6 h-6 text-[var(--color-consumer-primary)]" />
          Profile
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)] text-base">
          Your JAAL account details.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Account card */}
        <div className="md:col-span-2 glass-strong p-6 shadow-md">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-2xl font-semibold shadow-md">
              {(user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U")}
            </div>
            <div>
              <p className="text-lg font-semibold text-[var(--color-consumer-deep)]">
                {user?.name ?? "Normal People"}
              </p>
              <p className="text-sm text-[var(--color-consumer-muted)] flex items-center gap-1.5 mt-0.5">
                <Mail className="w-4 h-4" />
                {user?.email ?? "—"}
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3 border-b border-[var(--color-consumer-border)] pb-3">
              <span className="text-[var(--color-consumer-muted)]">Account type</span>
              <span className="text-[var(--color-consumer-text)] font-medium flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                {intent === "consumer" ? "Normal People" : intent === "investigator" ? "Investigator" : "Not selected"}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-b border-[var(--color-consumer-border)] pb-3">
              <span className="text-[var(--color-consumer-muted)]">Email</span>
              <span className="text-[var(--color-consumer-text)]">
                {user?.email ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[var(--color-consumer-muted)]">Sign-in method</span>
              <span className="text-[var(--color-consumer-text)]">Email code</span>
            </div>
          </div>
        </div>

        {/* Privacy / reassurance card */}
        <div className="glass p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
            Your privacy
          </h2>
          <ul className="mt-3 space-y-2 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
            <li>Your reports are visible only to you.</li>
            <li>We do not publish your reports publicly.</li>
            <li>You can view or revisit your own reports in My Reports.</li>
          </ul>
        </div>
      </div>

      {/* Sign-out */}
      <div className="mt-6 glass p-5 shadow-sm flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-consumer-deep)]">
            Sign out
          </p>
          <p className="text-xs text-[var(--color-consumer-muted)] mt-0.5">
            Sign out of your JAAL account on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-[var(--color-consumer-border)] bg-white text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-glass)] disabled:opacity-60 transition-colors"
        >
          {signingOut ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing out...
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              Sign out
            </>
          )}
        </button>
      </div>

      {/* Trustline */}
      <div className="mt-8 flex items-center justify-between text-xs text-[var(--color-consumer-muted)]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
          <span className="font-medium text-[var(--color-consumer-teal)]">
            Together for a Safer Digital India.
          </span>
        </div>
        <Link
          to="/consumer/dashboard"
          className="inline-flex items-center gap-1 text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
