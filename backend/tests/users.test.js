'use strict';

jest.mock('../src/utils/supabase');
jest.mock('openai');

const request = require('supertest');
const app = require('../src/app');
const { supabase, supabaseAdmin } = require('../src/utils/supabase');

const BASE = '/api/v1/users';
const VALID_TOKEN = 'valid-test-token';

const mockLociUser = {
  id: 'user-uuid-123',
  auth_id: 'auth-uuid-123',
  is_anonymous: false,
  display_name: 'TestUser',
  is_banned: false,
  is_premium: false,
  created_at: new Date().toISOString(),
};

function mockAuth(user = mockLociUser) {
  supabase.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: user.auth_id } },
    error: null,
  });
  // auth.js uses supabase (public client) for user lookup, not supabaseAdmin
  supabase.from.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValueOnce({ data: user, error: null }),
  }));
}

beforeEach(() => jest.clearAllMocks());

// ── GET /users/me ─────────────────────────────────────────
describe('GET /users/me', () => {
  it('returns current user profile', async () => {
    mockAuth();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockLociUser.id);
    expect(res.body.display_name).toBe('TestUser');
    expect(res.body.is_anonymous).toBe(false);
    expect(res.body.is_premium).toBe(false);
    expect(res.body.created_at).toBeDefined();
  });

  it('returns anonymous user profile', async () => {
    const anonUser = {
      ...mockLociUser,
      id: 'anon-uuid',
      auth_id: 'anon-auth',
      is_anonymous: true,
      display_name: 'User1234',
    };
    mockAuth(anonUser);
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.is_anonymous).toBe(true);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
  });
});

// ── PATCH /users/me ───────────────────────────────────────
describe('PATCH /users/me', () => {
  it('updates display name', async () => {
    mockAuth();
    supabaseAdmin.from.mockImplementationOnce(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { ...mockLociUser, display_name: 'NewName' },
        error: null,
      }),
    }));

    const res = await request(app)
      .patch(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ display_name: 'NewName' });

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('NewName');
  });

  it('rejects display name shorter than 2 chars', async () => {
    mockAuth();
    const res = await request(app)
      .patch(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ display_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects display name longer than 30 chars', async () => {
    mockAuth();
    const res = await request(app)
      .patch(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ display_name: 'A'.repeat(31) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects empty body', async () => {
    mockAuth();
    const res = await request(app)
      .patch(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid avatar_url', async () => {
    mockAuth();
    const res = await request(app)
      .patch(`${BASE}/me`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ avatar_url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
