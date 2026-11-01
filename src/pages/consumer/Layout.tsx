import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Outlet, Link, useNavigate } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import {
  House,
  FileWarning,
  FileCheck,
  Shield,
  User,
  Menu,
  X,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";

import { CATEGORIES } from "./Report";
import ConsumerReportPage from "./Report";


const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/consumer/dashboard", icon: House },
  { id: "report", label: "Report a Scam", href: "/consumer/report", icon: FileWarning },
  { id: "reports", label: "My Reports", href: "/consumer/reports", icon: FileCheck },
  { id: "protected", label: "Stay Protected", href: "/consumer/protected", icon: Shield },
  { id: "help", label: "Help Centre", href: "/consumer/protected#help", icon: HelpCircle },
  { id: "profile", label: "Profile", href: "/consumer/profile", icon: User },
];

export default function ConsumerLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const sheetRef = useRef<HTMLDialogElement>(null);

  // Guard: the consumer dashboard is scoped to the Normal People experience.
  // Investigator accounts are not routed here — their real authority lives in
  // the backend (`users.role`) and the investigator console owns those routes.
  // If the identity carrying us here is not a consumer, bounce straight to the
  // shared sign-in screen with the return path preserved.
  if (!isAuthenticated) {
    return <Outlet />;
  }

  const isActive = useCallback(
    (href: string) => {
      if (href === "/consumer/dashboard") return location.pathname === "/consumer/dashboard";
      return location.pathname.startsWith(href);
    },
    [],
  );

  const closeOnOutside = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as Node | null;
      if (target && !sheetRef.current?.contains(target)) {
        setMobileOpen(false);
        setDestinationsOpen(false);
      }
    },
    [],
  );

  // Close sheets when a route is chosen.
  useEffect(() => {
    // Close the mobile sheet whenever the route changes to a real consumer
    // page. We schedule the state update asynchronously (via requestAnimationFrame)
    // so the effect body itself does not call setState synchronously.
    if (location.pathname.startsWith("/consumer/")) {
      const raf = window.requestAnimationFrame(() => {
        setMobileOpen(false);
        setDestinationsOpen(false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, []);

  // Body scroll lock + Escape handling for the mobile sheet.
  useEffect(() => {
    if (mobileOpen || destinationsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, destinationsOpen]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setDestinationsOpen(false);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  const renderSidebar = () => (
    <nav
      className="fixed left-4 right-4 top-4 lg:left-6 lg:right-auto lg:top-6 z-30 w-[78px] xl:w-[240px]"
      aria-label="Main navigation"
    >
      <div className="glass-strong p-3 xl:p-4 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Logo */}
        <div className="flex items-center gap-3 px-2 xl:px-3 mb-6 xl:mb-8">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-lg font-semibold shadow-md shrink-0">
            J
          </div>
          <div className="hidden xl:flex flex-col min-w-0">
            <span className="text-[var(--color-consumer-deep)] font-semibold text-base leading-tight tracking-tight">
              JAAL
            </span>
            <span className="text-[var(--color-consumer-muted)] text-[11px] font-medium leading-tight uppercase tracking-widest">
              Report · Understand · Stay Safe
            </span>
          </div>
          <ChevronRight
            className="hidden xl:block ml-auto text-[var(--color-consumer-muted)] text-sm shrink-0"
            strokeWidth={1.75}
          />
        </div>

        {/* Nav items */}
        <ul className="flex flex-col gap-2 flex-1" role="list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  onClick={(event) => {
                    // Close the mobile sheet on navigation without calling
                    // setState synchronously in the route-change effect.
                    if (window.innerWidth < 1280) {
                      event.preventDefault();
                      navigate(item.href);
                    }
                  }}
                  className={`group relative flex items-center gap-3 px-2 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm transition-all duration-150 ${
                    active
                      ? "bg-[var(--color-consumer-primary)] text-white shadow-md shadow-[var(--color-consumer-primary)]/15"
                      : "text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={`w-[20px] h-[20px] shrink-0 ${
                      active ? "text-white" : "group-hover:text-[var(--color-consumer-primary)]"
                    }`}
                    strokeWidth={1.85}
                  />
                  <span className="hidden xl:block truncate font-medium">
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute left-2 xl:left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-white/80" />
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        {/* Shield + trustline footer */}
        <div className="mt-auto pt-4 border-t border-[var(--color-consumer-border)]">
          <div className="flex items-center gap-2 px-2 xl:px-3 mb-3">
            <Shield className="w-[18px] h-[18px] text-[var(--color-consumer-teal)]" strokeWidth={1.85} />
            <span className="hidden xl:block text-[11px] text-[var(--color-consumer-teal)] font-medium leading-tight tracking-wide">
              Together for a Safer Digital India.
            </span>
          </div>
        </div>
      </div>
    </nav>
  );

  const renderAllDestinations = () => {
    const Desktop = (
      <div className="hidden xl:flex items-center gap-3">
        <button
          type="button"
          className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors"
          onClick={() => setDestinationsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={destinationsOpen}
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-xs font-semibold">
            AD
          </span>
          <span className="text-sm font-medium text-[var(--color-consumer-muted)]">
            All Destinations
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );

    const mobile = (
      <div className="flex-1 overflow-y-auto px-2 xl:px-0">
        <button
          type="button"
          className={"w-full flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm font-medium text-left transition-colors " + (
            destinationsOpen
              ? "text-white bg-[var(--color-consumer-primary)]"
              : "text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)]"
          )}
          onClick={() => setDestinationsOpen(!destinationsOpen)}
          aria-expanded={destinationsOpen}
          aria-haspopup="dialog"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-xs font-semibold">
            AD
          </span>
          All Destinations
        </button>
      </div>
    );

    return (
      <dialog
        ref={sheetRef}
        className={`fixed inset-0 z-50 flex flex-col ${destinationsOpen ? "flex" : "hidden"}`}
        onPointerDown={(event) => {
          // Close the destinations sheet when clicking outside it.
          if (event.target === event.currentTarget) {
            setDestinationsOpen(false);
          }
        }}
      >
        <div className="flex flex-col border-b border-[var(--color-consumer-border)] px-4 xl:px-6 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
              All Destinations
            </h2>
            <button
              type="button"
              className="text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
              onClick={() => setDestinationsOpen(false)}
              aria-label="Close destinations sheet"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2">
            {window.innerWidth >= 1280 ? Desktop : mobile}
          </div>
        </div>
        {destinationsOpen && (
          <div className="flex-1 overflow-y-auto p-4 xl:p-6">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-4">
              {CATEGORIES.map((dest) => {
                const Icon = dest.icon;
                return (
                  <div
                    key={dest.key}
                    className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-card)] p-3 xl:p-4 cursor-pointer transition-all hover:bg-[var(--color-consumer-primary-soft)] hover:border-[var(--color-consumer-primary)]"
                    onClick={() => {
                      setDestinationsOpen(false);
                      navigate(`/consumer/report?category=${dest.key}`);
                    }}
                  >
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-sm font-semibold">
                        {Icon}
                      </span>
                      <span className="text-sm font-medium text-[var(--color-consumer-deep)]">
                        {dest.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-consumer-muted)] leading-relaxed">
                      {dest.description}
                    </p>
                  </div>
                );
              }))}
            </div>
          </div>
        )}
      </dialog>
    );
  };

  const renderReportDialog = () => (
    <div className="min-h-screen bg-[var(--color-consumer-bg)] text-[var(--color-consumer-text)]">
      {/* Header — fixed, overlays the mobile sidebar when open */}
      <header className="fixed top-0 right-0 left-0 z-40 flex items-center gap-4 px-4 xl:px-8 h-[3.5rem] border-b border-[var(--color-consumer-border)] bg-[var(--color-consumer-card)]">
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-lg font-semibold shadow-md">
              J
            </div>
            <span className="text-base font-semibold text-[var(--color-consumer-deep)]">
              JAAL
            </span>
          </div>
          <span className="hidden xl:block text-sm text-[var(--color-consumer-muted)] font-medium">
            Report · Understand · Stay Safe
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/consumer/report"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-[var(--color-consumer-primary)] hover:bg-[var(--color-consumer-primary)]/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xl:inline">Report a Scam</span>
          </Link>
          <Link
            to="/consumer/protected"
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-[var(--color-consumer-border)] text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)] hover:border-[var(--color-consumer-primary)] transition-colors"
          >
            <Shield className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Mobile sheet — slide-in navigation */}
      {mobileOpen && (
        <dialog
          ref={sheetRef}
          className="fixed inset-0 z-50 flex flex-col bg-[var(--color-consumer-card)]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setMobileOpen(false);
            }
          }}
        >
          <div className="flex flex-col border-b border-[var(--color-consumer-border)] px-4 xl:px-6 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
                JAAL
              </h2>
              <button
                type="button"
                className="text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              <nav className="flex flex-col gap-2">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm font-medium transition-colors ${active ? "bg-[var(--color-consumer-primary)] text-white" : "text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] hover:bg-[var(--color-consumer-primary-soft)]"}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 xl:px-0">
            <div className="px-2 xl:px-3 pb-3 flex flex-col gap-2">
              <Link
                to="/consumer/report"
                className="w-full flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm font-medium text-left transition-colors hover:bg-[var(--color-consumer-primary-soft)]"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-xs font-semibold">
                  <Menu className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium text-[var(--color-consumer-deep)]">
                  Report a Scam
                </span>
              </Link>
              <Link
                to="/consumer/protected"
                className="w-full flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm font-medium text-left transition-colors hover:bg-[var(--color-consumer-primary-soft)]"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-xs font-semibold">
                  <Shield className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium text-[var(--color-consumer-deep)]">
                  Stay Protected
                </span>
              </Link>
              <Link
                to="/consumer/profile"
                className="w-full flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-xl text-sm font-medium text-left transition-colors hover:bg-[var(--color-consumer-primary-soft)]"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] text-xs font-semibold">
                  <User className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium text-[var(--color-consumer-deep)]">
                  Profile
                </span>
              </Link>
            </div>
          </div>
        </dialog>
      )}

      {/* Page content — offset for the fixed header */}
      <main className="pt-[3.5rem] min-h-screen">{children}</main>

      {/* Floating JAAL Safety Assistant (fixed, no layout impact) */}

      {/* Report dialog — mobile sheet */}
      {renderReportDialog()}

      {/* All Destinations — desktop dropdown + mobile dialog */}
      {renderAllDestinations()}
    </div>
  );
}


