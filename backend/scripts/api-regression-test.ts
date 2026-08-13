import assert from 'node:assert/strict';
import axios, { AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = new URL(process.env.API_TEST_BASE_URL || 'http://127.0.0.1:3101');
const key = process.env.TEST_BYPASS_KEY || '';
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname);

if (!key) throw new Error('TEST_BYPASS_KEY is required');
if (!isLocal && process.env.ALLOW_REMOTE_API_TEST !== 'true') {
  throw new Error('Remote API tests are disabled. Use a localhost isolated test server.');
}

const client = axios.create({
  baseURL: baseUrl.toString(),
  maxRedirects: 0,
  validateStatus: () => true,
  timeout: 15_000
});

const login = async (userId: string) => {
  const response = await client.post('/api/auth/test-login', { userId }, {
    headers: { 'X-Test-Bypass-Key': key }
  });
  assert.equal(response.status, 302, `test login failed for ${userId}`);
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  assert.ok(setCookie?.length, `test login did not set a cookie for ${userId}`);
  return setCookie.map(value => value.split(';')[0]).join('; ');
};

const request = (cookie: string, config: AxiosRequestConfig) =>
  client.request({
    ...config,
    headers: { Origin: baseUrl.origin, ...config.headers, Cookie: cookie }
  });

const run = async () => {
  const [adminCookie, userCookie] = await Promise.all([
    login('load-user-0'),
    login('load-user-249')
  ]);

  const unauthorized = await client.get('/api/mainmenu/bootstrap');
  assert.equal(unauthorized.status, 401);

  const forbidden = await request(userCookie, {
    method: 'GET',
    url: '/api/approval-requests'
  });
  assert.equal(forbidden.status, 403);

  const invalidRequests = await Promise.all([
    request(userCookie, { method: 'GET', url: '/api/skills/not-an-id' }),
    request(userCookie, { method: 'POST', url: '/api/skills/not-an-id/unlock' }),
    request(userCookie, { method: 'POST', url: '/api/shop/items/not-an-id/purchase' }),
    request(userCookie, { method: 'POST', url: '/api/inventory/not-an-id/use' }),
    request(adminCookie, {
      method: 'POST',
      url: '/api/users/load-user-249/asset-points',
      data: { amount: '100', operation: 'add' }
    })
  ]);
  assert.deepEqual(invalidRequests.map(response => response.status), [400, 400, 400, 400, 400]);

  const initialStatus = await request(userCookie, {
    method: 'GET',
    url: '/api/mainmenu/status'
  });
  assert.equal(initialStatus.status, 200);
  const initialAP = initialStatus.data.userStats.assetPoints as number;

  const created = await request(adminCookie, {
    method: 'POST',
    url: '/api/skills',
    data: {
      title: `API Regression Quest ${Date.now()}`,
      description: 'Verifies manual approval and configurable next quest cost.',
      cost: 0,
      nodeColor: 'green',
      subQuests: [
        { externalId: 'api-step-1', title: 'Step 1', description: 'First test step' },
        { externalId: 'api-step-2', title: 'Step 2', description: 'Second test step' }
      ]
    }
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.skill.nextQuestCost, 25);
  const skillId = created.data.skill._id as string;

  try {
    const updated = await request(adminCookie, {
      method: 'PUT',
      url: `/api/skills/${skillId}`,
      data: { nextQuestCost: 40 }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.skill.nextQuestCost, 40);

    const firstStep = await request(userCookie, {
      method: 'POST',
      url: `/api/skills/${skillId}/steps/api-step-1/complete`
    });
    const secondStep = await request(userCookie, {
      method: 'POST',
      url: `/api/skills/${skillId}/steps/api-step-2/complete`
    });
    assert.equal(firstStep.status, 200);
    assert.equal(firstStep.data.allStepsCompleted, false);
    assert.equal(secondStep.status, 200);
    assert.equal(secondStep.data.allStepsCompleted, true);
    assert.equal(secondStep.data.approvalRequired, true);

    const beforeApproval = await request(userCookie, {
      method: 'GET',
      url: '/api/mainmenu/status'
    });
    assert.equal(beforeApproval.status, 200);
    assert.equal(beforeApproval.data.unlockedSkills.includes(skillId), false);
    assert.equal(beforeApproval.data.questProgress.completedQuests.includes(skillId), false);

    const requested = await request(userCookie, {
      method: 'POST',
      url: `/api/skills/${skillId}/approval-request`,
      data: { message: 'API regression approval' }
    });
    assert.equal(requested.status, 200);
    const requestId = requested.data.requestId as string;

    const duplicateRequest = await request(userCookie, {
      method: 'POST',
      url: `/api/skills/${skillId}/approval-request`,
      data: {}
    });
    assert.equal(duplicateRequest.status, 400);

    const pendingStatus = await request(userCookie, {
      method: 'GET',
      url: '/api/mainmenu/status'
    });
    assert.equal(pendingStatus.data.questProgress.pendingApprovalSkillIds.includes(skillId), true);
    assert.equal(pendingStatus.data.unlockedSkills.includes(skillId), false);

    const approved = await request(adminCookie, {
      method: 'POST',
      url: `/api/approval-requests/${requestId}/approve`,
      data: { rewardAP: 35 }
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.nextQuestCost, 40);
    assert.equal(approved.data.remainingAssetPoints, initialAP + 10 + 35 - 40);

    const duplicateApproval = await request(adminCookie, {
      method: 'POST',
      url: `/api/approval-requests/${requestId}/approve`,
      data: { rewardAP: 35 }
    });
    assert.equal(duplicateApproval.status, 409);

    const completedStatus = await request(userCookie, {
      method: 'GET',
      url: '/api/mainmenu/status'
    });
    assert.equal(completedStatus.data.userStats.assetPoints, initialAP + 5);
    assert.equal(completedStatus.data.unlockedSkills.includes(skillId), true);
    assert.equal(completedStatus.data.questProgress.completedQuests.includes(skillId), true);
    assert.equal(completedStatus.data.questProgress.pendingApprovalSkillIds.includes(skillId), false);
  } finally {
    await request(adminCookie, {
      method: 'DELETE',
      url: `/api/skills/${skillId}`
    });
  }

  console.log(JSON.stringify({
    success: true,
    checks: {
      authentication: true,
      authorization: true,
      invalidInput: true,
      manualApproval: true,
      defaultNextQuestCost: 25,
      customNextQuestCost: 40,
      stepRewardAP: 5,
      approvalRewardAP: 35
    }
  }, null, 2));
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
