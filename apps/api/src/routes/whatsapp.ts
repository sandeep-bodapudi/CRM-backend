import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { MessageTemplateService, TemplateContext } from '../services/messageTemplate.service';
import { MessageTemplateKey } from '../shared';
import { normalizeIndianPhone } from '../utils/phone';

const router = Router();

// Resolve a template safely for Sales/Telecaller (doesn't require MESSAGE_TEMPLATES_MANAGE)
router.post(
  '/resolve',
  authenticateToken, // Just authentication, no specific global permission required for generating text links
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { template_key, phone, context } = req.body;

      if (!template_key || !phone) {
        return res.status(400).json({ error: 'template_key and phone are required' });
      }
      // Only the message types the app really uses; the phone must look like a
      // phone number (10-13 digits once cleaned), not arbitrary text.
      if (
        typeof template_key !== 'string' ||
        !(Object.values(MessageTemplateKey) as string[]).includes(template_key)
      ) {
        return res.status(400).json({ error: 'Unknown message template' });
      }
      const digits = String(phone).replace(/[^0-9]/g, '');
      if (digits.length < 10 || digits.length > 13) {
        return res.status(400).json({ error: 'Enter a valid phone number' });
      }

      const ctx: TemplateContext = context || {};

      // Resolve using the fallback mechanism so it always succeeds even if admin hasn't created it
      const resolved = await MessageTemplateService.resolveWithFallback(template_key, ctx);

      const formattedPhone = normalizeIndianPhone(phone);

      const whatsAppUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(resolved.body_text)}`;

      return res.json({
        whatsAppUrl,
        whatsAppText: resolved.body_text,
        templateKey: resolved.templateKey,
        usedFallback: resolved.usedFallback,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
