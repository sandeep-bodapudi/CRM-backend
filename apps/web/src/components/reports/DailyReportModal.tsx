import React, { useState, useEffect } from 'react';
import {
  FileText,
  Send,
  AlertCircle,
  X,
  Mic,
  MicOff,
  AlertTriangle,
  CheckSquare,
  Hash,
  Type,
  AlignLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import { FormSchemaField, SpeechRecognitionLike, SpeechRecognitionEventLike } from '../../types';

interface DailyReportProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  mode?: 'modal' | 'inline';
}

// Channel Partner Manager report fields (apps/api targets.ts preset) and the
// work-log kinds that count towards each.
const CPM_FIELD_SOURCES: Record<string, string[]> = {
  existingProspectsFollowup: ['ASSOCIATE_CALL'],
  newCalls: ['ASSOCIATE_NEW_CALL'],
  totalCalls: ['ASSOCIATE_CALL', 'ASSOCIATE_NEW_CALL'],
  newProspects: ['ASSOCIATE_PROSPECT'],
  associateOfficeVisits: ['ASSOCIATE_OFFICE_VISIT'],
  enrollments: ['ASSOCIATE_ENROLLMENT'],
  associateSiteVisits: ['ASSOCIATE_SITE_VISIT'],
  bookings: ['ASSOCIATE_BOOKING'],
};

export const DailyReportModal: React.FC<DailyReportProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  mode = 'modal',
}) => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const roleName = activeRole || user?.roles[0] || 'Agent';

  // Dynamic Form State
  const [formSchema, setFormSchema] = useState<FormSchemaField[]>([]);
  const [formResponses, setFormResponses] = useState<Record<string, string | boolean>>({});

  // Base Form State
  const [summaryNotes, setSummaryNotes] = useState('');
  const [belowTargetReason, setBelowTargetReason] = useState('');

  // Target Warning State
  const [isBelowTarget, setIsBelowTarget] = useState(false);
  const [missedWarning, setMissedWarning] = useState<string | null>(null);
  // The server judges calls by what was actually logged in the CRM, so it
  // can find the report below target even when the typed numbers aren't --
  // keep the explanation box open in that case instead of leaving the
  // employee stuck on an error with nowhere to type the reason.
  const [serverBelowTarget, setServerBelowTarget] = useState<string | null>(null);
  const [todayActivity, setTodayActivity] = useState<{
    calls: number;
    new_calls?: number;
    follow_up_calls?: number;
    leads_worked: number;
    work_log?: Record<string, number>;
  } | null>(null);
  // Work-log count behind each Channel Partner Manager report field; for
  // everyone else, the logged lead calls (split into first calls and
  // follow-ups by the server).
  const recordedFor = (fieldId: string): number | null => {
    if (roleName !== Roles.CHANNEL_PARTNER_MANAGER && todayActivity) {
      if (fieldId === 'callsMade') return todayActivity.calls;
      if (fieldId === 'newCalls') return todayActivity.new_calls ?? null;
      if (fieldId === 'followupsDone') return todayActivity.follow_up_calls ?? null;
    }
    const kinds = CPM_FIELD_SOURCES[fieldId];
    if (!kinds || !todayActivity?.work_log) return null;
    return kinds.reduce((n, k) => n + (todayActivity.work_log?.[k] || 0), 0);
  };

  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check speech recognition support
  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/reports/today-activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTodayActivity(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setHasSpeechSupport(!!SpeechRecognition);
  }, []);

  // Fetch active target (schema) on modal open
  useEffect(() => {
    if (isOpen) {
      fetchWithAuth(`${API_BASE_URL}/targets/my-target?role=${roleName}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.target && data.target.form_schema_json) {
            setFormSchema(data.target.form_schema_json);

            // Initialize Responses
            const initialResponses: Record<string, string | boolean> = {};
            data.target.form_schema_json.forEach((field: FormSchemaField) => {
              if (field.type === 'CHECKLIST') {
                initialResponses[field.id] = false;
              } else if (field.type === 'COUNT') {
                initialResponses[field.id] = '';
              } else {
                initialResponses[field.id] = '';
              }
            });
            setFormResponses(initialResponses);
          }
        })
        .catch(() => console.error('Failed to load target schema'));
    } else {
      // Reset state when closed
      setFormSchema([]);
      setFormResponses({});
      setSummaryNotes('');
      setBelowTargetReason('');
    }
  }, [isOpen]);

  // Check for below target counts dynamically based on schema targetValues
  useEffect(() => {
    if (!formSchema.length) return;

    const warnings: string[] = [];

    formSchema.forEach((field) => {
      if (field.type === 'COUNT' && field.targetValue && field.targetValue > 0) {
        const val = parseInt(String(formResponses[field.id]), 10) || 0;
        if (val < field.targetValue) {
          warnings.push(`${field.label} (${val}/${field.targetValue})`);
        }
      }
    });

    if (warnings.length > 0) {
      setIsBelowTarget(true);
      setMissedWarning(`Submitted count is below target: ${warnings.join(', ')}`);
    } else {
      setIsBelowTarget(false);
      setMissedWarning(null);
    }
  }, [formResponses, formSchema]);

  // Voice Dictation Toggle with Duplicate Word Prevention
  const [recognitionInstance, setRecognitionInstance] = useState<SpeechRecognitionLike | null>(
    null,
  );

  const toggleVoiceDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening && recognitionInstance) {
      recognitionInstance.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const baseText = summaryNotes;

      recognition.onstart = () => {
        setIsListening(true);
        setRecognitionInstance(recognition);
      };

      recognition.onend = () => {
        setIsListening(false);
        setRecognitionInstance(null);
      };

      recognition.onerror = () => {
        setIsListening(false);
        setRecognitionInstance(null);
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += text + ' ';
          } else {
            interimTranscript += text;
          }
        }

        const combined = `${baseText} ${finalTranscript} ${interimTranscript}`
          .replace(/\s+/g, ' ')
          .trim();

        setSummaryNotes(combined);
      };

      recognition.start();
    } catch (e) {
      console.error('Speech recognition error:', e);
      setIsListening(false);
    }
  };

  if (mode === 'modal' && !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Below Target Reason Check: Minimum 15 characters required if below target
    if ((isBelowTarget || serverBelowTarget) && belowTargetReason.trim().length < 15) {
      setErrorMessage(
        'Your metrics are below target. A valid explanation (minimum 15 characters) is required before submitting.',
      );
      return;
    }

    // Dynamic field validation
    for (const field of formSchema) {
      if (field.required) {
        const val = formResponses[field.id];
        if (
          val === '' ||
          val === undefined ||
          val === null ||
          (field.type === 'SHORT_TEXT' && String(val).trim() === '')
        ) {
          setErrorMessage(`Field "${field.label}" is required.`);
          return;
        }
      }
    }

    setIsLoading(true);

    try {
      // Map dynamic metrics directly
      const metrics: Record<string, any> = { ...formResponses };

      // Map to legacy fields for backward compatibility with older DB reports if needed
      // (The backend looks for these specifically in the legacy target_json logic, but we now use metrics_json)
      formSchema.forEach((field) => {
        if (field.type === 'COUNT') {
          // Total calls only: "New calls" / "Follow-up calls" fields are
          // parts of it and used to overwrite the total here.
          if (
            field.id === 'callsMade' ||
            (!formSchema.some((f) => f.id === 'callsMade') &&
              field.label.toLowerCase().includes('call'))
          )
            metrics.callsMade = parseInt(String(formResponses[field.id]), 10) || 0;
          if (field.label.toLowerCase().includes('visit'))
            metrics.siteVisits = parseInt(String(formResponses[field.id]), 10) || 0;
          if (
            field.label.toLowerCase().includes('deal') ||
            field.label.toLowerCase().includes('qualif')
          )
            metrics.leadsQualified = parseInt(String(formResponses[field.id]), 10) || 0;
        }
      });

      const res = await fetchWithAuth(`${API_BASE_URL}/reports/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_name: roleName,
          metrics,
          summary_notes: summaryNotes,
          below_target_reason: belowTargetReason || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.isBelowTarget) setServerBelowTarget(data.error || 'Below target');
        throw new Error(data.error || 'Failed to submit daily report');
      }

      onSuccess();
      if (onClose) onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResponseChange = (id: string, value: string | boolean) => {
    setFormResponses((prev) => ({ ...prev, [id]: value }));
  };

  const content = (
    <div
      className={`w-full flex flex-col ${mode === 'modal' ? 'max-w-2xl bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 animate-scaleUp relative max-h-[90vh]' : 'max-w-3xl mx-auto bg-white rounded-2xl p-8 shadow-sm border border-slate-200'}`}
    >
      {mode === 'modal' && onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="text-center mb-6 shrink-0">
        <div className="w-14 h-14 bg-navy-50 text-navy-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
          <FileText className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Daily Work Log</h2>
        <p className="text-xs text-slate-500 mt-1">
          Complete your required role checklist and metrics
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-xl border border-red-200 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar"
      >
        {todayActivity && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">
            <span className="font-bold">Recorded in the CRM today:</span> {todayActivity.calls} call
            {todayActivity.calls === 1 ? '' : 's'} logged
            {todayActivity.new_calls !== undefined &&
              ` (${todayActivity.new_calls} new · ${todayActivity.follow_up_calls ?? 0} follow-up)`}{' '}
            · {todayActivity.leads_worked} lead
            {todayActivity.leads_worked === 1 ? '' : 's'} worked. Your call target is checked
            against logged calls.
          </div>
        )}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs sticky top-0 z-10 backdrop-blur-md">
          <span className="text-slate-500 font-medium">Reporting Role:</span>
          <span className="font-bold text-navy-800 bg-navy-100/70 px-2.5 py-0.5 rounded-md">
            {roleName}
          </span>
        </div>

        {/* DYNAMIC FORM RENDERING */}
        {formSchema.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No specific metrics configured for your role. Proceed to submit your summary.
          </div>
        ) : (
          <div className="space-y-4">
            {formSchema.map((field) => (
              <div
                key={field.id}
                className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-navy-300 transition-colors"
              >
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                  {field.type === 'SHORT_TEXT' && <Type className="w-4 h-4 text-navy-600" />}
                  {field.type === 'LONG_TEXT' && <AlignLeft className="w-4 h-4 text-navy-600" />}
                  {field.type === 'COUNT' && <Hash className="w-4 h-4 text-navy-600" />}
                  {field.type === 'CHECKLIST' && <CheckSquare className="w-4 h-4 text-navy-600" />}

                  <span>{field.label}</span>
                  {field.required && <span className="text-red-500 ml-1">*</span>}

                  {field.type === 'COUNT' &&
                    field.targetValue !== undefined &&
                    field.targetValue > 0 && (
                      <span className="ml-auto text-[10px] uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded font-mono">
                        Target: {field.targetValue}
                      </span>
                    )}
                </label>

                <div>
                  {field.type === 'SHORT_TEXT' && (
                    <input
                      type="text"
                      value={String(formResponses[field.id] ?? '')}
                      onChange={(e) => handleResponseChange(field.id, e.target.value)}
                      required={field.required}
                      className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600"
                      placeholder="Your answer..."
                    />
                  )}

                  {field.type === 'LONG_TEXT' && (
                    <textarea
                      value={String(formResponses[field.id] ?? '')}
                      onChange={(e) => handleResponseChange(field.id, e.target.value)}
                      required={field.required}
                      rows={3}
                      className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600"
                      placeholder="Provide details..."
                    />
                  )}

                  {field.type === 'COUNT' && (
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={String(formResponses[field.id] ?? '')}
                        onChange={(e) => handleResponseChange(field.id, e.target.value)}
                        required={field.required}
                        className="w-32 p-3 text-lg font-mono text-center bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600"
                        placeholder="0"
                      />
                      {recordedFor(field.id) !== null && (
                        <span className="text-xs text-slate-500">
                          Recorded{' '}
                          {CPM_FIELD_SOURCES[field.id] && roleName === Roles.CHANNEL_PARTNER_MANAGER
                            ? 'in Work Log'
                            : 'in the CRM'}{' '}
                          today: <b>{recordedFor(field.id)}</b>{' '}
                          <button
                            type="button"
                            onClick={() =>
                              handleResponseChange(field.id, String(recordedFor(field.id)))
                            }
                            className="ml-1 font-bold text-navy-600 hover:text-navy-800"
                          >
                            Use this number
                          </button>
                        </span>
                      )}
                    </div>
                  )}

                  {field.type === 'CHECKLIST' && (
                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-navy-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={!!formResponses[field.id]}
                        onChange={(e) => handleResponseChange(field.id, e.target.checked)}
                        required={field.required && !formResponses[field.id]} // Standard HTML5 validation hack for required checkbox
                        className="w-5 h-5 text-navy-600 rounded border-slate-300 focus:ring-navy-500"
                      />
                      <span className="text-sm text-slate-700 font-medium">Mark as completed</span>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sub-Target Warning & Reason Box */}
        {(isBelowTarget || serverBelowTarget) && (
          <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 space-y-3 shadow-inner">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>{missedWarning || serverBelowTarget}</span>
            </div>
            <div>
              <label className="block text-sm font-bold text-amber-900 mb-1.5">
                Reason for Missing Target (Min 15 characters){' '}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                value={belowTargetReason}
                onChange={(e) => setBelowTargetReason(e.target.value)}
                required
                rows={2}
                placeholder="Explain why target was missed (e.g. Spent 3 hours on client site visit and contract review...)"
                className="w-full p-3 text-sm bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
              <div className="text-right mt-1">
                <span
                  className={`text-[11px] font-mono font-bold ${belowTargetReason.length < 15 ? 'text-amber-600' : 'text-emerald-600'}`}
                >
                  Length: {belowTargetReason.length} / 15
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Always-Visible Summary Text Area + Mic Dictation Button */}
        <div className="pt-2 border-t border-slate-100 mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-bold text-slate-800">
              General Work Accomplished Summary
              <span className="text-red-500 ml-1">*</span>
            </label>

            {/* Silent Fallback: Mic button only renders if browser speech recognition is supported */}
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm border ${
                  isListening
                    ? 'bg-red-500 text-white border-red-600 animate-pulse'
                    : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'
                }`}
                title={isListening ? 'Stop Listening' : 'Speak to Dictate Notes'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isListening ? 'Listening...' : 'Voice Dictate'}</span>
              </button>
            )}
          </div>

          <textarea
            value={summaryNotes}
            onChange={(e) => setSummaryNotes(e.target.value)}
            required
            minLength={5}
            rows={3}
            placeholder="Describe key tasks completed, follow-ups, or accomplishments today..."
            className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-navy-600 focus:bg-white"
          />
        </div>

        <div className="pt-4 sticky bottom-0 bg-white pb-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-navy-700 hover:bg-navy-800 text-white font-bold text-lg rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Submit Final Log & Unlock Logout</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  if (mode === 'inline') {
    return <div className="py-8 px-4 w-full h-full overflow-y-auto">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      {content}
    </div>
  );
};
