"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { LIVE } from "@/lib/mode";
import { Logo } from "../Logo";
import { ToastProvider } from "../ui";
import { NotificationBell } from "./NotificationBell";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Sur mobile, le tiroir bloque le défilement de la page et se ferme avec Échap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <ToastProvider>
      <header className="fixed inset-x-0 top-0 z-40 flex h-[var(--topbar-h)] items-end border-b border-white/10 bg-black pb-0">
        <div className="flex h-16 w-full items-center gap-4 px-4">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            aria-controls="drawer"
            className="grid size-11 place-items-center rounded-xl text-gray-300 hover:bg-white/10 lg:hidden"
          >
            {open ? <X className="size-7" /> : <Menu className="size-7" />}
          </button>
          <div className="flex items-center gap-3 lg:pl-1">
            <Logo size={38} />
            <span className="text-2xl font-extrabold tracking-tight text-brand-400">{APP_NAME}</span>
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Fond assombri derrière le tiroir (mobile uniquement) */}
      {open && <div className="animate-fade-in fixed inset-0 top-[var(--topbar-h)] z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        id="drawer"
        className={cn(
          "fixed bottom-0 left-0 top-[var(--topbar-h)] z-40 w-80 max-w-[86vw] transition-transform duration-300 ease-out lg:w-72 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </aside>

      <main className="min-h-dvh pt-[var(--topbar-h)] lg:pl-72">
        {!LIVE && <p className="bg-warn-50 px-4 py-2 text-center text-sm font-semibold text-[#8a520b]">Mode démo : données factices, aucun compte requis.</p>}
        <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-7 sm:px-6">{children}</div>
      </main>
    </ToastProvider>
  );
}
