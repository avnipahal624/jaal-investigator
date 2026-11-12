import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth, RequireConsumer } from "@/components/RequireAuth";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { SecurityShell } from "@/components/security/SecurityShell";
import { JaalProvider } from "@/state/JaalProvider";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.tsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.tsx"));
const InvestigationsPage = lazy(() => import("./pages/InvestigationsPage.tsx"));
const NewInvestigationPage = lazy(() => import("./pages/NewInvestigationPage.tsx"));
const InvestigationWorkspacePage = lazy(
  () => import("./pages/InvestigationWorkspacePage.tsx"),
);
const InvestigationCompletePage = lazy(
  () => import("./pages/InvestigationCompletePage.tsx"),
);
const AiIntelligencePage = lazy(() => import("./pages/AiIntelligencePage.tsx"));
const EvidencePage = lazy(() => import("./pages/EvidencePage.tsx"));
const ReportsPage = lazy(() => import("./pages/ReportsPage.tsx"));
const ReportDetailPage = lazy(() => import("./pages/ReportDetailPage.tsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.tsx"));

// Agentic DAST security console (isolated module, original console untouched).
const SecurityOverviewPage = lazy(() => import("./pages/security/OverviewPage.tsx"));
const SecurityInvestigationsPage = lazy(
  () => import("./pages/security/InvestigationsPage.tsx"),
);
const SecurityInvestigationDetailPage = lazy(
  () => import("./pages/security/InvestigationDetailPage.tsx"),
);
const SecurityApiExplorerPage = lazy(
  () => import("./pages/security/ApiExplorerPage.tsx"),
);
const SecurityKnowledgeGraphPage = lazy(
  () => import("./pages/security/KnowledgeGraphPage.tsx"),
);
const SecurityAgentsPage = lazy(() => import("./pages/security/AgentsPage.tsx"));
const SecurityVulnerabilitiesPage = lazy(
  () => import("./pages/security/VulnerabilitiesPage.tsx"),
);
const SecurityFindingDetailPage = lazy(
  () => import("./pages/security/FindingDetailPage.tsx"),
);
const SecurityDeploymentsPage = lazy(
  () => import("./pages/security/DeploymentsPage.tsx"),
);
const SecurityEvidencePage = lazy(
  () => import("./pages/security/EvidenceVaultPage.tsx"),
);
const SecurityReportsPage = lazy(() => import("./pages/security/ReportsPage.tsx"));
const SecurityReportDetailPage = lazy(
  () => import("./pages/security/ReportDetailPage.tsx"),
);
const SecuritySettingsPage = lazy(
  () => import("./pages/security/SafetySettingsPage.tsx"),
);

// Consumer routes (blue glassmorphism, Normal People experience).
const ConsumerLayout = lazy(
  () => import("./pages/consumer/Layout.tsx"),
);
const ConsumerDashboardPage = lazy(
  () => import("./pages/consumer/Dashboard.tsx"),
);
const ConsumerReportPage = lazy(
  () => import("./pages/consumer/Report.tsx"),
);
const ConsumerReportsPage = lazy(
  () => import("./pages/consumer/Reports.tsx"),
);
const ConsumerReportDetailPage = lazy(
  () => import("./pages/consumer/ReportDetail.tsx"),
);
const ConsumerProtectedPage = lazy(
  () => import("./pages/consumer/Protected.tsx"),
);
const ConsumerProfilePage = lazy(
  () => import("./pages/consumer/Profile.tsx"),
);
const ConsumerVoiceCallPage = lazy(
  () => import("./pages/consumer/VoiceCall.tsx"),
);
const ConsumerVoiceResultPage = lazy(
  () => import("./pages/consumer/VoiceResult.tsx"),
);
const ConsumerVoiceIntakePage = lazy(
  () => import("./pages/VoiceIntakePage.tsx"),
);

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="animate-pulse text-sm">Loading…</span>
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <JaalProvider>
          <BrowserRouter>
            <RouteSyncer />
            <RouteErrorBoundary>
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route
                    path="/auth"
                    element={<AuthPage redirectAfterAuth="/dashboard" />}
                  />
                  <Route path="/login" element={<LoginPage />} />

                  {/* Investigator routes — existing dark forensic shell, untouched. */}
                  <Route
                    element={
                      <RequireAuth>
                        <AppShell />
                      </RequireAuth>
                    }
                  >
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/investigations" element={<InvestigationsPage />} />
                    <Route path="/investigations/new" element={<NewInvestigationPage />} />
                    <Route path="/investigations/:id" element={<InvestigationWorkspacePage />} />
                    <Route path="/investigations/:id/intelligence" element={<AiIntelligencePage />} />
                    <Route
                      path="/investigations/:id/complete"
                      element={<InvestigationCompletePage />}
                    />
                    <Route path="/evidence" element={<EvidencePage />} />
                    <Route path="/voice-intake" element={<ConsumerVoiceIntakePage />} />
                    <Route
                      path="/voice-intake/:recordingId"
                      element={<ConsumerVoiceIntakePage />}
                    />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/reports/:id" element={<ReportDetailPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>

                  {/* Agentic DAST security console — isolated tables and routes. */}
                  <Route
                    element={
                      <RequireAuth>
                        <SecurityShell />
                      </RequireAuth>
                    }
                  >
                    <Route path="/security" element={<SecurityOverviewPage />} />
                    <Route
                      path="/security/investigations"
                      element={<SecurityInvestigationsPage />}
                    />
                    <Route
                      path="/security/investigations/:id"
                      element={<SecurityInvestigationDetailPage />}
                    />
                    <Route path="/security/apis" element={<SecurityApiExplorerPage />} />
                    <Route path="/security/graph" element={<SecurityKnowledgeGraphPage />} />
                    <Route path="/security/agents" element={<SecurityAgentsPage />} />
                    <Route
                      path="/security/vulnerabilities"
                      element={<SecurityVulnerabilitiesPage />}
                    />
                    <Route
                      path="/security/vulnerabilities/:id"
                      element={<SecurityFindingDetailPage />}
                    />
                    <Route path="/security/deployments" element={<SecurityDeploymentsPage />} />
                    <Route path="/security/evidence" element={<SecurityEvidencePage />} />
                    <Route path="/security/reports" element={<SecurityReportsPage />} />
                    <Route path="/security/reports/:id" element={<SecurityReportDetailPage />} />
                    <Route path="/security/settings" element={<SecuritySettingsPage />} />
                  </Route>

                  {/* Consumer routes — blue glassmorphism, Normal People experience. */}
                  <Route
                    element={
                      <RequireAuth>
                        <RequireConsumer>
                          <ConsumerLayout />
                        </RequireConsumer>
                      </RequireAuth>
                    }
                  >
                    <Route
                      path="/consumer/dashboard"
                      element={<ConsumerDashboardPage />}
                    />
                    <Route
                      path="/consumer/report"
                      element={<ConsumerReportPage />}
                    />
                    <Route
                      path="/consumer/voice"
                      element={<ConsumerVoiceCallPage />}
                    />
                    <Route
                      path="/consumer/voice/result"
                      element={<ConsumerVoiceResultPage />}
                    />
                    <Route
                      path="/consumer/reports"
                      element={<ConsumerReportsPage />}
                    />
                    <Route
                      path="/consumer/reports/:id"
                      element={<ConsumerReportDetailPage />}
                    />
                    <Route
                      path="/consumer/protected"
                      element={<ConsumerProtectedPage />}
                    />
                    <Route
                      path="/consumer/profile"
                      element={<ConsumerProfilePage />}
                    />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </BrowserRouter>
          <Toaster />
        </JaalProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
