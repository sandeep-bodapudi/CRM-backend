import React, { useEffect, useState } from 'react';
import { Star, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { getFeedbackInfo, submitFeedback, FeedbackLinkError } from '../../api/feedback';

interface PublicFeedbackFormProps {
  token: string;
}

type LoadState = 'loading' | 'ready' | 'already-submitted' | 'invalid' | 'submitted';

const YES_NO_QUESTIONS: {
  key: 'onTime' | 'answeredQuestions' | 'propertyAsDescribed';
  label: string;
}[] = [
  { key: 'onTime', label: 'Were you attended to on time?' },
  { key: 'answeredQuestions', label: 'Did our team answer your questions properly?' },
  { key: 'propertyAsDescribed', label: 'Was the project or property as described to you?' },
];

// § Phase 7 — reached with no login via a WhatsApp link; this page renders
// completely outside the authenticated app shell (see App.tsx's early-return
// branch for /feedback/:token, same pattern as /kiosk).
export const PublicFeedbackForm: React.FC<PublicFeedbackFormProps> = ({ token }) => {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ratedEmployeeName, setRatedEmployeeName] = useState('');

  const [rating, setRating] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      setErrorMessage('This feedback link is missing its token.');
      return;
    }
    getFeedbackInfo(token)
      .then((info) => {
        setRatedEmployeeName(info.ratedEmployeeName);
        setState(info.alreadySubmitted ? 'already-submitted' : 'ready');
      })
      .catch((err: FeedbackLinkError) => {
        setState('invalid');
        setErrorMessage(err.message);
      });
  }, [token]);

  const allAnswered = rating > 0 && YES_NO_QUESTIONS.every((q) => answers[q.key] !== undefined);

  const handleSubmit = async () => {
    if (!token || !allAnswered) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await submitFeedback(token, {
        rating,
        onTime: !!answers.onTime,
        answeredQuestions: !!answers.answeredQuestions,
        propertyAsDescribed: !!answers.propertyAsDescribed,
        comment: comment.trim() || undefined,
      });
      setState('submitted');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading your feedback form…</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <XCircle className="w-10 h-10 text-red-400" />
            <h1 className="text-lg font-bold text-slate-800">Link no longer works</h1>
            <p className="text-sm text-slate-500">{errorMessage}</p>
          </div>
        )}

        {state === 'already-submitted' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-teal-500" />
            <h1 className="text-lg font-bold text-slate-800">Already received</h1>
            <p className="text-sm text-slate-500">
              Thanks — we already have your feedback for this visit.
            </p>
          </div>
        )}

        {state === 'submitted' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-teal-500" />
            <h1 className="text-lg font-bold text-slate-800">Thank you!</h1>
            <p className="text-sm text-slate-500">Your feedback helps us improve every visit.</p>
          </div>
        )}

        {state === 'ready' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-800">How was your visit?</h1>
              <p className="text-sm text-slate-500 mt-1">
                Tell us about your visit with{' '}
                <span className="font-semibold text-slate-700">{ratedEmployeeName}</span> — it takes
                under a minute.
              </p>
            </div>

            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  className="p-1"
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                  />
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {YES_NO_QUESTIONS.map((q) => (
                <div key={q.key} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-700">{q.label}</p>
                  <div className="flex gap-2 shrink-0">
                    {(['Yes', 'No'] as const).map((label) => {
                      const value = label === 'Yes';
                      const selected = answers[q.key] === value;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            selected
                              ? 'bg-navy-600 border-navy-600 text-white'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Anything else? (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={2000}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300 resize-none"
                placeholder="Tell us more…"
              />
            </div>

            {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}

            <button
              onClick={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-navy-600 hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Submit Feedback
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
