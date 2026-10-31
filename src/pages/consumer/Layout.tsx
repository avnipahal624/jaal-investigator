import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
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

const NAV_ITEMS = [
  {
    id: "home",
    label: "Home",
    href: "/consumer/dashboard",
    icon: House,
  },
  {
    id: "report",
    label: "Report a Scam",
    href: "/consumer/report",
    icon: FileWarning,
  },
  {
    id: "reports",
    label: "My Reports",
    href: "/consumer/reports",
    icon: FileCheck,
  },
  {
    id: "protected",
    label: "Stay Protected",
    href: "/consumer/protected",
    icon: Shield,
  },
  {
    id: "profile",
    label: "Profile",
    href: "/consumer/profile",
    icon: User,
  },
];

const DESTINATIONS = [
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
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const sheetRef = useRef<HTMLDialogElement>(null);

  // Guard: the consumer dashboard is scoped to the Normal People experience.
  // Investigator accounts are not routed here — their real authority lives in
  // the backend (`users.role`) and the investigator console owns those routes.
  // If the identity carrying us here is not a consumer, bounce straight to the
  // shared sign-in screen with the return path preserved.
  const isConsumer = Boolean(isAuthenticated);
  if (!isConsumer) {
    return <Outlet />;
  }

  const isActive = useCallback(
    (href: string) => {
      if (href === "/consumer/dashboard") return location.pathname === "/consumer/dashboard";
      return location.pathname.startsWith(href);
    },
    [location.pathname],
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
    // page. We schedule the state update asynchronously (via setTimeout(0))
    // so the effect body itself does not call setState synchronously.
    if (location.pathname.startsWith("/consumer/")) {
      const raf = window.requestAnimationFrame(() => {
        setMobileOpen(false);
        setDestinationsOpen(false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [location.pathname]);

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
                      navigate(item.href, { replace: true });
                      setMobileOpen(false);
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
          <span className="hidden sm:inline">All Destinations</span>
          <ChevronRight className="w-[14px] h-[14px]" />
        </button>
      </div>
    );

    return Desktop;
  };

  const renderMobileSheet = () => (
    <dialog
      ref={sheetRef}
      className="modal-body fixed inset-x-4 bottom-0 z-50 rounded-t-3xl glass-strong shadow-2xl outline-none border border-[var(--color-consumer-border)] w-[calc(100%-2rem)] max-w-lg"
      open={mobileOpen}
      onClick={(event) => event.stopPropagation()}
      aria-label="Navigation"
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <span className="w-8 h-1 rounded-full bg-[var(--color-consumer-border)]" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-sm font-semibold">
            J
          </div>
          <span className="text-[var(--color-consumer-deep)] font-semibold text-base">
            JAAL
          </span>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-consumer-muted)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable destinations */}
      <div className="max-h-[60vh] overflow-y-auto px-4 pb-6 space-y-2 scrollbar-thin">
        {DESTINATIONS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.id}
              type="button"
              className={`tile w-full text-left ${
                active ? "active" : ""
              }`}
              onClick={() => navigate(item.href)}
            >
              <span className="tile-icon" aria-hidden="true">
                <Icon
                  className={`w-5 h-5 ${
                    active ? "text-white" : "text-[var(--color-consumer-primary)]"
                  }`}
                  strokeWidth={1.85}
                />
              </span>
              <span className="tile-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </dialog>
  );

  const renderDestinationsSheet = () => (
    <dialog
      className="modal-body fixed inset-0 z-50 flex items-center justify-center p-4"
      open={destinationsOpen}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setDestinationsOpen(false);
        }
      }}
      aria-modal="true"
      aria-labelledby="destinations-title"
    >
      <div className="glass-strong p-6 w-full max-w-xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-consumer-deep)]">
              All Destinations
            </span>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-consumer-muted)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors"
            onClick={() => setDestinationsOpen(false)}
            aria-label="Close destinations"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[70vh] scrollbar-thin">
          {DESTINATIONS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <button
                key={item.id}
                type="button"
                className={`tile h-auto ${
                  active ? "active" : ""
                }`}
                onClick={() => {
                  navigate(item.href);
                  setDestinationsOpen(false);
                }}
              >
                <span className="tile-icon" aria-hidden="true">
                  <Icon
                    className={`w-5 h-5 ${
                      active ? "text-white" : "text-[var(--color-consumer-primary)]"
                    }`}
                    strokeWidth={1.85}
                  />
                </span>
                <span className="tile-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );

  const mobileHeader = (
    <header className="fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-[var(--color-consumer-glass-strong)] backdrop-blur-xl border-b border-[var(--color-consumer-border)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-consumer-muted)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <a href="/consumer/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-sm font-semibold">
            J
          </div>
          <span className="text-[var(--color-consumer-deep)] font-semibold text-sm">
            JAAL
          </span>
        </a>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--color-consumer-muted)] hover:bg-[var(--color-consumer-primary-soft)] transition-colors"
          onClick={() => setDestinationsOpen(true)}
          aria-haspopup="dialog"
        >
          All Destinations
        </button>
      </div>
    </header>
  );

  return (
    <div className="theme-consumer min-h-screen flex">
      {/* Desktop sidebar */}
      {renderSidebar()}

      {/* Desktop destinations pill */}
      {renderAllDestinations()}

      {/* Mobile header + sheet */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div
          className="absolute inset-0 pointer-events-auto"
          onClick={closeOnOutside}
        />
      </div>
      {renderMobileSheet()}
      {destinationsOpen && renderDestinationsSheet()}

      {/* Mobile header only visible below xl */}
      <div className="lg:hidden" aria-hidden={mobileOpen}>
        {mobileHeader}
      </div>

      {/* Main content */}
      <main
        className="flex-1 min-h-screen pt-20 lg:pt-0 xl:pt-0 pb-20 lg:pb-0 overflow-y-auto"
        style={{ paddingLeft: "calc(78px + 1rem)", paddingRight: "1rem" }}
      >
        <div className="px-4 lg:px-6 xl:px-8 py-6 max-w-7xl mx-auto w-full">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
