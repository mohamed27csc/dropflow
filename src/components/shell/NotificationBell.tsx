"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare } from "lucide-react";
import { LIVE } from "@/lib/mode";
import { api, useApi } from "@/lib/use-api";
import { enablePush, pushPermissionState } from "@/lib/push";
import { Sheet } from "../ui";

type Notif = { id: string; type: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [showEnable, setShowEnable] = useState(() => LIVE && pushPermissionState() === "default");
  const { data, reload } = useApi<{ notifications: Notif[]; unread: number }>("/api/notifications", LIVE);
  const router = useRouter();

  useEffect(() => {
    if (!LIVE) return;
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  if (!LIVE) return null;
  const unread = data?.unread ?? 0;

  async function onOpen() {
    setOpen(true);
    if (unread > 0) {
      await api("/api/notifications/read", { all: true });
      reload();
    }
  }

  function onTap(n: Notif) {
    setOpen(false);
    if (n.url) router.push(n.url);
  }

  return (
    <>
      <button onClick={onOpen} aria-label="Notifications" className="relative grid size-11 place-items-center rounded-xl text-gray-300 hover:bg-white/10">
        <Bell className="size-6" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {showEnable && (
          <button
            onClick={async () => {
              const ok = await enablePush();
              setShowEnable(!ok);
            }}
            className="mb-4 w-full rounded-2xl bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-600"
          >
            Activer les notifications sur ce téléphone
          </button>
        )}
        {!data?.notifications.length && <p className="py-8 text-center text-muted">Aucune notification pour l&apos;instant.</p>}
        <div className="space-y-2">
          {(data?.notifications ?? []).map((n) => (
            <button key={n.id} onClick={() => onTap(n)} className="block w-full rounded-2xl bg-gray-50 p-4 text-left hover:bg-gray-100">
              <div className="flex items-start gap-3">
                {n.type.startsWith("buyer") && <MessageSquare className="mt-0.5 size-5 shrink-0 text-brand-500" />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
