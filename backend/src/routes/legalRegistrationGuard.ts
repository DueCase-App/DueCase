import { Router } from 'express';
import { ApiError } from '../http.js';

const router = Router();
export const CURRENT_LEGAL_VERSION = '2026-10-07';

router.post('/register', (req, _res, next) => {
  const body = req.body as Record<string, unknown> | undefined;

  if (body?.privacyAcknowledged !== true) {
    return next(new ApiError(400, 'È necessario prendere visione dell’Informativa privacy.', 'PRIVACY_ACK_REQUIRED'));
  }

  if (body?.termsAccepted !== true) {
    return next(new ApiError(400, 'È necessario accettare i Termini e condizioni.', 'TERMS_ACCEPTANCE_REQUIRED'));
  }

  if (body?.privacyPolicyVersion !== CURRENT_LEGAL_VERSION || body?.termsVersion !== CURRENT_LEGAL_VERSION) {
    return next(new ApiError(400, 'La versione dei documenti legali non è aggiornata. Riapri la registrazione e riprova.', 'LEGAL_VERSION_MISMATCH'));
  }

  next();
});

export default router;
