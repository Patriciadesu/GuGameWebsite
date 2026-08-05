import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = new URL(process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3101');
const userCount = Number(process.env.LOAD_TEST_USERS || 200);
const key = process.env.TEST_BYPASS_KEY || '';
const p95LimitMs = Number(process.env.LOAD_TEST_P95_LIMIT_MS || 2_500);
const includeComponents = process.env.LOAD_TEST_COMPONENTS === 'true';
let finalReport: Record<string, unknown> | null = null;

if (!key) throw new Error('TEST_BYPASS_KEY is required');
if (!Number.isInteger(userCount) || userCount < 1 || userCount > 2_000) {
  throw new Error('LOAD_TEST_USERS must be between 1 and 2000');
}

const transport = baseUrl.protocol === 'https:' ? https : http;
const agent = baseUrl.protocol === 'https:'
  ? new https.Agent({ keepAlive: true, maxSockets: userCount + 50, maxFreeSockets: userCount + 50 })
  : new http.Agent({ keepAlive: true, maxSockets: userCount + 50, maxFreeSockets: userCount + 50 });

interface RequestResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  bytes: number;
  durationMs: number;
}

const request = (path: string, headers: Record<string, string> = {}) =>
  new Promise<RequestResult>((resolve, reject) => {
    const startedAt = performance.now();
    const req = transport.request({
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: baseUrl.port,
      path: `${baseUrl.pathname.replace(/\/$/, '')}${path}`,
      method: 'GET',
      agent,
      headers: { 'x-forwarded-proto': 'https', ...headers }
    }, response => {
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        bytes,
        durationMs: performance.now() - startedAt
      }));
    });
    req.on('error', error => {
      reject(new Error(`${path}: ${error.message}`));
    });
    req.end();
  });

const percentile = (values: number[], fraction: number) =>
  values[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;

const summarize = (name: string, results: RequestResult[], totalMs: number) => {
  const durations = results.map(result => result.durationMs).sort((a, b) => a - b);
  const statuses = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
  return {
    name,
    users: results.length,
    totalMs: Math.round(totalMs),
    requestsPerSecond: Math.round((results.length / totalMs) * 1_000),
    latencyMs: {
      min: Math.round(durations[0]),
      p50: Math.round(percentile(durations, 0.50)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(durations[durations.length - 1])
    },
    averageBytes: Math.round(results.reduce((total, result) => total + result.bytes, 0) / results.length),
    statuses
  };
};

const runConcurrent = async (name: string, path: string, cookies: string[]) => {
  const startedAt = performance.now();
  const results = await Promise.all(cookies.map(cookie => request(path, { cookie })));
  return summarize(name, results, performance.now() - startedAt);
};

const run = async () => {
  const cookies: string[] = [];
  for (let offset = 0; offset < userCount; offset += 25) {
    const batch = await Promise.all(Array.from(
      { length: Math.min(25, userCount - offset) },
      (_, index) => request(
        `/api/auth/test-login?key=${encodeURIComponent(key)}&userId=${encodeURIComponent(`load-user-${offset + index}`)}`
      )
    ));
    for (const response of batch) {
      const setCookie = response.headers['set-cookie'];
      if (response.status !== 302 || !setCookie?.length) {
        throw new Error(`Test login failed with status ${response.status}`);
      }
      cookies.push(setCookie.map(value => value.split(';')[0]).join('; '));
    }
  }

  await request('/api/mainmenu/bootstrap', { cookie: cookies[0] });
  const components = includeComponents
    ? {
        inventory: await runConcurrent('inventory', '/api/inventory', cookies),
        skills: await runConcurrent('skills', '/api/skills', cookies)
      }
    : null;
  const bootstrap = await runConcurrent('mainmenu-bootstrap', '/api/mainmenu/bootstrap', cookies);
  const status = await runConcurrent('mainmenu-status', '/api/mainmenu/status', cookies);
  finalReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname}`,
    ...(components ? { components } : {}),
    bootstrap,
    status
  };
  console.log(JSON.stringify(finalReport, null, 2));

  const failedStatuses = [bootstrap, status].some(result =>
    Object.entries(result.statuses).some(([statusCode, count]) => statusCode !== '200' && count > 0)
  );
  if (failedStatuses || bootstrap.latencyMs.p95 > p95LimitMs || status.latencyMs.p95 > p95LimitMs) {
    process.exitCode = 1;
  }
};

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    agent.destroy();
    if (process.env.LOAD_TEST_REPORT_PATH && finalReport) {
      fs.writeFileSync(process.env.LOAD_TEST_REPORT_PATH, `${JSON.stringify(finalReport, null, 2)}\n`);
    }
  });
