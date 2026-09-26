"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; theme: string }) => string; remove: (id: string) => void };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const TURNSTILE_ON = Boolean(SITE_KEY);

/** Cloudflare Turnstile (anti-robot). Rendu seulement si NEXT_PUBLIC_TURNSTILE_SITE_KEY est défini. Le jeton est à usage unique : remontez le composant (`key`) après chaque essai. */
export function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    const el = box.current;
    let widget: string | undefined;
    const render = () => {
      if (window.turnstile && el.childElementCount === 0) widget = window.turnstile.render(el, { sitekey: SITE_KEY, callback: onToken, "expired-callback": () => onToken(""), theme: "light" });
    };
    if (window.turnstile) render();
    else {
      let s = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!s) {
        s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.dataset.turnstile = "1";
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [onToken]);

  return SITE_KEY ? <div ref={box} className="flex min-h-[65px] justify-center" /> : null;
}
