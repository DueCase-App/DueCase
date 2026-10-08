import { Router } from 'express';
import { ApiError } from '../http.js';

const router = Router();
export const CURRENT_LEGAL_VERSION = '2026-10-08';

type LegalRegistrationBody = Record<string, unknown> | undefined;

export function validateLegalRegistration(body: LegalRegistrationBody): ApiError | null {
  if (body?.privacyAcknowledged !== true) {
    return new ApiError(400, 'È necessario prendere visione dell’Informativa privacy.', 'PRIVACY_ACK_REQUIRED');
  }
  if (body?.termsAccepted !== true) {
    return new ApiError(400, 'È necessario accettare i Termini e condizioni.', 'TERMS_ACCEPTANCE_REQUIRED');
  }
  if (body?.privacyPolicyVersion !== CURRENT_LEGAL_VERSION || body?.termsVersion !== CURRENT_LEGAL_VERSION) {
    return new ApiError(400, 'La versione dei documenti legali non è aggiornata. Riapri la registrazione e riprova.', 'LEGAL_VERSION_MISMATCH');
  }
  return null;
}

router.post('/register', (req, _res, next) => {
  if (process.env.NODE_ENV === 'test' && process.env.LEGAL_GUARD_TEST_BYPASS === 'true') {
    next();
    return;
  }
  const error = validateLegalRegistration(req.body as LegalRegistrationBody);
  if (error) {
    next(error);
    return;
  }

  // Data minimisation: DueCase no longer collects the Italian tax code.
  // Ignore legacy clients that still send either naming variant so the value
  // cannot reach the registration service or be persisted.
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    delete req.body.taxCode;
    delete req.body.tax_code;
  }

  next();
});

export default router;
