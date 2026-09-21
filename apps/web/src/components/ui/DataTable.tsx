import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  searchable?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'Nothing to show here yet',
  searchable = true,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Render-side cap, independent of how much data the caller passed in:
  // several callers (bookings, tasks, ...) fetch every matching row with no
  // backend limit at all, so rendering `data` in full would freeze the
  // browser once a company's row count runs into the thousands. "Load More"
  // reveals more of the already-sorted/filtered rows; reset whenever the
  // input data or the in-table search changes so it never shows "page 4" of
  // a different result set.
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [data, searchQuery]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDesc) {
        setSortKey(null);
        setSortDesc(false);
      } else {
        setSortDesc(true);
      }
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  const filteredData = data.filter((row) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return Object.values(row).some(
      (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(query),
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal > bVal ? 1 : -1;
    return sortDesc ? -comparison : comparison;
  });

  const visibleData = sortedData.slice(0, visibleCount);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card flex flex-col h-full overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-slate-100 bg-surface/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search records..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 transition-shadow"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1 bg-slate-50 md:bg-white p-4 md:p-0">
        {sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            {emptyMessage}
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-4">
              {visibleData.map((row, i) => (
                <div
                  key={i}
                  className={`bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-card transition-shadow ${
                    onRowClick
                      ? 'cursor-pointer active:bg-slate-50 hover:bg-slate-50 hover:shadow-card-hover'
                      : ''
                  }`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((col, colIndex) => (
                    <div key={col.key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {col.header}
                      </span>
                      <div
                        className={`text-sm text-slate-800 break-words ${colIndex === 0 ? 'font-medium' : ''}`}
                      >
                        {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block overflow-x-auto h-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:bg-slate-100 select-none transition-colors' : ''}`}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div className="flex items-center">
                          {col.header}
                          {col.sortable && sortKey === col.key && (
                            <span className="ml-1 text-navy-500">
                              {sortDesc ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronUp className="w-3 h-3" />
                              )}
                            </span>
                          )}
                          {col.sortable && sortKey !== col.key && (
                            <span className="ml-1 text-slate-300">
                              <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleData.map((row, i) => (
                    <tr
                      key={i}
                      className={`group ${onRowClick ? 'cursor-pointer hover:bg-surface/50 transition-colors' : ''}`}
                      onClick={() => onRowClick && onRowClick(row)}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="px-5 py-3.5 text-sm text-slate-700 whitespace-nowrap"
                        >
                          {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedData.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full mt-4 py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
              >
                Load More ({sortedData.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
