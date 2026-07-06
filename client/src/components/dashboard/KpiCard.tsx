import { Bot, Clock, TrendingUp, Wallet } from "lucide-react";

type Props = {
  title: string;
  value: string;
  icon: "wallet" | "bot" | "clock" | "chart";
  tone?: "brand" | "green" | "yellow" | "blue";
};

const icons = {
  wallet: Wallet,
  bot: Bot,
  clock: Clock,
  chart: TrendingUp,
};

const tones = {
  brand: "icon-well",
  green: "bg-emerald-50 text-emerald-600",
  yellow: "bg-amber-50 text-amber-600",
  blue: "bg-sky-50 text-sky-600",
};

export function KpiCard({ title, value, icon, tone = "brand" }: Props) {
  const Icon = icons[icon];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
