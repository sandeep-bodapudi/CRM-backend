import React, { useEffect, useState } from 'react';
import { MessageSquareText, Save, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import {
  substituteTemplatePreview,
  SAMPLE_PREVIEW_CONTEXT,
  TEMPLATE_PLACEHOLDERS,
} from '../../utils/messageTemplatePreview';

interface MessageTemplate {
  template_key: string;
  name: string;
  body_text: string;
  is_active: boolean;
}

// Canonical keys + a display name and the exact default fallback text the
// backend sends when no row exists yet for that key (kept in sync with
// apps/api/src/services/messageTemplate.service.ts's resolveWithFallback —
// shown so the admin can see what's actually going out today before they've
// customized anything).
const TEMPLATE_DEFS: { key: string; name: string; defaultBody: string }[] = [
  {
    key: 'LEAD_QUALIFIED_PROPERTIES',
    name: 'Property Proposal (auto-matched)',
    defaultBody:
      '🏡 *EXCLUSIVE PROPERTY PROPOSAL FROM RADHA REAL HOMES*\n\nDear *{customer_name}*,\n\nWe found a premium property matching your exact requirements!\n\n📌 *Title*: {property_name}\n📍 *Location*: {property_location}\n💰 *Asking Price*: {property_price}\n🔗 *View Details*: {property_url}\n\n📞 *Your Dedicated Relationship Manager*:\n{pm_name} ({pm_phone})\n\nReply to this message or call us directly to schedule an exclusive site visit!',
  },
  {
    key: 'LEAD_PROPERTY_PROPOSAL',
    name: 'Property Proposal (manual share)',
    defaultBody:
      '🏡 *EXCLUSIVE PROPERTY PROPOSAL*\n\nDear *{customer_name}*,\n\nWe found a premium property matching your requirements!\n\n📌 *Title*: {property_name} ({property_code})\n📍 *Location*: {property_location}\n💰 *Asking Price*: {property_price}\n🔗 *View Details*: {property_url}\n\nContact {pm_name} / {agent_name} to schedule a site visit.\nRef: {lead_code}',
  },
  {
    key: 'DEMO_SCHEDULED',
    name: 'Demo Scheduled',
    defaultBody:
      'Dear {customer_name}, your demo is scheduled for {visit_date} at {visit_time}. Please be available.',
  },
  {
    key: 'SITE_VISIT_SCHEDULED',
    name: 'Site Visit Scheduled',
    defaultBody:
      'Dear {customer_name}, your site visit for {property_name} is confirmed for {visit_date} at {visit_time}.',
  },
  {
    key: 'SITE_VISIT_ACCEPTED',
    name: 'Site Visit Accepted by PM',
    defaultBody:
      'Dear {customer_name}, your site visit for {property_name} is confirmed for {visit_date} at {visit_time}.',
  },
  {
    key: 'DAY_BEFORE_RECONFIRMATION',
    name: 'Day-Before Reconfirmation',
    defaultBody:
      'Hi {customer_name}, just confirming your site visit tomorrow, {visit_date} at {visit_time}, for {property_name}. Your relationship manager {pm_name} ({pm_phone}) will be in touch. Reply to reschedule if needed.',
  },
  {
    key: 'RESCHEDULE_CONFIRMED',
    name: 'Reschedule Confirmed',
    defaultBody:
      'Hi {customer_name}, your site visit has been rescheduled to {visit_date} at {visit_time}. See you then!',
  },
  {
    key: 'POST_VISIT_INTERESTED',
    name: 'Post-Visit Follow-Up',
    defaultBody:
      "Hi {customer_name}, thank you for visiting {property_name} with us! Let us know if you'd like to move forward with a booking, or if you have any questions — {pm_name} is here to help.",
  },
  {
    key: 'BOOKING_CONFIRMED',
    name: 'Booking Confirmed',
    defaultBody:
      'Congratulations {customer_name}! Your booking {booking_code} for {property_name} is confirmed. Welcome to {company_name}.',
  },
];

export const MessageTemplatesManager: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [savedTemplates, setSavedTemplates] = useState<Record<string, MessageTemplate>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeState, setActiveState] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/message-templates`);
      if (res.ok) {
        const list: MessageTemplate[] = await res.json();
        const byKey: Record<string, MessageTemplate> = {};
        const draftInit: Record<string, string> = {};
        const activeInit: Record<string, boolean> = {};
        for (const t of list) {
          byKey[t.template_key] = t;
          draftInit[t.template_key] = t.body_text;
          activeInit[t.template_key] = t.is_active;
        }
        setSavedTemplates(byKey);
        setDrafts((prev) => ({ ...draftInit, ...prev }));
        setActiveState((prev) => ({ ...activeInit, ...prev }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyFor = (def: (typeof TEMPLATE_DEFS)[number]) =>
    drafts[def.key] !== undefined ? drafts[def.key] : def.defaultBody;

  const isCustomized = (key: string) => Boolean(savedTemplates[key]);

  const handleSave = async (def: (typeof TEMPLATE_DEFS)[number]) => {
    setSavingKey(def.key);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/message-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_key: def.key,
          name: def.name,
          body_text: bodyFor(def),
          is_active: activeState[def.key] ?? true,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleActive = async (def: (typeof TEMPLATE_DEFS)[number]) => {
    const next = !(activeState[def.key] ?? true);
    setActiveState((prev) => ({ ...prev, [def.key]: next }));
    if (isCustomized(def.key)) {
      try {
        await fetchWithAuth(
          `${API_BASE_URL}/message-templates/${encodeURIComponent(def.key)}/active`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: next }),
          },
        );
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareText className="w-5 h-5 text-navy-500" />
        <h3 className="font-extrabold text-slate-900 text-lg">WhatsApp Message Templates</h3>
      </div>
      <p className="text-xs text-slate-500 mb-6">
        Every WhatsApp touchpoint the CRM sends, in one place. A template with no saved
        customization uses the default text shown below (that's what's actually being sent right
        now). Edit, preview with sample data, and save to override it.
      </p>

      {isLoading ? (
        <div className="text-xs text-slate-400 py-4 text-center">Loading templates...</div>
      ) : (
        <div className="space-y-3">
          {TEMPLATE_DEFS.map((def) => {
            const active = activeState[def.key] ?? true;
            const customized = isCustomized(def.key);
            const expanded = expandedKey === def.key;
            return (
              <div key={def.key} className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedKey(expanded ? null : def.key)}
                  className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{def.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{def.key}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        customized ? 'bg-navy-100 text-navy-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {customized ? 'Customized' : 'Using default'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(def);
                      }}
                      title={active ? 'Active — click to disable' : 'Inactive — click to enable'}
                      className={active ? 'text-emerald-500' : 'text-slate-400'}
                    >
                      {active ? (
                        <ToggleRight className="w-6 h-6" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </button>

                {expanded && (
                  <div className="p-4 space-y-3 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Message Body
                      </label>
                      <textarea
                        value={bodyFor(def)}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [def.key]: e.target.value }))
                        }
                        rows={7}
                        className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-navy-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Placeholders: {TEMPLATE_PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}
                      </p>
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase mb-1">
                        <Eye className="w-3.5 h-3.5" /> Live Preview (sample data)
                      </label>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm whitespace-pre-wrap text-slate-800">
                        {substituteTemplatePreview(bodyFor(def), SAMPLE_PREVIEW_CONTEXT)}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSave(def)}
                        disabled={savingKey === def.key}
                        className="flex items-center gap-2 px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingKey === def.key ? 'Saving...' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
