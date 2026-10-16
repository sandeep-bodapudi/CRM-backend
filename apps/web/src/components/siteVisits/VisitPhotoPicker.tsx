import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

const MAX_SIDE = 1600;

/**
 * Shrink a phone photo before it is sent: a 12 MB camera picture becomes a few
 * hundred KB, which matters on a weak connection at a site. Falls back to the
 * original file if the browser cannot decode it.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    return blob || file;
  } catch {
    return file;
  }
}

type State = 'idle' | 'uploading' | 'done' | 'failed';

/**
 * Take or choose the on-site photo for a running visit. It uploads as soon as it
 * is chosen (so a dropped connection costs one photo, not the whole form) and
 * can be retried; the chosen photo stays on screen until it has been saved.
 */
export const VisitPhotoPicker: React.FC<{
  visitId: number;
  alreadyHasPhoto: boolean;
  onBusyChange?: (busy: boolean) => void;
}> = ({ visitId, alreadyHasPhoto, onBusyChange }) => {
  const { fetchWithAuth } = useAuth();
  const [state, setState] = useState<State>(alreadyHasPhoto ? 'done' : 'idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<File | null>(null);

  useEffect(() => {
    onBusyChange?.(state === 'uploading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const upload = async (file: File) => {
    setState('uploading');
    setError('');
    try {
      const blob = await shrink(file);
      const form = new FormData();
      form.append('photo', blob, 'visit.jpg');
      const res = await fetchWithAuth(`${API_BASE_URL}/site-visits/${visitId}/proof-photo`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The photo could not be saved.');
      }
      pending.current = null;
      setState('done');
    } catch (e) {
      pending.current = file;
      setError(
        e instanceof Error && e.message !== 'Failed to fetch'
          ? e.message
          : 'No connection. Your photo is kept: tap retry when the signal is back.',
      );
      setState('failed');
    }
  };

  const choose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setError('Choose a photo.');
      setState('failed');
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload(file);
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold text-slate-700 uppercase">On-site photo</label>
      <div className="flex items-center gap-3">
        {preview ? (
          <img
            src={preview}
            alt="Chosen visit"
            className="w-20 h-20 rounded-xl object-cover border"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center">
            <Camera className="w-6 h-6 text-slate-400" />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="inline-block px-3 py-2 bg-navy-900 text-white text-xs font-bold rounded-xl cursor-pointer">
            {state === 'done' || preview ? 'Change photo' : 'Take or choose a photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choose}
              className="hidden"
            />
          </label>
          {state === 'uploading' && <p className="text-[11px] text-slate-500">Saving the photo…</p>}
          {state === 'done' && (
            <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Photo saved
            </p>
          )}
          {state === 'failed' && (
            <div className="space-y-1">
              <p className="text-[11px] text-rose-700">{error}</p>
              {pending.current && (
                <button
                  type="button"
                  onClick={() => pending.current && upload(pending.current)}
                  className="text-[11px] font-bold text-navy-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
