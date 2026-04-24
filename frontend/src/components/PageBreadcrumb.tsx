// frontend/src/components/PageBreadcrumb.tsx

import { ChevronLeft, ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
}

const PageBreadcrumb = ({ items }: PageBreadcrumbProps) => {
  return (
    <nav className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-12">
      <ChevronLeft className="w-3 h-3" />

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <button
            type="button"
            onClick={item.onClick}
            disabled={!item.onClick || item.active}
            className={`transition-colors ${
              item.active
                ? "text-slate-900 cursor-default"
                : "hover:text-blue-600 cursor-pointer"
            }`}
          >
            {item.label}
          </button>

          {index < items.length - 1 && (
            <ChevronRight className="w-3 h-3 text-slate-300" />
          )}
        </div>
      ))}
    </nav>
  );
};

export default PageBreadcrumb;