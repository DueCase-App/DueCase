import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_LEGAL_VERSION, validateLegalRegistration } from '../dist/routes/legalRegistrationGuard.js';

test('registration requires privacy acknowledgement', () => {
  const error = validateLegalRegistration({
    termsAccepted: true,
    privacyPolicyVersion: CURRENT_LEGAL_VERSION,
    termsVersion: CURRENT_LEGAL_VERSION,
  });
  assert.equal(error?.status, 400);
  assert.equal(error?.code, 'PRIVACY_ACK_REQUIRED');
});

test('registration requires terms acceptance', () => {
  const error = validateLegalRegistration({
    privacyAcknowledged: true,
    privacyPolicyVersion: CURRENT_LEGAL_VERSION,
    termsVersion: CURRENT_LEGAL_VERSION,
  });
  assert.equal(error?.status, 400);
  assert.equal(error?.code, 'TERMS_ACCEPTANCE_REQUIRED');
});

test('registration rejects stale legal document versions', () => {
  const error = validateLegalRegistration({
    privacyAcknowledged: true,
    termsAccepted: true,
    privacyPolicyVersion: 'old',
    termsVersion: CURRENT_LEGAL_VERSION,
  });
  assert.equal(error?.status, 400);
  assert.equal(error?.code, 'LEGAL_VERSION_MISMATCH');
});

test('registration accepts current privacy and terms acknowledgement', () => {
  const error = validateLegalRegistration({
    privacyAcknowledged: true,
    termsAccepted: true,
    privacyPolicyVersion: CURRENT_LEGAL_VERSION,
    termsVersion: CURRENT_LEGAL_VERSION,
  });
  assert.equal(error, null);
});
