import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = ['postgres://','test:test','@localhost/test'].join('');
process.env.JWT_SECRET = 'x'.repeat(64);
process.env.NODE_ENV = 'test';

const { professionalScopesSchema } = await import('../dist/services/professionalAccessService.js');

test('dossier permission requires at least one data section', () => {
  assert.throws(() => professionalScopesSchema.parse(['dossier']));
  assert.deepEqual(professionalScopesSchema.parse(['dossier','agreements']), ['dossier','agreements']);
});

test('professional permissions are de-duplicated', () => {
  assert.deepEqual(professionalScopesSchema.parse(['calendar','calendar','dossier']), ['calendar','dossier']);
});
