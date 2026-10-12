import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "danger" | "primary" | "teal";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-[#0078d4] text-white hover:bg-[#106ebe] active:bg-[#005a9e] shadow-xs",
  outline: "border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] text-[var(--text-main,#0f172a)] hover:bg-[var(--bg-surface-subtle,#f1f5f9)] active:opacity-80 shadow-xs",
  ghost: "text-[var(--text-main,#0f172a)] hover:bg-[var(--bg-surface-subtle,#f1f5f9)] active:opacity-80",
  secondary: "bg-[var(--bg-surface-subtle,#f1f5f9)] text-[var(--text-main,#0f172a)] hover:bg-[var(--bg-surface-elevated,#e2e8f0)] active:opacity-80",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs",
  primary: "bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 shadow",
  teal: "bg-teal-600 text-white hover:bg-teal-700 shadow",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[2.25rem] sm:min-h-[2rem] px-3 py-1.5 text-xs",
  md: "min-h-[2.5rem] px-4 py-2 text-sm",
  lg: "min-h-[3rem] px-5 py-2.5 text-base",
};

export function Button({
  children,
  className = "",
  variant = "default",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4]/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
