type Props = {
  className?: string;
  showWordmark?: boolean;
  variant?: "light" | "dark";
};

export function Logo({ className = "h-9 w-auto", showWordmark = false, variant = "light" }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="AgntPymt" className={className} />
      {showWordmark && (
        <div className="leading-tight">
          <div className={`text-sm font-semibold ${variant === "dark" ? "text-white" : "text-slate-900"}`}>
            AgntPymt
          </div>
          <div className={`text-xs ${variant === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            Agent Payments
          </div>
        </div>
      )}
    </div>
  );
}
