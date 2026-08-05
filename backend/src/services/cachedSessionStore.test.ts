import assert from 'node:assert/strict';
import test from 'node:test';
import session, { SessionData } from 'express-session';
import { CachedSessionStore } from './cachedSessionStore';

class FakeStore extends session.Store {
  readonly sessions = new Map<string, SessionData>();
  gets = 0;
  touches = 0;

  get(sid: string, callback: (err: any, session?: SessionData | null) => void): void {
    this.gets += 1;
    setTimeout(() => callback(null, this.sessions.get(sid) || null), 5);
  }

  set(sid: string, value: SessionData, callback?: (err?: any) => void): void {
    this.sessions.set(sid, structuredClone(value));
    callback?.();
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.sessions.delete(sid);
    callback?.();
  }

  touch(_sid: string, _value: SessionData, callback?: () => void): void {
    this.touches += 1;
    callback?.();
  }
}

const sessionValue = (): SessionData => ({
  cookie: {
    originalMaxAge: 60_000,
    maxAge: 60_000,
    secure: true,
    httpOnly: true,
    path: '/',
    sameSite: 'none'
  } as SessionData['cookie'],
  passport: { user: 'user-1' }
} as SessionData);

const getSession = (store: session.Store, sid: string) =>
  new Promise<SessionData | null>((resolve, reject) => {
    store.get(sid, (error, value) => error ? reject(error) : resolve(value || null));
  });

test('CachedSessionStore coalesces concurrent backing-store reads', async () => {
  const backing = new FakeStore();
  backing.sessions.set('sid', sessionValue());
  const store = new CachedSessionStore(backing);

  const sessions = await Promise.all(Array.from({ length: 100 }, () => getSession(store, 'sid')));
  assert.equal(sessions.length, 100);
  assert.equal(backing.gets, 1);
});

test('CachedSessionStore updates and destroys both cache and backing store', async () => {
  const backing = new FakeStore();
  const store = new CachedSessionStore(backing);
  const value = sessionValue();
  store.set('sid', value);
  assert.deepEqual(await getSession(store, 'sid'), value);
  assert.equal(backing.gets, 0);

  await new Promise<void>((resolve, reject) => {
    store.destroy('sid', error => error ? reject(error) : resolve());
  });
  assert.equal(await getSession(store, 'sid'), null);
  assert.equal(backing.gets, 1);
});

test('CachedSessionStore rate-limits persistent session touches', () => {
  const backing = new FakeStore();
  const store = new CachedSessionStore(backing);
  const value = sessionValue();
  for (let index = 0; index < 100; index += 1) {
    store.touch('sid', value);
  }
  assert.equal(backing.touches, 1);
});
