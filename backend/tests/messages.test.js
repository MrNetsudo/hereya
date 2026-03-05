'use strict';

jest.mock('../src/utils/supabase');
jest.mock('openai');
jest.mock('../src/services/moderation');

const request = require('supertest');
const app = require('../src/app');
const { supabase, supabaseAdmin } = require('../src/utils/supabase');
const moderationService = require('../src/services/moderation');

const BASE = '/api/v1/messages';
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

function mockMemberPresent(present = true) {
  supabaseAdmin.from.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValueOnce({
      data: present ? { id: 'member-001' } : null,
      error: present ? null : { message: 'Not found' },
    }),
  }));
}

beforeEach(() => jest.clearAllMocks());

// ── GET /messages/:room_id ────────────────────────────────
describe('GET /messages/:room_id', () => {
  it('returns message history', async () => {
    mockAuth();
    const mockMessages = [
      {
        id: 'msg-001',
        content: 'Hello!',
        content_type: 'text',
        created_at: new Date().toISOString(),
        moderation_status: 'passed',
        users: { id: 'user-uuid-123', display_name: 'TestUser', is_anonymous: false },
      },
    ];

    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValueOnce({ data: mockMessages, error: null }),
    }));

    const res = await request(app)
      .get(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.has_more).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/${ROOM_ID}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /messages/:room_id ───────────────────────────────
describe('POST /messages/:room_id', () => {
  it('sends a message when present and content passes moderation', async () => {
    mockAuth();
    mockMemberPresent(true);
    moderationService.moderateMessage.mockResolvedValueOnce({
      allowed: true, status: 'passed', maxScore: 0.001,
    });

    supabaseAdmin.from.mockImplementationOnce(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({
        data: {
          id: 'msg-new',
          content: 'Great game!',
          created_at: new Date().toISOString(),
          moderation_status: 'passed',
        },
        error: null,
      }),
    }));

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: 'Great game!' });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Great game!');
    expect(res.body.moderation_status).toBe('passed');
  });

  it('blocks message when moderation fails', async () => {
    mockAuth();
    mockMemberPresent(true);
    moderationService.moderateMessage.mockResolvedValueOnce({
      allowed: false, status: 'blocked', maxScore: 0.97,
    });

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: 'Offensive content here' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CONTENT_BLOCKED');
  });

  it('blocks message when user is not present at venue', async () => {
    mockAuth();
    mockMemberPresent(false);

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: 'Hello from afar' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_PRESENT');
  });

  it('blocks message when user is muted', async () => {
    const mutedUser = {
      ...mockLociUser,
      muted_until: new Date(Date.now() + 60_000).toISOString(),
    };
    mockAuth(mutedUser);

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: 'Let me speak!' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('USER_MUTED');
    expect(res.body.muted_until).toBeDefined();
  });

  it('rejects empty content', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects content over 1000 chars', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ content: 'A'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects missing content field', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── POST /messages/:room_id/:message_id/report ────────────
describe('POST /messages/:room_id/:message_id/report', () => {
  it('submits a valid report', async () => {
    mockAuth();
    moderationService.processReport.mockResolvedValueOnce();

    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}/msg-001/report`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ reason: 'harassment' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects invalid report reason', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/${ROOM_ID}/msg-001/report`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ reason: 'i-dont-like-it' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('accepts all valid report reasons', async () => {
    for (const reason of ['harassment', 'spam', 'hate', 'other']) {
      mockAuth();
      moderationService.processReport.mockResolvedValueOnce();
      const res = await request(app)
        .post(`${BASE}/${ROOM_ID}/msg-001/report`)
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ reason });
      expect(res.status).toBe(200);
    }
  });
});

// ── DELETE /messages/:room_id/:message_id ─────────────────
describe('DELETE /messages/:room_id/:message_id', () => {
  it('deletes own message', async () => {
    mockAuth();
    const deleteResult = { error: null };
    supabaseAdmin.from.mockImplementationOnce(() => {
      const chain = {
        update: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        then: (resolve, reject) => Promise.resolve(deleteResult).then(resolve, reject),
      };
      return chain;
    });

    const res = await request(app)
      .delete(`${BASE}/${ROOM_ID}/msg-001`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
