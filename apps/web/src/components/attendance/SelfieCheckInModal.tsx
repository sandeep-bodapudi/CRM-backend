import React, { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';

type Step = 'PLACE' | 'SELFIE' | 'SURROUNDINGS' | 'SENDING';
const MAX_SIDE = 1600;

/** Grab the current camera frame as a JPEG (shrunk for a weak connection). */
function grab(video: HTMLVideoElement, mirror: boolean): Promise<Blob | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

/**
 * Duty-day / field-day check-in from the phone: a selfie with the office (logo)
 * or the project behind you, then a photo of the surroundings, plus where the
 * phone is. Taken live with the camera only (no gallery), so an old photo cannot
 * be used. Doubtful check-ins go to the manager; nothing is refused here.
 */
export const SelfieCheckInModal: React.FC<{ onClose: () => void; onDone: () => void }> = ({
  onClose,
  onDone,
}) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [step, setStep] = useState<Step>('PLACE');
  const [place, setPlace] = useState<'OFFICE' | 'FIELD'>('OFFICE');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [posError, setPosError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Location, asked once at the start.
  useEffect(() => {
    if (!navigator.geolocation) {
      setPosError('This phone cannot share its location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () =>
        setPosError(
          'Location is off. Turn it on for a check-in your manager will not need to check.',
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
    fetchWithAuth(`${API_BASE_URL}/projects?limit=200`)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => setProjects((d.projects || []).map((x: any) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
    } catch {
      setCamError(
        'The camera could not be opened. Allow camera access for this app and try again.',
      );
    }
  };

  useEffect(() => {
    if (step === 'SELFIE') startCamera('user');
    if (step === 'SURROUNDINGS') startCamera('environment');
    if (step === 'SENDING' || step === 'PLACE') stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const takeSelfie = async () => {
    if (!videoRef.current?.videoWidth) return;
    const b = await grab(videoRef.current, true);
    if (!b) return;
    setSelfie(b);
    setSelfieUrl(URL.createObjectURL(b));
    setStep('SURROUNDINGS');
  };

  const takeSurroundingsAndSend = async () => {
    if (!videoRef.current?.videoWidth || !selfie) return;
    const around = await grab(videoRef.current, false);
    if (!around) return;
    setStep('SENDING');
    try {
      const form = new FormData();
      form.append('selfie', selfie, 'selfie.jpg');
      form.append('surroundings', around, 'surroundings.jpg');
      form.append('place_type', place);
      if (place === 'FIELD' && projectId) form.append('project_id', projectId);
      if (pos) {
        form.append('latitude', String(pos.lat));
        form.append('longitude', String(pos.lng));
        form.append('accuracy', String(Math.round(pos.acc)));
      }
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/selfie-check-in`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError({ title: 'Check-in failed', message: data.error || 'Please try again.' } as any);
        setStep('SURROUNDINGS');
        return;
      }
      showToast(data.message || 'Checked in', data.flags?.length ? 'info' : 'success');
      onDone();
      onClose();
    } catch {
      showError({
        title: 'No connection',
        message: 'Your photos were not sent. Try again when the signal is back.',
      } as any);
      setStep('SURROUNDINGS');
    }
  };

  const hint =
    place === 'OFFICE'
      ? 'Keep the office (the RRH logo or reception) behind you, not a plain wall.'
      : 'Keep the project or site behind you.';

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Duty-day check-in
            </p>
            <h3 className="font-black text-navy-900 text-base">
              {step === 'PLACE'
                ? 'Where are you working today?'
                : step === 'SELFIE'
                  ? '1 of 2 · Your selfie'
                  : step === 'SURROUNDINGS'
                    ? '2 of 2 · Your surroundings'
                    : 'Checking in…'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <p
          className={`text-[11px] flex items-center gap-1 ${pos ? 'text-emerald-700' : 'text-amber-700'}`}
        >
          <MapPin className="w-3.5 h-3.5" />
          {pos
            ? `Location found (±${Math.round(pos.acc)} m)`
            : posError || 'Finding your location…'}
        </p>

        {step === 'PLACE' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['OFFICE', 'FIELD'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlace(p)}
                  className={`py-3 rounded-xl text-sm font-bold border ${place === p ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-300'}`}
                >
                  {p === 'OFFICE' ? 'In the office' : 'In the field / site'}
                </button>
              ))}
            </div>
            {place === 'FIELD' && (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
              >
                <option value="">Which project?</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setStep('SELFIE')}
              disabled={place === 'FIELD' && !projectId}
              className="w-full py-3 rounded-2xl bg-navy-900 text-white font-black text-sm disabled:opacity-40"
            >
              Next: take a selfie
            </button>
          </div>
        )}

        {(step === 'SELFIE' || step === 'SURROUNDINGS') && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              {step === 'SELFIE'
                ? hint
                : 'Now point the back camera at the office / site around you.'}
            </p>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${step === 'SELFIE' ? 'scale-x-[-1]' : ''}`}
                muted
              />
              {step === 'SELFIE' && (
                <div className="absolute inset-x-8 top-6 bottom-1/3 border-2 border-dashed border-white/60 rounded-[50%] pointer-events-none" />
              )}
              {selfieUrl && step === 'SURROUNDINGS' && (
                <img
                  src={selfieUrl}
                  alt="Your selfie"
                  className="absolute top-2 right-2 w-16 h-20 object-cover rounded-lg border-2 border-white"
                />
              )}
            </div>
            {camError && <p className="text-xs text-rose-700">{camError}</p>}
            <div className="flex gap-2">
              {step === 'SURROUNDINGS' && (
                <button
                  onClick={() => setStep('SELFIE')}
                  className="px-3 py-3 rounded-2xl border border-slate-300 text-xs font-bold flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retake selfie
                </button>
              )}
              <button
                onClick={step === 'SELFIE' ? takeSelfie : takeSurroundingsAndSend}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {step === 'SELFIE' ? 'Take selfie' : 'Take photo & check in'}
              </button>
            </div>
          </div>
        )}

        {step === 'SENDING' && (
          <p className="text-sm text-slate-500 py-8 text-center">Sending your photos…</p>
        )}
      </div>
    </div>
  );
};
