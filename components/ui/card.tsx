import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  children?: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white shadow-2xs", className)}>{children}</div>;
}

export function CardHeader({ children, className = "" }: CardProps) {
  return <div className={cn("border-b border-slate-200 bg-slate-50/70 px-4 py-3", className)}>{children}</div>;
}

export function CardContent({ children, className = "" }: CardProps) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

export default Card;
