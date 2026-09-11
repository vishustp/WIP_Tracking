import type { ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export interface BadgeProps {
  children?: ReactNode;
  className?: string;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-800 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  outline: "bg-white text-slate-700 border-slate-300",
};

export function Badge({ children, className = "", variant = "default" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

export default Badge;
