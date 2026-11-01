import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Megaphone, HardHat, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { resolveImageUrl } from '../../utils/imageUtils';
import {
  listProjectUpdates,
  postProjectUpdate,
  deleteProjectUpdate,
  ProjectUpdate,
  ProjectUpdateKind,
} from '../../api/projectMedia';

const MAX_PHOTOS = 6;

const KINDS: { value: ProjectUpdateKind; label: string; hint: string }[] = [
  {
    value: 'PROGRESS',
    label: 'Construction progress',
    hint: 'What was done on site, with photos.',
  },
  {
    value: 'ANNOUNCEMENT',
    label: 'Announcement',
    hint: 'Registration dates, handover, events, office notices.',
  },
];

/**
 * Posts that buyers of this project see in the My Property portal. Each post
 * also sends every buyer a notification.
 */
export const ProjectCustomerUpdatesTab: React.FC<{ projectId: number; canEdit: boolean }> = ({
  projectId,
  canEdit,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [buyerCount, setBuyerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ProjectUpdateKind>('PROGRESS');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    listProjectUpdates(fetchWithAuth, projectId)
      .then((r) => {
        setUpdates(r.updates);
        setBuyerCount(r.buyerCount);
      })
      .catch(() => showError({ message: 'Could not load customer updates' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = '';
  };

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return showError({ message: 'Give the update a heading' });
    if (message.trim().length < 3)
      return showError({ message: 'Write what you want to tell buyers' });
    setPosting(true);
    try {
      const r = await postProjectUpdate(fetchWithAuth, projectId, {
        kind,
        title: title.trim(),
        message: message.trim(),
        photos,
      });
      const n = r.update.notified_count;
      showToast({
        message: n
          ? `Posted. ${n} ${n === 1 ? 'buyer was' : 'buyers were'} notified.`
          : 'Posted. This project has no buyers yet, so nobody was notified.',
        type: 'success',
      });
      setTitle('');
      setMessage('');
      setPhotos([]);
      load();
    } catch (err: any) {
      showError({ message: err?.message || 'Could not post the update' });
    } finally {
      setPosting(false);
    }
  };

  const remove = async (u: ProjectUpdate) => {
    if (
      !window.confirm(
        'Remove this update? It disappears from My Property, along with the notification buyers got.',
      )
    )
      return;
    setRemovingId(u.id);
    try {
      await deleteProjectUpdate(fetchWithAuth, projectId, u.id);
      showToast({ message: 'Update removed', type: 'success' });
      load();
    } catch (err: any) {
      showError({ message: err?.message || 'Could not remove the update' });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={post}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-card"
        >
          <div>
            <h3 className="font-bold text-slate-800">Post an update for buyers</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Shown in My Property to everyone who has booked in this project
              {buyerCount ? ` (${buyerCount} ${buyerCount === 1 ? 'buyer' : 'buyers'})` : ''}, and
              each of them gets a notification.
            </p>
          </div>

          <fieldset className="grid sm:grid-cols-2 gap-2">
            <legend className="sr-only">Type of update</legend>
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex gap-3 items-start p-3 rounded-xl border cursor-pointer ${
                  kind === k.value ? 'border-navy-600 bg-navy-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={kind === k.value}
                  onChange={() => setKind(k.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">{k.label}</span>
                  <span className="block text-xs text-slate-500">{k.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Heading</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={
                kind === 'PROGRESS'
                  ? 'Internal roads laid in Phase 1'
                  : 'Registrations start 15 Nov'
              }
              className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={3000}
              rows={4}
              placeholder="Write it the way you would tell a buyer on the phone."
              className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-sm"
            />
          </label>

          <div>
            <div className="flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200"
                >
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 bg-slate-900/70 text-white p-0.5 rounded-full"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center text-[11px] font-bold hover:border-navy-400"
                >
                  <ImagePlus size={18} />
                  Add photo
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={addPhotos}
            />
            <p className="text-xs text-slate-400 mt-1.5">Up to {MAX_PHOTOS} photos.</p>
          </div>

          <button
            type="submit"
            disabled={posting}
            className="flex items-center gap-2 px-5 py-2.5 bg-navy-600 text-white rounded-xl text-sm font-bold hover:bg-navy-700 disabled:opacity-50"
          >
            {posting && <Loader2 size={16} className="animate-spin" />}
            {posting ? 'Posting…' : 'Post update'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="animate-spin text-navy-400" size={28} />
        </div>
      ) : updates.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <p className="font-bold">No updates posted yet</p>
          <p className="text-xs mt-1">
            Buyers see what you post here in My Property, newest first.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => {
            const Icon = u.kind === 'ANNOUNCEMENT' ? Megaphone : HardHat;
            return (
              <li key={u.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <Icon size={18} className="text-navy-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-800">{u.title}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {u.posted_by?.full_name ? `, by ${u.posted_by.full_name}` : ''}
                        {`, ${u.notified_count} notified`}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => remove(u)}
                      disabled={removingId === u.id}
                      aria-label="Remove update"
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      {removingId === u.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{u.message}</p>
                {u.photos && u.photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                    {u.photos.map((src) => (
                      <a key={src} href={resolveImageUrl(src)} target="_blank" rel="noreferrer">
                        <img
                          src={resolveImageUrl(src)}
                          alt=""
                          className="aspect-square w-full object-cover rounded-lg border border-slate-200"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
