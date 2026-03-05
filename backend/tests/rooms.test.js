'use strict';

jest.mock('../src/utils/supabase');
jest.mock('openai');

const request = require('supertest');
const app = require('../src/app');
const { supabase, supabaseAdmin } = require('../src/utils/supabase');

const BASE = '/api/v1/rooms';
const ROOM_ID = 'room-uuid-001';
const VALID_TOKEN = 'valid-test-token';

const mockLociUser = {
  id: 'user-uuid-123',
  auth_id: 'auth-uuid-123',
  is_anonymous: false,
  display_name: 'TestUser',
  is_banned: false,
  muted_until: null,
};

const mockRoom = {
  id: ROOM_ID,
  venue_id: 'venue-uuid-001',
  status: 'active',
  activated_at: new Date().toISOString(),
  allow_anonymous: true,
};

function mockAuth(user = mockLociUser) {
  supabase.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: user.auth_id } },
    error: null,
  });
  supabase.from.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValueOnce({ data: user, error: null }),
  }));
}

beforeEach(() => jest.clearAllMocks());

// ── GET /rooms/:room_id ───────────────────────────────────
describe('GET /rooms/:room_id', () => {
  it('returns room with occupancy count', async () => {
    mockAuth();

    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: mockRoom, error: null }),
    }));

    // Count query — chain must be awaitable (no .single())
    const countResult = { count: 12, error: null };
    supabaseAdmin.from.mockImplementationOnce(() => {
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        then: (resolve, reject) => Promise.resolve(countResult).then(resolve, reject),
      };
      return chain;
    });

    const res = await request(app)
      .get(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ROOM_ID);
    expect(res.body.status).toBe('active');
  });

  it('returns 404 for unknown room', async () => {
    mockAuth();
    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
    }));

    const res = await request(app)
      .get(`${BASE}/nonexistent`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/${ROOM_ID}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /rooms/:room_id/join ─────────────────────────────
describe('POST /rooms/:room_id/join', () => {
  it('joins an active room', async () => {
    mockAuth();

    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: mockRoom, error: null }),
    }));

    supabaseAdmin.from.mockImplementationOnce(() => ({
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { id: 'member-001', session_display_name: 'GameDay99' },
        error: null,
      }),
    }));

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}/join`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ session_display_name: 'GameDay99' });

    expect(res.status).toBe(200);
    expect(res.body.room.id).toBe(ROOM_ID);
    expect(res.body.realtime_channel).toBe(`room:${ROOM_ID}`);
    expect(res.body.supabase_url).toBeDefined();
  });

  it('rejects join when room is inactive', async () => {
    mockAuth();
    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
    }));

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}/join`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ROOM_INACTIVE');
  });

  it('rejects anonymous user from named-only room', async () => {
    const anonUser = { ...mockLociUser, is_anonymous: true };
    mockAuth(anonUser);

    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: { ...mockRoom, allow_anonymous: false },
        error: null,
      }),
    }));

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}/join`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

// ── DELETE /rooms/:room_id/leave ──────────────────────────
describe('DELETE /rooms/:room_id/leave', () => {
  it('leaves room successfully', async () => {
    mockAuth();
    const leaveResult = { error: null };
    supabaseAdmin.from.mockImplementationOnce(() => {
      const chain = {
        update: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        then: (resolve, reject) => Promise.resolve(leaveResult).then(resolve, reject),
      };
      return chain;
    });

    const res = await request(app)
      .delete(`${BASE}/${ROOM_ID}/leave`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /rooms/:room_id/members ───────────────────────────
describe('GET /rooms/:room_id/members', () => {
  it('returns member list with total count', async () => {
    mockAuth();

    const mockMembers = [
      {
        id: 'member-001',
        joined_at: new Date().toISOString(),
        session_display_name: 'Fan99',
        users: { id: 'user-uuid-123', is_anonymous: false },
      },
    ];

    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValueOnce({ data: mockMembers, count: 1, error: null }),
    }));

    const res = await request(app)
      .get(`${BASE}/${ROOM_ID}/members`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.members[0].display_name).toBe('Fan99');
    expect(res.body.members[0].is_anonymous).toBe(false);
  });
});
