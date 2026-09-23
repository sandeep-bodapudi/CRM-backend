import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE_URL } from '../config';

export interface WhatsAppContext {
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

export const useWhatsApp = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast } = useToast();

  const sendWhatsAppMessage = async (
    templateKey: string,
    phone: string,
    context?: WhatsAppContext,
  ) => {
    try {
      const url = `${API_BASE_URL}/whatsapp/resolve`;

      const res = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_key: templateKey,
          phone,
          context: context || {},
        }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Permission denied. You cannot generate this message.');
        }
        throw new Error('Failed to fetch WhatsApp template');
      }

      const data = await res.json();
      const whatsAppUrl = data.whatsAppUrl;

      if (!whatsAppUrl) {
        throw new Error('Invalid WhatsApp URL received');
      }

      window.open(whatsAppUrl, '_blank');
      return true;
    } catch (err: any) {
      console.error('Error sending WhatsApp message:', err);
      showToast(err.message || 'Error generating WhatsApp message', 'error');
      return false;
    }
  };

  return { sendWhatsAppMessage };
};
