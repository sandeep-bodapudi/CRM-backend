import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { handleApiError } from '../../utils/userFacingError';

type LegalInfo = Partial<{
  legal_name: string;
  registered_address: string;
  rera_number: string;
  rera_authority: string;
  gstin: string;
  cin: string;
  grievance_officer_name: string;
  grievance_officer_email: string;
  grievance_officer_phone: string;
  support_email: string;
  support_phone: string;
  website_disclaimer: string;
  confirmed_by_md: boolean;
  updated_at: string;
}>;
interface CompanyLegal {
  id: number;
  name: string;
  code: string;
  legal_info: LegalInfo | null;
}

const FIELDS: { key: keyof LegalInfo; label: string; hint?: string; long?: boolean }[] = [
  {
    key: 'legal_name',
    label: 'Legal company name',
    hint: 'As registered, e.g. "… Private Limited"',
  },
  { key: 'registered_address', label: 'Registered office address', long: true },
  {
    key: 'rera_number',
    label: 'Company RERA registration number',
    hint: 'Agent / promoter number. Project numbers are set on each project.',
  },
  { key: 'rera_authority', label: 'RERA authority', hint: 'e.g. TG RERA (Telangana)' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'cin', label: 'CIN (company identification number)' },
  { key: 'grievance_officer_name', label: 'Privacy / grievance contact — name' },
  { key: 'grievance_officer_email', label: 'Privacy / grievance contact — email' },
  { key: 'grievance_officer_phone', label: 'Privacy / grievance contact — phone' },
  { key: 'support_email', label: 'Customer support email' },
  { key: 'support_phone', label: 'Customer support phone' },
  {
    key: 'website_disclaimer',
    label: 'Website disclaimer',
    hint: 'e.g. images are representative; prices subject to change',
    long: true,
  },
];

/** Super Admin → Legal & compliance: what each brand website shows in its footer and legal pages. */
export const LegalComplianceSettings: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['companyLegal'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/companies/legal`);
      if (!res.ok) throw new Error('unavailable');
      return ((await res.json()).companies || []) as CompanyLegal[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (isError)
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Could not load.{' '}
        <button onClick={() => refetch()} className="font-bold text-navy-700 underline">
          Try again
        </button>
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-navy-700 shrink-0" />
        <div>
          <h2 className="text-lg font-black text-navy-900">Legal &amp; compliance</h2>
          <p className="text-xs text-slate-500">
            These details appear on each brand's website (footer, privacy policy, terms). Enter them
            only after the MD has confirmed them. Empty fields are not shown on the website.
          </p>
        </div>
      </div>
      {(data || []).map((c) => (
        <CompanyLegalForm key={c.id} company={c} />
      ))}
    </div>
  );
};

const CompanyLegalForm: React.FC<{ company: CompanyLegal }> = ({ company }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LegalInfo>(company.legal_info || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(company.legal_info || {}), [company.legal_info]);

  const set = (k: keyof LegalInfo, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) body[f.key] = (form[f.key] as string) || '';
      body.confirmed_by_md = !!form.confirmed_by_md;
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/companies/${company.id}/legal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return handleApiError(res, showError, d);
      showToast(`${company.name}: legal details saved`, 'success');
      queryClient.invalidateQueries({ queryKey: ['companyLegal'] });
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm';
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-slate-900">
          {company.name}{' '}
          <span className="text-xs font-semibold text-slate-400">({company.code})</span>
        </h3>
        {company.legal_info?.updated_at && (
          <span className="text-[11px] text-slate-500">
            Last saved {new Date(company.legal_info.updated_at).toLocaleString('en-IN')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className={`block text-[11px] font-bold text-slate-600 uppercase ${f.long ? 'sm:col-span-2' : ''}`}
          >
            {f.label}
            {f.long ? (
              <textarea
                value={(form[f.key] as string) || ''}
                onChange={(e) => set(f.key, e.target.value)}
                rows={2}
                className={`${input} normal-case`}
              />
            ) : (
              <input
                value={(form[f.key] as string) || ''}
                onChange={(e) => set(f.key, e.target.value)}
                className={`${input} normal-case`}
              />
            )}
            {f.hint && (
              <span className="block mt-0.5 text-[11px] font-normal normal-case text-slate-400">
                {f.hint}
              </span>
            )}
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={!!form.confirmed_by_md}
          onChange={(e) => set('confirmed_by_md', e.target.checked)}
          className="mt-1"
        />
        <span>These details have been confirmed by the MD.</span>
      </label>
      <button
        onClick={save}
        disabled={busy}
        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save'}
      </button>
    </section>
  );
};
