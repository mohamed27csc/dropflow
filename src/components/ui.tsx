"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ───────────── Cartes & titres ───────────── */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-card border border-black/[0.04] bg-white shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-xs font-bold uppercase tracking-[0.14em] text-muted", className)}>{children}</h2>;
}

/* ───────────── Boutons ───────────── */

type Variant = "primary" | "secondary" | "warning" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-400 text-white shadow-[0_8px_20px_-8px_rgba(61,187,217,0.9)] hover:bg-brand-500 active:bg-brand-500",
  secondary: "border border-gray-200 bg-white text-ink shadow-card hover:bg-gray-50 active:bg-gray-100",
  warning: "bg-warn text-white shadow-[0_8px_20px_-8px_rgba(240,158,54,0.9)] hover:brightness-95 active:brightness-90",
  danger: "border border-red-200 bg-white text-danger hover:bg-red-50 active:bg-red-100",
  ghost: "text-muted hover:bg-gray-100 active:bg-gray-200",
};
const SIZES: Record<Size, string> = {
  sm: "h-10 gap-1.5 px-4 text-sm",
  md: "h-12 gap-2 px-5 text-base",
  lg: "h-14 gap-2.5 px-6 text-lg",
};

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  full?: boolean;
  href?: string;
  className?: string;
};

export function Button({ variant = "primary", size = "md", icon, loading, full, href, className, children, disabled, ...rest }: ButtonProps) {
  const cls = cn(
    "inline-flex items-center justify-center rounded-2xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  );
  const content = (
    <>
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </>
  );
  if (href?.startsWith("/api/")) {
    // Route serveur (redirection OAuth) : navigation complète, pas de navigation client Next.
    return (
      <a href={href} className={cls}>
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} onClick={rest.onClick as never}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

/* ───────────── Formulaires ───────────── */

const INPUT_CLS =
  "h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base text-ink placeholder:text-gray-400 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[15px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(INPUT_CLS, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(INPUT_CLS, "h-auto min-h-28 py-3", className)} {...rest} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "className">) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLS, "appearance-none pr-10", className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

/** Champ numérique tolérant : garde le texte tapé, remonte un nombre valide. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  className,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "className" | "type">) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={cn(INPUT_CLS, className)}
      value={draft ?? String(value).replace(".", ",")}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw.replace(",", "."));
        if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
      }}
      onBlur={() => setDraft(null)}
      {...rest}
    />
  );
}

function clamp(n: number, min?: number, max?: number) {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
        checked ? "bg-brand-400" : "bg-gray-300",
      )}
    >
      <span className={cn("absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform", checked && "translate-x-6")} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-2xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl px-2 text-sm font-semibold transition",
            value === o.value ? "bg-white text-ink shadow-card" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Statuts ───────────── */

const DOT: Record<string, string> = {
  ok: "bg-ok",
  brand: "bg-brand-400",
  warn: "bg-warn",
  off: "bg-gray-300",
};

export function StatusDot({ tone, children }: { tone: keyof typeof DOT; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-base font-medium">
      <span className={cn("size-2.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Badge({ tone, children }: { tone: "new" | "pro" | "warn" | "ok" | "muted"; children: ReactNode }) {
  const tones = {
    new: "bg-brand-400 text-ink",
    pro: "bg-warn text-white",
    warn: "bg-warn-50 text-[#b86e0f]",
    ok: "bg-ok-50 text-[#15803d]",
    muted: "bg-gray-100 text-muted",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", tones[tone])}>{children}</span>;
}

export function ProductThumb({ emoji = "📦", hue = 200, size = 84, image }: { emoji?: string; hue?: number; size?: number; image?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- images fournisseur (domaines variables), pas d'optimisation possible
    return <img src={image} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-2xl bg-gray-100 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        background: `linear-gradient(140deg, hsl(${hue} 85% 94%), hsl(${hue} 70% 84%))`,
      }}
      aria-hidden
    >
      {emoji}
    </div>
  );
}

export function Notice({ tone = "warn", icon, children, action }: { tone?: "warn" | "ok"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-[15px]",
        tone === "warn" ? "border-warn/30 bg-warn-50 text-[#8a520b]" : "border-ok/30 bg-ok-50 text-[#166534]",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = Math.min(1, used / max);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", used >= max ? "font-bold text-warn" : "text-muted")}>
          {used} / {max}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={used} aria-valuemax={max} aria-label={label}>
        <div className={cn("h-full rounded-full transition-all", used >= max ? "bg-warn" : "bg-brand-400")} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/* ───────────── Feuille modale ───────────── */

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-extrabold">
            {title}
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-full bg-gray-100 text-muted">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───────────── Toasts ───────────── */

type ToastTone = "ok" | "warn";
const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, tone: ToastTone = "ok") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={cn(
              "animate-slide-up pointer-events-auto max-w-md rounded-2xl px-5 py-3.5 text-[15px] font-semibold text-white shadow-xl",
              toast.tone === "ok" ? "bg-ink" : "bg-warn",
            )}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/* ───────────── Mini-hook : action simulée avec délai ───────────── */

export function useFakeAction(ms = 1200) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = useCallback(
    (done?: () => void) => {
      setBusy(true);
      timer.current = setTimeout(() => {
        setBusy(false);
        done?.();
      }, ms);
    },
    [ms],
  );
  return [busy, run] as const;
}
