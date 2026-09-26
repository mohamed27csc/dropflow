"use client";

import { api } from "./use-api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Demande la permission puis s'abonne au push navigateur. Retourne false si refusé ou non disponible (ex. PWA non installée sur iOS). */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await api("/api/push/subscribe", { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return true;
}

export function pushPermissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}
