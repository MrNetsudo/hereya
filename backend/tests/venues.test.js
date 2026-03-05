'use strict';

jest.mock('../src/utils/supabase');
jest.mock('openai');

const request = require('supertest');
const app = require('../src/app');
const { supabaseAdmin } = require('../src/utils/supabase');

const BASE = '/api/v1/venues';

const mockVenue = {
  id: 'venue-uuid-001',
  name: 'Fenway Park',
  address: '4 Jersey St',
  city: 'Boston',
  state: 'MA',
  category: 'stadium',
  latitude: 42.3467,
  longitude: -71.0972,
  geofence_radius_m: 300,
  is_active: true,
  is_partner: false,
  welcome_message: null,
  rooms: [{ id: 'room-uuid-001', status: 'active', total_members: 47 }],
};

beforeEach(() => jest.clearAllMocks());

// ── GET /venues/nearby ────────────────────────────────────
describe('GET /venues/nearby', () => {
  it('returns nearby venues', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({ data: [mockVenue], error: null });
    const res = await request(app).get(`${BASE}/nearby?lat=42.3467&lng=-71.0972`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.venues)).toBe(true);
    expect(res.body.venues).toHaveLength(1);
  });

  it('returns empty array when no venues nearby', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({ data: [], error: null });
    const res = await request(app).get(`${BASE}/nearby?lat=0&lng=0`);
    expect(res.status).toBe(200);
    expect(res.body.venues).toHaveLength(0);
  });

  it('rejects missing lat', async () => {
    const res = await request(app).get(`${BASE}/nearby?lng=-71.0972`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects missing lng', async () => {
    const res = await request(app).get(`${BASE}/nearby?lat=42.3467`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range latitude', async () => {
    const res = await request(app).get(`${BASE}/nearby?lat=999&lng=-71.0972`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects radius over 5000m', async () => {
    const res = await request(app).get(`${BASE}/nearby?lat=42.3467&lng=-71.0972&radius=9999`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('accepts valid optional radius', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({ data: [], error: null });
    const res = await request(app).get(`${BASE}/nearby?lat=42.3467&lng=-71.0972&radius=200`);
    expect(res.status).toBe(200);
  });
});

// ── GET /venues/:id ───────────────────────────────────────
describe('GET /venues/:id', () => {
  it('returns venue by id with active room', async () => {
    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: mockVenue, error: null }),
    }));

    const res = await request(app).get(`${BASE}/venue-uuid-001`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Fenway Park');
    expect(res.body.room_status).toBe('active');
    expect(res.body.occupancy).toBe(47);
  });

  it('returns 404 for unknown venue', async () => {
    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
    }));

    const res = await request(app).get(`${BASE}/nonexistent-id`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('shows inactive status when no active room', async () => {
    const venueNoRoom = { ...mockVenue, rooms: [] };
    supabaseAdmin.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValueOnce({ data: venueNoRoom, error: null }),
    }));

    const res = await request(app).get(`${BASE}/venue-uuid-001`);
    expect(res.status).toBe(200);
    expect(res.body.room_status).toBe('inactive');
    expect(res.body.occupancy).toBe(0);
  });
});
