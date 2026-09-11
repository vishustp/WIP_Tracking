import type { HTMLAttributes, ReactNode } from "react";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
  className?: string;
}

export function Table({ children, className = "", ...props }: TableProps) {
  return <table className={`min-w-full ${className}`} {...props}>{children}</table>;
}

export function TableHeader({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement> & { children?: ReactNode }) {
  return <thead className={`border-b border-slate-200 bg-slate-100/70 text-slate-700 ${className}`} {...props}>{children}</thead>;
}

export function TableBody({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement> & { children?: ReactNode }) {
  return <tbody className={`divide-y divide-slate-100 ${className}`} {...props}>{children}</tbody>;
}

export default Table;
