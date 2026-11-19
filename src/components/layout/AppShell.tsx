import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useJaal } from "@/state/JaalProvider";
import { STATUS_COLOR_CSS } from "@/theme/status";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Outlet } from "react-router";import { SidebarContent } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DemoGuide } from "@/components/demo/DemoGuide";

/**
 * Persistent application shell: collapsible sidebar (icon rail) on desktop,
 * slide-out drawer on mobile, top navigation bar, routed content area.
 */
export function AppShell() {
  const { state } = useJaal();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { appearance } = state.settings;

  return (
    <div
      data-accent={appearance.animationIntensity}
      data-density={appearance.density}
      data-anim={appearance.reducedMotion ? "off" : "on"}
      className="jaal-grid flex min-h-screen bg-background text-foreground"
    >
      {/* Single source of truth for status colors (see src/theme/status.ts) */}
      <style>{STATUS_COLOR_CSS}</style>
      {/* Desktop sidebar / icon rail */}
      <aside
        className={cn(
          "metal-sidebar jaal-no-print sticky top-0 hidden h-screen shrink-0 border-r transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-[220px]",
        )}
      >
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((c) => !c)}
            className="absolute -right-3 top-6 z-10 flex size-6 items-center justify-center border border-jborder/70 bg-jsurface text-jmuted shadow-md transition-colors hover:border-jcyan/60 hover:text-jcyan"
          >
            <span className="font-mono text-[10px]">
              {collapsed ? "»" : "«"}
            </span>
          </button>
          <SidebarContent collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 border-jborder/80 bg-sidebar p-0 [&>button]:text-jmuted"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Guided 90-second demo walkthrough (see components/demo/DemoGuide) */}
      <DemoGuide />
    </div>
  );
}
