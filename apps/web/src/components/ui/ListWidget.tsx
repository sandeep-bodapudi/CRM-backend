import React, { useState, useEffect } from 'react';
import { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface ListItem {
  id: string | number;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  /** If set, the row navigates here on click */
  link?: string;
  /** Callback for custom click behavior (overrides link) */
  onClick?: () => void;
}

interface ListWidgetProps {
  title: string;
  items: ListItem[];
  viewAllLink?: string;
  emptyStateMessage?: string;
}

export function ListWidget({
  title,
  items,
  viewAllLink,
  emptyStateMessage = 'No items found',
}: ListWidgetProps) {
  const navigate = useNavigate();
  // Render-side cap, independent of how many items the caller passed in:
  // most ListWidget consumers are small dashboard widgets, but a few (e.g.
  // AdminSuperHub's audit-log/security-alert tabs) pass an uncapped list
  // that can legitimately run into the thousands, which would freeze the
  // browser rendering every row with no pagination. "Load More" reveals
  // more of the already-provided list; reset whenever the caller swaps in a
  // different `items` array.
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card flex flex-col overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-navy-900">{title}</h3>
        {viewAllLink && (
          <Link
            to={viewAllLink}
            className="text-sm font-medium text-action hover:text-navy-700 transition-colors flex items-center gap-1"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">{emptyStateMessage}</div>
        ) : (
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const isClickable = !!(item.link || item.onClick);
              const handleClick = () => {
                if (item.onClick) {
                  item.onClick();
                  return;
                }
                if (item.link) navigate(item.link);
              };

              return (
                <li
                  key={item.id}
                  onClick={isClickable ? handleClick : undefined}
                  className={`flex items-center justify-between p-3 rounded-xl transition-colors group ${
                    isClickable
                      ? 'cursor-pointer hover:bg-navy-50 hover:shadow-sm active:scale-[0.99]'
                      : 'hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center min-w-0">
                    {item.icon && (
                      <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center shrink-0 mr-4 group-hover:bg-white transition-colors">
                        <item.icon className="w-5 h-5 text-navy-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className={`font-semibold truncate ${isClickable ? 'text-navy-800 group-hover:text-navy-600' : 'text-navy-900'}`}
                      >
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="text-sm text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 flex items-center gap-2">
                    {item.meta && <div className="text-right">{item.meta}</div>}
                    {isClickable && (
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-navy-500 transition-colors" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {items.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="w-full mt-1 py-2.5 rounded-xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
          >
            Load More ({items.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
