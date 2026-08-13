import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');

test('test login is a non-production POST and never reads secrets from the query string', () => {
  assert.match(serverSource, /if \(process\.env\.NODE_ENV !== 'production'\) \{[\s\S]*app\.post\('\/api\/auth\/test-login'/);
  assert.match(serverSource, /req\.get\('x-test-bypass-key'\)/);
  assert.doesNotMatch(serverSource, /app\.get\('\/api\/auth\/test-login'/);
  assert.doesNotMatch(serverSource, /req\.query\.key/);
});

test('authenticated unsafe requests require an allowed Origin or Referer', () => {
  assert.match(serverSource, /new Set\(\['POST', 'PUT', 'PATCH', 'DELETE'\]\)/);
  assert.match(serverSource, /!unsafeMethods\.has\(req\.method\) \|\| !req\.isAuthenticated\(\)/);
  assert.match(serverSource, /req\.get\('origin'\) \|\| req\.get\('referer'\)/);
  assert.match(serverSource, /isAllowedClientOrigin\(sourceOrigin, requestOrigin\)/);
});

test('player mutations share the active level-matched topic skill-map guard', () => {
  const guard = serverSource.match(/const getPlayerEligibleSkill[\s\S]*?\n\};/)?.[0] || '';
  assert.match(guard, /isActive: true/);
  assert.match(guard, /constellationType: 'skill'/);
  assert.match(guard, /scope: 'topic'/);
  assert.match(guard, /level: userLevel/);

  const guardCalls = serverSource.match(/getPlayerEligibleSkill\(/g) || [];
  assert.ok(guardCalls.length >= 4, 'unlock, step completion, request, and approval must use the shared guard');
});

test('connection writes reject self, duplicate, missing, and cross-map targets', () => {
  const guard = serverSource.match(/const assertValidConnectionTargets[\s\S]*?\n\};/)?.[0] || '';
  assert.match(guard, /targetIds\.includes\(sourceSkillId\)/);
  assert.match(guard, /new Set\(targetIds\)\.size !== targetIds\.length/);
  assert.match(guard, /constellationMapId: sourceMapId/);
  assert.match(guard, /matchingTargets !== targetIds\.length/);

  const guardCalls = serverSource.match(/assertValidConnectionTargets\(/g) || [];
  assert.ok(guardCalls.length >= 3, 'bulk, create, and update connection writes must use the shared guard');
});

test('privileged routes revalidate Discord roles with a short-lived cache and fail closed', () => {
  assert.match(serverSource, /discordRoleCache = new KeyedAsyncTtlCache[^\n]*5 \* 60_000/);
  assert.match(serverSource, /const refreshPrivilegedRole = async/);
  assert.match(serverSource, /fetchUserRoleAndNickname\(storedUser\.accessToken!/);
  assert.match(serverSource, /Role verification unavailable/);
  assert.match(serverSource, /await refreshPrivilegedRole\(req\)/);
});
