import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { hasGoogleIdentity, verifiedGoogleProfile, googleLoginOptions, googleCallbackError } from '../src/utils/googleAuth.js';
test('Google identity is recognized only from server-managed app metadata', () => {
  assert.equal(hasGoogleIdentity({ user_metadata: { provider: 'google' } }), false);
  assert.equal(hasGoogleIdentity({ app_metadata: { providers: ['email', 'google'] } }), true);
});
test('Google needs a canonical display ID and assigned store', () => {
  assert.equal(verifiedGoogleProfile(null), false);
  assert.equal(verifiedGoogleProfile({ id: 'u', display_id: 'u' }), false);
  assert.equal(verifiedGoogleProfile({ id: 'u', display_id: 'u', store_name: '店' }), true);
});
test('Google returns to this app root, not a legacy wildcard or global root', () => {
  assert.deepEqual(googleLoginOptions('/app/', 'https://marugo-s.github.io'), { provider: 'google', options: { redirectTo: 'https://marugo-s.github.io/app/', skipBrowserRedirect: true } });
});
test('callback errors are sanitized without destroying successful recovery', () => {
  assert.equal(googleCallbackError('https://marugo-s.github.io/app/#access_token=fake&type=recovery'), null);
  const error = googleCallbackError('https://marugo-s.github.io/app/?tab=one#error=access_denied&error_description=untrusted');
  assert.equal(error.cleanUrl, '/app/?tab=one');
  assert.doesNotMatch(error.message, /untrusted/);
});
test('Google does not create a fallback profile or grant admin metadata privileges', async () => {
  const source = await readFile(new URL('../src/contexts/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(googleIdentity\) throw error/);
  assert.match(source, /cached && !googleIdentity/);
  assert.match(source, /profile\?\.role === 'admin' \? 'admin' : 'user'/);
  assert.match(source, /signInWithPassword/);
});
