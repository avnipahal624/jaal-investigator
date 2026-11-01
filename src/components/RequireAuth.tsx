import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock, Radio } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate } from "react-router";

/**
 * Wraps a route that requires a signed-in user.
 *
 * Signed-out visitors used to be bounced straight to `/auth`, which left them
 * on a bare sign-in form with no idea which page they had asked for or why they
 * were moved. The block is now stated on the page they landed on, and sign-in
 * still returns them to it via `returnTo`. Pass `redirectImmediately` for a
 * route where the bounce really is the better experience.
 */
export function RequireConsumer({
  children,
  title = "Normal People sign-in required",
  description = "This section is for the Normal People experience. Investigators sign in through the investigator console.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={signInHref} replace />;
  }

  return children;
}

export function RequireAuth({
  children,
  title = "Sign in to continue",
  description = "This page is only available to signed-in users.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to `/auth`. */
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  // A local demo session is only a UI label (name, email, "simulation");
  // badge) — it is not an identity. Every case-scoped query is owner-checked
  // identity makes those queries reject and takes the whole route tree down
  // with them. Wait for the real identity, then block if there isn't one.
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;
    const simulationHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="jaal-grid flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md border-border/70 bg-card">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Lock className="size-5 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            You'll come straight back to this page once you're signed in.
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full cursor-pointer" onClick={() => signInHref}>
              Sign in
            </Button>
            <Button
              variant="outline"
              className="w-full cursor-pointer gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => simulationHref}
            >
              <Radio className="size-4" />
              Open simulation login
            </Button>
            <Button
              variant="ghost"
              className="w-full cursor-pointer text-muted-foreground"
              onClick={() => "/"}
            >
              Back to home
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
