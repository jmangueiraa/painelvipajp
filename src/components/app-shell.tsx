import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-zinc-950 text-zinc-100">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 rounded-lg" />
            </div>
            <UserMenu />
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto min-w-0 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
