import type { ReactNode } from "react";
import { X } from "lucide-react";

export type ModalMaxWidth = "md" | "2xl" | "6xl";

export interface ModalProps {
  children: ReactNode;
  title?: ReactNode;
  onClose: () => void;
  maxWidth?: ModalMaxWidth;
  className?: string;
}

const maxWidthClasses: Record<ModalMaxWidth, string> = {
  md: "max-w-md",
  "2xl": "max-w-2xl",
  "6xl": "max-w-6xl",
};

export function Modal({ children, title, onClose, maxWidth = "2xl", className = "" }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`relative w-full ${maxWidthClasses[maxWidth]} rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 ${className}`}>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="text-base font-bold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
