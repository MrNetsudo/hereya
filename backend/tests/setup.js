'use strict';

// Set test env vars before any modules load
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOCI_API_VERSION = 'v1';
process.env.HEREYA_SUPABASE_URL = 'https://test.supabase.co';
process.env.HEREYA_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.HEREYA_SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.HEREYA_OPENAI_API_KEY = 'test-openai-key';
process.env.LOCI_LOG_LEVEL = 'error';
// Crank rate limits to avoid 429s in tests
process.env.LOCI_RATE_LIMIT_MAX = '9999';
process.env.LOCI_AUTH_RATE_LIMIT_MAX = '9999';
process.env.LOCI_PRESENCE_RATE_LIMIT_MAX = '9999';
process.env.LOCI_MESSAGE_RATE_LIMIT_MAX = '9999';
