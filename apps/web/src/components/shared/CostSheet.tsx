import React from 'react';
import { PriceComputation } from '../../api/projectUnits';

// The one cost-sheet renderer for the whole rebuild (implementation plan
// section 7.1): the Add Unit flow's live preview, the Unit Detail page, and
// eventually the standalone Property pricing tab all render through this —
// one place that knows how a builder cost sheet is laid out, so the figures
// never drift between screens. Every number it shows comes from the server
// (services/pricing/engine.ts); this component does no arithmetic of its own.

interface CostSheetProps {
  computation: PriceComputation;
  /** override_price when set, else computation.calculated_price — what the buyer actually pays. */
  finalPrice?: number | null;
  overridePrice?: number | null;
  overrideReason?: string | null;
  overriddenByName?: string | null;
  overriddenAt?: string | null;
  className?: string;
}

function money(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export const CostSheet: React.FC<CostSheetProps> = ({
  computation,
  finalPrice,
  overridePrice,
  overrideReason,
  overriddenByName,
  overriddenAt,
  className,
}) => {
  const baseLines = computation.lines.filter((l) => l.kind === 'BASE_RATE');
  const premiumLines = computation.lines.filter((l) => l.kind === 'PREMIUM');
  const chargeLines = computation.lines.filter((l) => l.kind === 'CHARGE');
  const taxLines = computation.lines.filter((l) => l.kind === 'TAX');
  const isOverridden = overridePrice != null;

  const Row: React.FC<{
    label: React.ReactNode;
    value: number;
    muted?: boolean;
    bold?: boolean;
  }> = ({ label, value, muted, bold }) => (
    <div className={`flex justify-between text-xs ${bold ? 'font-black text-sm' : ''}`}>
      <span className={muted ? 'text-slate-500 italic' : 'text-slate-600'}>{label}</span>
      <span className={`font-semibold tabular-nums ${bold ? 'text-navy-900' : 'text-slate-800'}`}>
        {money(value)}
      </span>
    </div>
  );

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {baseLines.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Base Price</p>
          {baseLines.map((l, i) => (
            <Row
              key={i}
              label={
                l.quantity !== 1
                  ? `${l.label} (${l.quantity.toLocaleString('en-IN')} × ${money(l.rate)})`
                  : l.label
              }
              value={l.amount}
              muted={l.is_manual}
            />
          ))}
        </div>
      )}

      {premiumLines.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Premiums</p>
          {premiumLines.map((l, i) => (
            <Row
              key={i}
              label={
                l.quantity !== 1
                  ? `${l.label} (${l.quantity.toLocaleString('en-IN')} × ${money(l.rate)})`
                  : l.label
              }
              value={l.amount}
              muted={l.is_manual}
            />
          ))}
        </div>
      )}

      {chargeLines.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
            Additional Charges
          </p>
          {chargeLines.map((l, i) => (
            <Row
              key={i}
              label={
                l.quantity !== 1
                  ? `${l.label} (${l.quantity.toLocaleString('en-IN')} × ${money(l.rate)})`
                  : `${l.label}${l.is_refundable ? ' (refundable)' : ''}`
              }
              value={l.amount}
              muted={l.is_manual}
            />
          ))}
        </div>
      )}

      {computation.discount_amount > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="flex justify-between text-xs text-rose-600">
            <span>Discount</span>
            <span className="font-semibold tabular-nums">
              −{money(computation.discount_amount)}
            </span>
          </div>
        </div>
      )}

      <div className="pt-2 border-t-2 border-navy-200">
        <Row label="Calculated Price" value={computation.calculated_price} bold />
      </div>

      {taxLines.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">
            Taxes (shown separately)
          </p>
          {taxLines.map((l, i) => (
            <Row key={i} label={l.label} value={l.amount} />
          ))}
          <div className="flex justify-between text-xs font-bold text-slate-700 pt-1 border-t border-slate-100">
            <span>All-Inclusive Price</span>
            <span className="tabular-nums">
              {money(computation.calculated_price + computation.taxes_total)}
            </span>
          </div>
        </div>
      )}

      {isOverridden ? (
        <div className="pt-2 border-t-2 border-amber-300 bg-amber-50 -mx-3 px-3 py-2 rounded-b-xl space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Calculated Price (unchanged)</span>
            <span className="tabular-nums">{money(computation.calculated_price)}</span>
          </div>
          <div className="flex justify-between text-sm font-black text-amber-800">
            <span>Final Selling Price (override)</span>
            <span className="tabular-nums">{money(overridePrice!)}</span>
          </div>
          {overrideReason && <p className="text-[11px] text-amber-700">Reason: {overrideReason}</p>}
          {(overriddenByName || overriddenAt) && (
            <p className="text-[10px] text-amber-600">
              {overriddenByName ? `by ${overriddenByName}` : ''}
              {overriddenByName && overriddenAt ? ' · ' : ''}
              {overriddenAt ? new Date(overriddenAt).toLocaleString('en-IN') : ''}
            </p>
          )}
        </div>
      ) : (
        finalPrice != null &&
        finalPrice !== computation.calculated_price && (
          <div className="flex justify-between text-sm font-black text-navy-900 pt-1">
            <span>Final Selling Price</span>
            <span className="tabular-nums">{money(finalPrice)}</span>
          </div>
        )
      )}

      {computation.warnings.length > 0 && (
        <div className="pt-2 space-y-1">
          {computation.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-600">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
