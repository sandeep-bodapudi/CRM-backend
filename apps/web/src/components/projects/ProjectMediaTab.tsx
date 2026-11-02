import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Star, ImageIcon, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { resolveImageUrl } from '../../utils/imageUtils';
import {
  listProjectMedia,
  uploadProjectMedia,
  deleteProjectMedia,
  ProjectMedia,
  ProjectMediaKind,
} from '../../api/projectMedia';

// What each kind may be (the API checks the same, and the real file bytes).
const ACCEPT_BY_KIND: Record<string, string> = {
  COVER: 'image/jpeg,image/png,image/webp,image/gif',
  GALLERY: 'image/jpeg,image/png,image/webp,image/gif',
  VIDEO: 'video/mp4,video/webm,video/quicktime',
  BROCHURE: 'application/pdf,image/jpeg,image/png,image/webp',
  MASTER_PLAN: 'application/pdf,image/jpeg,image/png,image/webp',
  LAYOUT_PLAN: 'application/pdf,image/jpeg,image/png,image/webp',
  FLOOR_PLAN: 'application/pdf,image/jpeg,image/png,image/webp',
};
const HINT_BY_KIND: Record<string, string> = {
  VIDEO: 'MP4, WebM or MOV, up to 50 MB.',
  BROCHURE: 'PDF up to 20 MB, or an image.',
  MASTER_PLAN: 'PDF up to 20 MB, or an image.',
  LAYOUT_PLAN: 'PDF up to 20 MB, or an image.',
  FLOOR_PLAN: 'PDF up to 20 MB, or an image.',
};
const fileTypeOf = (url: string) => {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  return ext === 'pdf' ? 'pdf' : ['mp4', 'webm', 'mov'].includes(ext) ? 'video' : 'image';
};

const KIND_LABELS: { value: ProjectMediaKind; label: string }[] = [
  { value: 'COVER', label: 'Cover Image' },
  { value: 'GALLERY', label: 'Gallery' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'BROCHURE', label: 'Brochure' },
  { value: 'MASTER_PLAN', label: 'Master Plan' },
  { value: 'LAYOUT_PLAN', label: 'Layout Plan' },
  { value: 'FLOOR_PLAN', label: 'Floor Plan' },
];

export const ProjectMediaTab: React.FC<{ projectId: number; onCoverChanged?: () => void }> = ({
  projectId,
  onCoverChanged,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [media, setMedia] = useState<ProjectMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadKind, setUploadKind] = useState<ProjectMediaKind>('GALLERY');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    listProjectMedia(fetchWithAuth, projectId)
      .then((r) => setMedia(r.media))
      .catch(() => showError({ message: 'Failed to load media' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadProjectMedia(fetchWithAuth, projectId, file, uploadKind);
      showToast({ message: 'Media uploaded successfully', type: 'success' });
      load();
      if (uploadKind === 'COVER') onCoverChanged?.();
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to upload media' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (item: ProjectMedia) => {
    if (!window.confirm('Delete this media file?')) return;
    setDeletingId(item.id);
    try {
      await deleteProjectMedia(fetchWithAuth, projectId, item.id);
      showToast({ message: 'Media deleted', type: 'success' });
      load();
      if (item.kind === 'COVER') onCoverChanged?.();
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to delete media' });
    } finally {
      setDeletingId(null);
    }
  };

  const grouped = KIND_LABELS.map((k) => ({
    ...k,
    items: media.filter((m) => m.kind === k.value),
  }));

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="animate-spin text-navy-400" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <select
          value={uploadKind}
          onChange={(e) => setUploadKind(e.target.value as ProjectMediaKind)}
          className="p-2.5 border border-slate-200 rounded-xl text-sm bg-white"
        >
          {KIND_LABELS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-600 text-white rounded-xl text-sm font-bold hover:bg-navy-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload {uploadKind === 'COVER' ? 'Cover Image' : 'File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_BY_KIND[uploadKind] || 'image/*'}
          className="hidden"
          onChange={handleFileSelect}
        />
        <p className="text-xs text-slate-400">
          {HINT_BY_KIND[uploadKind] ||
            'Images up to 10 MB, auto-optimized to WebP. A new Cover Image replaces the current one.'}
        </p>
      </div>

      {media.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-bold text-slate-500">No media uploaded yet</p>
          <p className="text-xs mt-1">
            Upload a cover image, gallery photos, a video, a brochure PDF, or plans above.
          </p>
        </div>
      ) : (
        grouped
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <div key={group.value}>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                {group.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video"
                  >
                    {fileTypeOf(item.url) === 'video' ? (
                      <video
                        src={resolveImageUrl(item.url)}
                        controls
                        preload="metadata"
                        className="w-full h-full object-cover bg-black"
                      />
                    ) : fileTypeOf(item.url) === 'pdf' ? (
                      <a
                        href={resolveImageUrl(item.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-navy-700"
                      >
                        <FileText size={28} />
                        <span className="text-xs font-bold px-2 text-center line-clamp-2">
                          {item.title || `${group.label} (PDF)`}
                        </span>
                      </a>
                    ) : (
                      <img
                        src={resolveImageUrl(item.url)}
                        alt={item.title || group.label}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {item.kind === 'COVER' && (
                      <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Star size={10} fill="currentColor" /> COVER
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      aria-label={`Delete ${item.title || group.label}`}
                      className="absolute top-1.5 right-1.5 bg-rose-600/90 text-white p-1.5 rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      {deletingId === item.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
};
