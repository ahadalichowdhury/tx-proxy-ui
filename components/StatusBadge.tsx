import type { PlaybackStatus } from "@/components/StreamPlayer";
import type { StreamStatus } from "@/db/schema";

type StatusBadgeProps = {
  status: StreamStatus | PlaybackStatus;
  className?: string;
  variant?: "default" | "broadcast";
};

const STATUS_STYLES: Record<
  StreamStatus | PlaybackStatus,
  { label: string; dot: string; badge: string; broadcast: string }
> = {
  live: {
    label: "Live",
    dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    broadcast:
      "border-red-500/40 bg-red-600/90 text-white shadow-[0_0_20px_rgba(225,29,72,0.45)]",
  },
  offline: {
    label: "Offline",
    dot: "bg-zinc-500",
    badge: "border-zinc-600/40 bg-zinc-800/80 text-zinc-400",
    broadcast: "border-zinc-600/40 bg-zinc-900/90 text-zinc-400",
  },
  loading: {
    label: "Connecting",
    dot: "bg-amber-400 animate-pulse",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    broadcast: "border-amber-500/40 bg-amber-500/20 text-amber-200",
  },
};

export function StatusBadge({
  status,
  className = "",
  variant = "default",
}: StatusBadgeProps) {
  const config = STATUS_STYLES[status];
  const styles =
    variant === "broadcast" ? config.broadcast : config.badge;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${styles} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden />
      {variant === "broadcast" && status === "live" ? "Live" : config.label}
    </span>
  );
}
