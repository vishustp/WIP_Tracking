import type { ReactNode } from "react";

export interface CardProps {
  children?: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-2xs ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = "" }: CardProps) {
  return <div className={`border-b border-slate-200 bg-slate-50/70 px-4 py-3 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = "" }: CardProps) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export default Card;
