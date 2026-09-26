"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { PLANS } from "@/lib/plans";
import { useSettings } from "@/lib/settings-store";
import { NAV } from "./nav";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { pseudo, plan } = useSettings();

  return (
    <nav aria-label="Navigation principale" className="flex h-full flex-col bg-black text-gray-300">
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-5">
        {NAV.map((group, i) => (
          <div key={i} className={cn(i > 0 && "mt-6")}>
            {group.label && <p className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{group.label}</p>}
            <ul className="space-y-1">
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-12 items-center gap-3.5 rounded-2xl px-3 text-[17px] font-semibold transition-colors",
                        active ? "bg-brand-400/15 text-brand-400" : "hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{label}</span>
                      {badge && (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-extrabold",
                            badge === "New" ? "bg-brand-400 text-black" : "bg-warn text-white",
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Link
        href="/profil"
        onClick={onNavigate}
        className="m-4 mb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
      >
        <span className="grid size-11 place-items-center rounded-full bg-brand-400 text-lg font-extrabold text-black" aria-hidden>
          {pseudo.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-white">Mon compte</span>
          <span className="block text-sm text-gray-400">Plan {PLANS[plan].name}</span>
        </span>
      </Link>
    </nav>
  );
}
