"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const serverSource = node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, 'server.ts'), 'utf8');
(0, node_test_1.default)('test login is a non-production POST and never reads secrets from the query string', () => {
    strict_1.default.match(serverSource, /if \(process\.env\.NODE_ENV !== 'production'\) \{[\s\S]*app\.post\('\/api\/auth\/test-login'/);
    strict_1.default.match(serverSource, /req\.get\('x-test-bypass-key'\)/);
    strict_1.default.doesNotMatch(serverSource, /app\.get\('\/api\/auth\/test-login'/);
    strict_1.default.doesNotMatch(serverSource, /req\.query\.key/);
});
(0, node_test_1.default)('authenticated unsafe requests require an allowed Origin or Referer', () => {
    strict_1.default.match(serverSource, /new Set\(\['POST', 'PUT', 'PATCH', 'DELETE'\]\)/);
    strict_1.default.match(serverSource, /!unsafeMethods\.has\(req\.method\) \|\| !req\.isAuthenticated\(\)/);
    strict_1.default.match(serverSource, /req\.get\('origin'\) \|\| req\.get\('referer'\)/);
    strict_1.default.match(serverSource, /isAllowedClientOrigin\(sourceOrigin, requestOrigin\)/);
});
(0, node_test_1.default)('player mutations share the active level-matched topic skill-map guard', () => {
    const guard = serverSource.match(/const getPlayerEligibleSkill[\s\S]*?\n\};/)?.[0] || '';
    strict_1.default.match(guard, /isActive: true/);
    strict_1.default.match(guard, /constellationType: 'skill'/);
    strict_1.default.match(guard, /scope: 'topic'/);
    strict_1.default.match(guard, /level: userLevel/);
    const guardCalls = serverSource.match(/getPlayerEligibleSkill\(/g) || [];
    strict_1.default.ok(guardCalls.length >= 5, 'unlock, step completion, request, and approval must use the shared guard');
});
(0, node_test_1.default)('connection writes reject self, duplicate, missing, and cross-map targets', () => {
    const guard = serverSource.match(/const assertValidConnectionTargets[\s\S]*?\n\};/)?.[0] || '';
    strict_1.default.match(guard, /targetIds\.includes\(sourceSkillId\)/);
    strict_1.default.match(guard, /new Set\(targetIds\)\.size !== targetIds\.length/);
    strict_1.default.match(guard, /constellationMapId: sourceMapId/);
    strict_1.default.match(guard, /matchingTargets !== targetIds\.length/);
    const guardCalls = serverSource.match(/assertValidConnectionTargets\(/g) || [];
    strict_1.default.ok(guardCalls.length >= 4, 'bulk, create, and update connection writes must use the shared guard');
});
