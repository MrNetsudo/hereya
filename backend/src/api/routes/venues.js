'use strict';

const express = require('express');
const Joi = require('joi');
const OpenAI = require('openai');
const { optionalAuth } = require('../middleware/auth');
const { supabaseAdmin } = require('../../utils/supabase');
const venueService = require('../../services/venues');
const config = require('../../config');

const router = express.Router();

// Lazy OpenAI client (reuse key already used by moderation service)
let _openai = null;
const getOpenAI = () => {
  if (!_openai && config.openai?.apiKey) _openai = new OpenAI({ apiKey: config.openai.apiKey });
  return _openai;
};

// In-memory vibe cache: key = venueId-hourOfDay
const vibeCache = new Map();

const nearbySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().positive().max(5000).default(500),
});

// GET /venues/nearby — fetch from Foursquare (cached in DB)
router.get('/nearby', optionalAuth, async (req, res, next) => {
  try {
    const { error, value } = nearbySchema.validate(req.query);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const venues = await venueService.getNearbyVenues({
      latitude: value.lat,
      longitude: value.lng,
      radiusM: value.radius,
    });

    return res.json({ venues });
  } catch (err) {
    return next(err);
  }
});

// ── GET /venues/search ────────────────────────────────────────────────────────
const searchSchema = Joi.object({
  q:     Joi.string().min(2).max(100).required(),
  lat:   Joi.number().min(-90).max(90),
  lng:   Joi.number().min(-180).max(180),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const { error, value } = searchSchema.validate(req.query);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    // 1. DB search by name
    let { data: dbVenues } = await supabaseAdmin
      .from('venues')
      .select('id, name, address, city, state, category, latitude, longitude, geofence_radius_m, is_partner, welcome_message')
      .ilike('name', `%${value.q}%`)
      .eq('is_active', true)
      .limit(value.limit);
    dbVenues = dbVenues || [];

    // 2. Enrich with live room occupancy
    const enriched = await Promise.all(
      dbVenues.map(async (v) => {
        const { data: rooms } = await supabaseAdmin
          .from('rooms')
          .select('status, total_members')
          .eq('venue_id', v.id)
          .in('status', ['warming', 'active'])
          .limit(1);
        const room = rooms?.[0];
        return { ...v, room_status: room?.status || 'inactive', occupancy: room?.total_members || 0 };
      })
    );

    // 3. If sparse results and location given, fall back to OSM
    if (enriched.length < 3 && value.lat && value.lng) {
      const osmVenues = await venueService.getNearbyVenues({
        latitude: value.lat,
        longitude: value.lng,
        radiusM: 1000,
      });
      osmVenues
        .filter((v) => v.name.toLowerCase().includes(value.q.toLowerCase()))
        .forEach((v) => {
          if (!enriched.find((e) => e.id === v.id)) {
            enriched.push({ ...v, room_status: 'inactive', occupancy: 0 });
          }
        });
    }

    return res.json({ venues: enriched, query: value.q, total: enriched.length });
  } catch (err) {
    return next(err);
  }
});

// ── GET /venues/:id/vibe ──────────────────────────────────────────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VIBE_FALLBACKS = [
  'The energy here is what you make it.',
  'Something is always happening in a place like this.',
  'Show up and find out.',
  'Whatever tonight is, this is the place for it.',
];

router.get('/:id/vibe', optionalAuth, async (req, res, next) => {
  try {
    const venue = await venueService.getVenueById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'NOT_FOUND', message: 'Venue not found' });

    // Get live occupancy
    const { data: rooms } = await supabaseAdmin
      .from('rooms')
      .select('total_members')
      .eq('venue_id', venue.id)
      .in('status', ['warming', 'active'])
      .limit(1);
    const occupancy = rooms?.[0]?.total_members || 0;

    // Cache by venue + hour of day (changes vibe throughout the day)
    const now = new Date();
    const cacheKey = `${venue.id}-${now.getUTCHours()}`;
    const cached = vibeCache.get(cacheKey);
    if (cached) return res.json({ vibe: cached, cached: true });

    const openai = getOpenAI();
    if (!openai) {
      const fallback = VIBE_FALLBACKS[Math.floor(Math.random() * VIBE_FALLBACKS.length)];
      return res.json({ vibe: fallback, cached: false });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 80,
      temperature: 0.85,
      messages: [
        {
          role: 'system',
          content:
            'You write dry, witty 1–2 sentence vibe checks for venues. Keep it under 120 characters. No hashtags. No emojis. Describe the energy of the place — never reference or identify specific people. Anonymous and atmospheric.',
        },
        {
          role: 'user',
          content: `Venue: ${venue.name}. Type: ${venue.category}. Time: ${now.getUTCHours()}:00. Day: ${DAYS[now.getDay()]}. People here: ${occupancy}.`,
        },
      ],
    });

    const vibe = completion.choices[0]?.message?.content?.trim() || VIBE_FALLBACKS[0];
    vibeCache.set(cacheKey, vibe);
    // Auto-expire after 1 hour
    setTimeout(() => vibeCache.delete(cacheKey), 60 * 60 * 1000);

    return res.json({ vibe, cached: false });
  } catch (err) {
    return next(err);
  }
});

// ── GET /venues/:id ───────────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { data: venue, error } = await supabaseAdmin
      .from('venues')
      .select(`
        id, name, address, city, state, category,
        latitude, longitude, geofence_radius_m,
        is_active, is_partner, welcome_message,
        rooms ( id, status, total_members )
      `)
      .eq('id', req.params.id)
      .eq('is_active', true)
      .single();

    if (error || !venue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Venue not found' });
    }

    const activeRoom = venue.rooms?.find((r) => ['warming', 'active'].includes(r.status));

    return res.json({
      id: venue.id,
      name: venue.name,
      address: `${venue.address}, ${venue.city}, ${venue.state}`,
      category: venue.category,
      is_partner: venue.is_partner,
      welcome_message: venue.welcome_message,
      room_status: activeRoom?.status || 'inactive',
      occupancy: activeRoom?.total_members || 0,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
