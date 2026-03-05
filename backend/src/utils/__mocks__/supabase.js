'use strict';

// Shared Supabase mock — used by all tests via jest.mock('../utils/supabase')
const makeMockFrom = () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return chain;
};

const mockAuth = {
  signInAnonymously: jest.fn(),
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  getUser: jest.fn(),
  admin: { updateUserById: jest.fn() },
};

const mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });

const supabase = {
  from: jest.fn().mockImplementation(makeMockFrom),
  auth: mockAuth,
  rpc: mockRpc,
};

const supabaseAdmin = {
  from: jest.fn().mockImplementation(makeMockFrom),
  auth: { admin: { updateUserById: jest.fn() } },
  rpc: mockRpc,
};

module.exports = { supabase, supabaseAdmin };
