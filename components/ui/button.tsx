import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 shadow-xs",
  ghost: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs",
  primary: "bg-slate-900 text-white hover:bg-slate-800 shadow",
  teal: "bg-teal-600 text-white hover:bg-teal-700 shadow",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[2rem] px-3 py-1.5 text-xs",
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4]/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
