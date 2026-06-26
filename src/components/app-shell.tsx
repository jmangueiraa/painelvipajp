import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/60 bg-card/50 backdrop-blur px-4 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
            </div>
            <UserMenu />
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto min-w-0 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
