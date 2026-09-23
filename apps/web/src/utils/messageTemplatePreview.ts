/**
 * Mirrors apps/api/src/services/messageTemplate.service.ts's substitute()
 * exactly, so the admin editor's live preview matches what the backend will
 * actually send — client-side only, so it can update as the admin types
 * without a round trip.
 */
export interface TemplatePreviewContext {
  customer_name?: string;
  customer_phone?: string;
  property_name?: string;
  property_location?: string;
  property_price?: string;
  property_code?: string;
  property_url?: string;
  pm_name?: string;
  pm_phone?: string;
  agent_name?: string;
  visit_date?: string;
  visit_time?: string;
  lead_code?: string;
  booking_code?: string;
  company_name?: string;
}

export const TEMPLATE_PLACEHOLDERS: (keyof TemplatePreviewContext)[] = [
  'customer_name',
  'customer_phone',
  'property_name',
  'property_location',
  'property_price',
  'property_code',
  'property_url',
  'pm_name',
  'pm_phone',
  'agent_name',
  'visit_date',
  'visit_time',
  'lead_code',
  'booking_code',
  'company_name',
];

export const SAMPLE_PREVIEW_CONTEXT: Required<TemplatePreviewContext> = {
  customer_name: 'Priya Sharma',
  customer_phone: '+91 98765 43210',
  property_name: 'Sunrise Heights — 3BHK #3210',
  property_location: 'Kondapur, Hyderabad',
  property_price: '₹85.0 Lakhs',
  property_code: 'RRH-PROP-0421',
  property_url: 'https://radharealhomeproperties.com/properties/421',
  pm_name: 'Rakesh Reddy',
  pm_phone: '+91 90000 12345',
  agent_name: 'Sunil Kumar',
  visit_date: '25 September 2026',
  visit_time: '4:00 PM',
  lead_code: 'RRH-LD-1042',
  booking_code: 'RRH-BK-0087',
  company_name: 'Radha Real Homes',
};

export function substituteTemplatePreview(
  body: string,
  ctx: TemplatePreviewContext = SAMPLE_PREVIEW_CONTEXT,
): string {
  let result = body;
  for (const key of TEMPLATE_PLACEHOLDERS) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), ctx[key] ?? '');
  }
  return result;
}
