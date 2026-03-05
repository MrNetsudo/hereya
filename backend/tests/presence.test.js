'use strict';

jest.mock('../src/utils/supabase');
jest.mock('openai');
jest.mock('../src/services/presence');

const request = require('supertest');
const app = require('../src/app');
const { supabase, supabaseAdmin } = require('../src/utils/supabase');
const presenceService = require('../src/services/presence');

const BASE = '/api/v1/presence';
const VALID_TOKEN = 'valid-test-token';

const mockLociUser = {
  id: 'user-uuid-123',
  auth_id: 'auth-uuid-123',
  is_anonymous: false,
  display_name: 'TestUser',
  is_banned: false,
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

// ── POST /presence/check ──────────────────────────────────
describe('POST /presence/check', () => {
  it('returns present=true when user is at venue', async () => {
    mockAuth();
    presenceService.checkPresence.mockResolvedValueOnce({
      isPresent: true,
      venue: { id: 'venue-uuid-001', name: 'Fenway Park', category: 'stadium' },
      confidence: 0.97,
      verificationMethod: 'gps',
      roomId: 'room-uuid-001',
    });

    const res = await request(app)
      .post(`${BASE}/check`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ latitude: 42.3467, longitude: -71.0972, accuracy_meters: 15 });

    expect(res.status).toBe(200);
    expect(res.body.is_present).toBe(true);
    expect(res.body.venue.name).toBe('Fenway Park');
    expect(res.body.confidence).toBe(0.97);
    expect(res.body.room_id).toBe('room-uuid-001');
  });

  it('returns present=false when not at any venue', async () => {
    mockAuth();
    presenceService.checkPresence.mockResolvedValueOnce({
      isPresent: false, venue: null, confidence: 0, roomId: null,
    });

    const res = await request(app)
      .post(`${BASE}/check`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ latitude: 0, longitude: 0 });

    expect(res.status).toBe(200);
    expect(res.body.is_present).toBe(false);
    expect(res.body.venue).toBeNull();
    expect(res.body.room_id).toBeNull();
  });

  it('rejects missing latitude', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/check`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ longitude: -71.0972 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects missing longitude', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/check`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ latitude: 42.3467 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range latitude', async () => {
    mockAuth();
    const res = await request(app)
      .post(`${BASE}/check`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ latitude: 999, longitude: -71.0972 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post(`${BASE}/check`)
      .send({ latitude: 42.3467, longitude: -71.0972 });
    expect(res.status).toBe(401);
  });
});

// ── DELETE /presence/leave ────────────────────────────────
describe('DELETE /presence/leave', () => {
  it('records departure successfully', async () => {
    mockAuth();
    presenceService.recordDeparture.mockResolvedValueOnce();

    const res = await request(app)
      .delete(`${BASE}/leave`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ venue_id: 'venue-uuid-001' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(presenceService.recordDeparture).toHaveBeenCalledWith({
      userId: mockLociUser.id,
      venueId: 'venue-uuid-001',
    });
  });

  it('rejects missing venue_id', async () => {
    mockAuth();
    const res = await request(app)
      .delete(`${BASE}/leave`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── PresenceService unit tests ────────────────────────────
describe('PresenceService._haversineDistance (unit)', () => {
  // Re-require the REAL service (not the mock)
  const RealService = jest.requireActual('../src/services/presence');

  it('returns 0 for identical coordinates', () => {
    const d = RealService._haversineDistance(42.3467, -71.0972, 42.3467, -71.0972);
    expect(d).toBe(0);
  });

  it('calculates distance between Boston and Providence', () => {
    // Actual driving/straight-line distance is ~64-67km
    const d = RealService._haversineDistance(42.3601, -71.0589, 41.8236, -71.4222);
    expect(d).toBeGreaterThan(60000);
    expect(d).toBeLessThan(70000);
  });

  it('is symmetric (A→B === B→A)', () => {
    const d1 = RealService._haversineDistance(42.3601, -71.0589, 41.8236, -71.4222);
    const d2 = RealService._haversineDistance(41.8236, -71.4222, 42.3601, -71.0589);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});
