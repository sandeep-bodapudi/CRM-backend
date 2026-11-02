import React, { useState, useRef, useCallback } from 'react';
import { X, Trash2, Check, Search, MousePointerClick } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { ProjectUnit } from '../../api/projectUnits';
import { resolveImageUrl } from '../../utils/imageUtils';

interface ExistingRegion {
  id: number;
  project_unit_id: number;
  x: number;
  y: number;
}

/** "Tower A A-503", "Plot 12" — what staff call the unit. */
export const unitLabel = (u: {
  unit_type?: string;
  tower?: string | null;
  block?: string | null;
  unit_number: string;
}) =>
  [u.tower, u.block, u.unit_type === 'PLOT' ? `Plot ${u.unit_number}` : u.unit_number]
    .filter(Boolean)
    .join(' ');

interface EditorPin {
  tempId: string;
  regionId?: number; // present if this pin already exists in the DB
  project_unit_id: number | null; // null while awaiting assignment
  x: number;
  y: number;
}

interface ProjectLayoutEditorProps {
  projectId: number;
  imageId: number;
  imageUrl: string;
  units: ProjectUnit[];
  existingRegions: ExistingRegion[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Phase 2.25: click-to-place pins on a layout image, assign each to a unit,
 * drag to reposition, remove, then save. Saving does a bulk upsert (Phase
 * 2.23's PUT .../regions) for assigned pins plus individual DELETEs for any
 * pin that existed before this session but was removed here — there's no
 * single "replace all regions" endpoint by design, since a blind
 * delete-then-recreate would needlessly reassign IDs for pins that didn't change.
 */
export const ProjectLayoutEditor: React.FC<ProjectLayoutEditorProps> = ({
  projectId,
  imageId,
  imageUrl,
  units,
  existingRegions,
  onClose,
  onSaved,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pins, setPins] = useState<EditorPin[]>(() =>
    existingRegions.map((r) => ({
      tempId: `existing-${r.id}`,
      regionId: r.id,
      project_unit_id: r.project_unit_id,
      x: r.x,
      y: r.y,
    })),
  );
  const [removedRegionIds, setRemovedRegionIds] = useState<number[]>([]);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [unitSearch, setUnitSearch] = useState('');
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pinnedUnitIds = new Set(
    pins.filter((p) => p.project_unit_id !== null).map((p) => p.project_unit_id),
  );
  const unitById = (id: number | null) => units.find((u) => u.id === id);

  const fractionFromEvent = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const handleImageClick = (e: React.MouseEvent) => {
    if (draggingPinId) return; // a drag's mouseup already handled this click
    const { x, y } = fractionFromEvent(e.clientX, e.clientY);
    const tempId = `new-${Date.now()}`;
    setPins((prev) => [...prev, { tempId, project_unit_id: null, x, y }]);
    setActivePinId(tempId);
    setUnitSearch('');
  };

  const handlePinMouseDown = (e: React.MouseEvent, tempId: string) => {
    e.stopPropagation();
    setDraggingPinId(tempId);
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!draggingPinId) return;
    const { x, y } = fractionFromEvent(e.clientX, e.clientY);
    setPins((prev) => prev.map((p) => (p.tempId === draggingPinId ? { ...p, x, y } : p)));
  };

  const handleContainerMouseUp = () => {
    setDraggingPinId(null);
  };

  const assignUnit = (tempId: string, unitId: number) => {
    setPins((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, project_unit_id: unitId } : p)),
    );
    setActivePinId(null);
  };

  const removePin = (tempId: string) => {
    const pin = pins.find((p) => p.tempId === tempId);
    if (pin?.regionId) setRemovedRegionIds((prev) => [...prev, pin.regionId!]);
    setPins((prev) => prev.filter((p) => p.tempId !== tempId));
    setActivePinId(null);
  };

  const handleSave = async () => {
    const assignedPins = pins.filter((p) => p.project_unit_id !== null);
    const unassignedCount = pins.length - assignedPins.length;
    if (unassignedCount > 0) {
      showError({
        message: `${unassignedCount} pin(s) still need a unit assigned before saving — assign or remove them first.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      if (assignedPins.length > 0) {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/projects/${projectId}/layout-images/${imageId}/regions`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              regions: assignedPins.map((p) => ({
                project_unit_id: p.project_unit_id,
                x: p.x,
                y: p.y,
              })),
            }),
          },
        );
        if (!res.ok) {
          await handleApiError(res, showError);
          setIsSaving(false);
          return;
        }
        const data = await res.json();
        if (data.failed?.length > 0) {
          showError({
            message: `${data.failed.length} pin(s) failed to save: ${data.failed[0].error}`,
          });
          setIsSaving(false);
          return;
        }
      }

      for (const regionId of removedRegionIds) {
        const res = await fetchWithAuth(`${API_BASE_URL}/projects/layout-regions/${regionId}`, {
          method: 'DELETE',
        });
        // A refused removal used to be ignored and "Layout pins saved" shown anyway.
        if (!res.ok) {
          await handleApiError(res, showError);
          setIsSaving(false);
          return;
        }
      }

      showToast('Layout pins saved', 'success');
      onSaved();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const activePin = pins.find((p) => p.tempId === activePinId);
  const availableUnits = units.filter(
    (u) =>
      (!pinnedUnitIds.has(u.id) || u.id === activePin?.project_unit_id) &&
      (unitSearch === '' ||
        unitLabel(u).toLowerCase().includes(unitSearch.toLowerCase()) ||
        u.unit_code.toLowerCase().includes(unitSearch.toLowerCase())),
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-lg">Layout Editor</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <MousePointerClick className="w-3.5 h-3.5" /> Click anywhere on the image to place a
              pin, drag existing pins to reposition
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-crosshair select-none"
            onClick={handleImageClick}
            onMouseMove={handleContainerMouseMove}
            onMouseUp={handleContainerMouseUp}
            onMouseLeave={handleContainerMouseUp}
          >
            <img
              ref={imageRef}
              src={resolveImageUrl(imageUrl)}
              alt="Layout"
              className="w-full h-auto block pointer-events-none"
              draggable={false}
            />

            {pins.map((pin) => {
              const unit = unitById(pin.project_unit_id);
              const isUnassigned = pin.project_unit_id === null;
              return (
                <button
                  key={pin.tempId}
                  onMouseDown={(e) => handlePinMouseDown(e, pin.tempId)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePinId(pin.tempId);
                    setUnitSearch('');
                  }}
                  style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-lg cursor-move flex items-center justify-center text-white text-[10px] font-black ${
                    isUnassigned ? 'bg-amber-500 animate-pulse' : 'bg-navy-600'
                  } ${activePinId === pin.tempId ? 'ring-2 ring-offset-2 ring-navy-500 scale-125' : ''}`}
                  title={unit ? unitLabel(unit) : 'Unassigned — click to assign a unit'}
                >
                  {isUnassigned ? '?' : ''}
                </button>
              );
            })}
          </div>

          {activePin && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-700 text-sm">
                  {activePin.project_unit_id ? 'Reassign this pin' : 'Assign a unit to this pin'}
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => removePin(activePin.tempId)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold hover:bg-rose-100"
                  >
                    <Trash2 className="w-3 h-3" /> Remove Pin
                  </button>
                  <button
                    onClick={() => setActivePinId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={unitSearch}
                  onChange={(e) => setUnitSearch(e.target.value)}
                  placeholder="Search units by title or code..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableUnits.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">
                    No unassigned units match.
                  </p>
                ) : (
                  availableUnits.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => assignUnit(activePin.tempId, u.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        activePin.project_unit_id === u.id
                          ? 'bg-navy-100 text-navy-800'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="font-semibold">{unitLabel(u)}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        {u.unit_code}
                        {activePin.project_unit_id === u.id && (
                          <Check className="w-3.5 h-3.5 text-navy-600" />
                        )}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            {pins.length} pin{pins.length !== 1 ? 's' : ''} placed
            {pins.some((p) => p.project_unit_id === null) && (
              <span className="text-amber-600 font-semibold"> — some unassigned</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-navy-700 hover:bg-navy-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-60 text-sm"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Layout'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
