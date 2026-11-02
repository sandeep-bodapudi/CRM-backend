import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, MapPin, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError } from '../../utils/userFacingError';
import { listProjectUnits, ProjectUnit } from '../../api/projectUnits';
import { ProjectLayoutViewer, LayoutRegion } from './ProjectLayoutViewer';
import { ProjectLayoutEditor } from './ProjectLayoutEditor';

interface LayoutImage {
  id: number;
  image_url: string;
  title: string | null;
  is_primary: boolean;
  regions: LayoutRegion[];
}

/**
 * Site-plan / layout images with unit pins (Location tab). Pins point at the
 * project's units and take their colour from each unit's live sales status.
 * Reconnected 2026-11-02 after the unit model moved from Property to
 * ProjectUnit (the tab had shown a "will reappear shortly" note instead).
 */
export const ProjectLayoutTab: React.FC<{ projectId: number; canEdit: boolean }> = ({
  projectId,
  canEdit,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [images, setImages] = useState<LayoutImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<LayoutImage | null>(null);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/layout-images`)
      .then(async (res) => {
        if (!res.ok) return handleApiError(res, showError);
        setImages((await res.json()).images || []);
      })
      .catch(() => showError({ message: 'Failed to load layout images' }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('title', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/layout-images`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) return handleApiError(res, showError);
      showToast('Layout image uploaded', 'success');
      load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (img: LayoutImage) => {
    if (!window.confirm('Delete this layout image and all its pins?')) return;
    const res = await fetchWithAuth(
      `${API_BASE_URL}/projects/${projectId}/layout-images/${img.id}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return handleApiError(res, showError);
    showToast('Layout image deleted', 'success');
    load();
  };

  const openEditor = async (img: LayoutImage) => {
    try {
      const { units: list } = await listProjectUnits(fetchWithAuth, projectId, { limit: 200 });
      setUnits(list);
      setEditing(img);
    } catch {
      showError({ message: 'Failed to load the units to pin' });
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
          Site Plan & Unit Pins
        </h3>
        {canEdit && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Upload layout image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={upload}
            />
          </>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-navy-400" />
        </div>
      ) : images.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          No layout image yet.
          {canEdit ? ' Upload the site plan, then place a pin on each unit.' : ''}
        </p>
      ) : (
        images.map((img) => (
          <div key={img.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-600">
                {img.title || 'Layout'} · {img.regions.length} pin(s)
              </p>
              {canEdit && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => openEditor(img)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit pins
                  </button>
                  <button
                    onClick={() => remove(img)}
                    aria-label="Delete layout image"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <ProjectLayoutViewer imageUrl={img.image_url} title={img.title} regions={img.regions} />
          </div>
        ))
      )}

      {editing && (
        <ProjectLayoutEditor
          projectId={projectId}
          imageId={editing.id}
          imageUrl={editing.image_url}
          units={units}
          existingRegions={editing.regions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};
