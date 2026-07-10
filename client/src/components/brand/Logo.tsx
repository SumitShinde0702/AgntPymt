import { useId } from "react";

type Props = {
  className?: string;
  /** Icon size class. */
  markClassName?: string;
  showWordmark?: boolean;
  variant?: "light" | "dark";
};

/** Brand mark — hexagon + robot + $ (crisp at any size). */
function Mark({ className = "h-9 w-9" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={`${uid}-top`}>
          <rect x="0" y="0" width="64" height="32" />
        </clipPath>
        <clipPath id={`${uid}-bot`}>
          <rect x="0" y="32" width="64" height="32" />
        </clipPath>
      </defs>
      {/* Hexagon — cyan top, navy bottom */}
      <g clipPath={`url(#${uid}-top)`}>
        <path
          d="M32 5 L53 17.5 L53 42.5 L32 55 L11 42.5 L11 17.5 Z"
          stroke="#00a8e8"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
      </g>
      <g clipPath={`url(#${uid}-bot)`}>
        <path
          d="M32 5 L53 17.5 L53 42.5 L32 55 L11 42.5 L11 17.5 Z"
          stroke="#0b2d5c"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
      </g>
      {/* Robot head */}
      <rect x="20" y="17" width="24" height="18" rx="5" fill="#0b2d5c" />
      <rect x="25" y="23" width="5" height="7" rx="2.5" fill="#e8f7fc" />
      <rect x="34" y="23" width="5" height="7" rx="2.5" fill="#e8f7fc" />
      {/* $ badge */}
      <circle cx="32" cy="44" r="9" fill="#00a8e8" />
      <text
        x="32"
        y="48.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill="#fff"
      >
        $
      </text>
    </svg>
  );
}

export function Logo({
  className = "",
  markClassName = "h-9 w-9",
  showWordmark = true,
  variant = "light",
}: Props) {
  const agnt = variant === "dark" ? "text-white" : "text-[#0b2d5c]";
  const pymt = variant === "dark" ? "text-[#5ec8f0]" : "text-[#00a8e8]";

  return (
    <div className={`flex items-center gap-2.5 ${className}`.trim()}>
      <Mark className={markClassName} />
      {showWordmark && (
        <span className="select-none text-lg font-bold leading-none tracking-tight">
          <span className={agnt}>Agnt</span>
          <span className={pymt}>Pymt</span>
        </span>
      )}
    </div>
  );
}
