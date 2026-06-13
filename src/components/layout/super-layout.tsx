import { Outlet } from "@tanstack/react-router";
import { SuperSidebar } from "./super-sidebar";
import { useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function SuperLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full relative group transition-all duration-300">
        <SuperSidebar collapsed={collapsed} />
        {/* Desktop Collapse Toggle */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute -right-3.5 top-5 h-7 w-7 rounded-full border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col relative w-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center px-4 py-3 border-b bg-card">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 mr-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[240px]">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              {/* Full sidebar in mobile drawer */}
              <SuperSidebar collapsed={false} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-sm">B.O.T Super Admin</span>
        </div>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
