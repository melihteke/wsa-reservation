import { cn } from "@/lib/utils";

type Props = { icon: string; className?: string; title?: string };

const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Line icons for the fleet, in the style of lucide. */
export default function EquipmentIcon({ icon, className, title }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-6 w-6", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      {icon === "dinghy" && (
        <g {...common}>
          <path d="M12 3v14" />
          <path d="M12 4 L19 15 H12" />
          <path d="M4 17 H20 L18 20 H7 Z" />
          <path d="M2 22 q2.5 -1.5 5 0 t5 0 t5 0 t5 0" />
        </g>
      )}
      {icon === "optimist" && (
        <g {...common}>
          <path d="M9 4v13" />
          <path d="M9 5 L17 3 L18 14 H9" />
          <path d="M9 14 L17 3.5" />
          <path d="M5 17 H19 V19 H6 Z" />
          <path d="M2 22 q2.5 -1.5 5 0 t5 0 t5 0 t5 0" />
        </g>
      )}
      {icon === "keelboat" && (
        <g {...common}>
          <path d="M11 2v14" />
          <path d="M11 3 L18 15 H11" />
          <path d="M10 5 L5 15 H10" />
          <path d="M3 16 H21 L18.5 19 H6 Z" />
          <path d="M12 19 v3" />
        </g>
      )}
      {icon === "pedalboat" && (
        <g {...common}>
          <path d="M3 15 H21 L19 19 H5 Z" />
          <circle cx="12" cy="10" r="3.5" />
          <path d="M12 6.5 v7 M8.5 10 h7" />
          <path d="M5 15 V11 h3 M19 15 V11 h-3" />
          <path d="M2 22 q2.5 -1.5 5 0 t5 0 t5 0 t5 0" />
        </g>
      )}
      {icon === "sup" && (
        <g {...common}>
          <circle cx="11" cy="4" r="1.6" />
          <path d="M11 6 v6 l-2 5 M11 12 l2 5" />
          <path d="M11 8 l4 2" />
          <path d="M17 3 L13 20" />
          <path d="M3 18 H21 q-1 2 -3 2 H6 q-2 0 -3 -2 Z" />
        </g>
      )}
      {icon === "windsurf" && (
        <g {...common}>
          <path d="M9 3 V17" />
          <path d="M9 3 Q17 6 18 14 L9 15" />
          <path d="M9 9 h6" />
          <path d="M3 18 H21 q-1 2 -3 2 H6 q-2 0 -3 -2 Z" />
        </g>
      )}
      {!["dinghy", "optimist", "keelboat", "pedalboat", "sup", "windsurf"].includes(icon) && (
        <g {...common}>
          <path d="M3 15 H21 L18 20 H6 Z" />
          <path d="M12 3 v12 M12 4 l6 9 h-6" />
        </g>
      )}
    </svg>
  );
}
