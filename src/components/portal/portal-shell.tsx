import React from "react";
import { Home, FileText, MoreHorizontal, LogOut } from "lucide-react";

export type PortalTab = "inicio" | "faturas" | "mais";

interface PortalShellProps {
  children: React.ReactNode;
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  onLogout?: () => void;
  clientName?: string;
  hideBottomNav?: boolean;
}

export function PortalShell({
  children,
  activeTab,
  onTabChange,
  onLogout,
  hideBottomNav = false,
}: PortalShellProps) {
  return (
    <div className="min-h-dvh bg-[#F4F5F7] text-slate-800 flex flex-col font-sans selection:bg-orange-500 selection:text-white antialiased">
      {/* Top Header - Vibrant Orange Bar */}
      <header className="sticky top-0 z-30 bg-[#FF5500] text-white shadow-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl overflow-hidden flex items-center justify-center border border-white/30 shadow-inner bg-black/40">
              <img
                src="/portal-mascote.jpg?v=2"
                alt="AJP"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                  const parent = e.currentTarget.parentElement;
                  if (parent && !parent.querySelector(".fallback-a")) {
                    const span = document.createElement("span");
                    span.className = "fallback-a font-black text-white text-base tracking-wider";
                    span.textContent = "A";
                    parent.appendChild(span);
                  }
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight leading-none text-white drop-shadow-sm">
                AJP<span className="text-orange-200">VIP</span>
              </span>
              <span className="text-[10px] font-semibold tracking-wide text-white/80 uppercase">
                Portal do Cliente
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs font-semibold tracking-wide transition border border-white/20"
                title="Sair do portal"
                aria-label="Sair da conta"
              >
                <LogOut className="h-3.5 w-3.5 text-white" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 pb-28">
        {children}
      </main>

      {/* Fixed Bottom Tab Navigation Bar - Vibrant Orange */}
      {!hideBottomNav && (
        <nav
          aria-label="Navegação inferior do portal"
          className="fixed bottom-0 inset-x-0 z-40 bg-[#FF5500] text-white shadow-[0_-4px_25px_rgba(255,85,0,0.25)] border-t border-orange-600/30"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        >
          <div className="max-w-lg mx-auto px-6 h-16 flex items-center justify-around">
            {/* Tab Início */}
            <button
              type="button"
              onClick={() => onTabChange("inicio")}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer ${
                activeTab === "inicio"
                  ? "text-white font-bold scale-105"
                  : "text-white/75 hover:text-white font-medium"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Home className={`h-6 w-6 transition-transform ${activeTab === "inicio" ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                {activeTab === "inicio" && (
                  <span className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-white animate-in fade-in zoom-in duration-200" />
                )}
              </div>
              <span className="text-[11px] mt-1.5 leading-none tracking-tight">Início</span>
            </button>

            {/* Tab Faturas */}
            <button
              type="button"
              onClick={() => onTabChange("faturas")}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer ${
                activeTab === "faturas"
                  ? "text-white font-bold scale-105"
                  : "text-white/75 hover:text-white font-medium"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <FileText className={`h-6 w-6 transition-transform ${activeTab === "faturas" ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                {activeTab === "faturas" && (
                  <span className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-white animate-in fade-in zoom-in duration-200" />
                )}
              </div>
              <span className="text-[11px] mt-1.5 leading-none tracking-tight">Faturas</span>
            </button>

            {/* Tab Mais */}
            <button
              type="button"
              onClick={() => onTabChange("mais")}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all cursor-pointer ${
                activeTab === "mais"
                  ? "text-white font-bold scale-105"
                  : "text-white/75 hover:text-white font-medium"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <MoreHorizontal className={`h-6 w-6 transition-transform ${activeTab === "mais" ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                {activeTab === "mais" && (
                  <span className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-white animate-in fade-in zoom-in duration-200" />
                )}
              </div>
              <span className="text-[11px] mt-1.5 leading-none tracking-tight">Mais</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
