'use strict';

const express = require('express');
const { supabaseAdmin } = require('../../utils/supabase');

const router = express.Router();

// GET /stats/public — unauthenticated, for landing page
router.get('/public', async (req, res, next) => {
  try {
    const [usersResp, venuesResp] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('venues').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    return res.json({
      users:  usersResp.count  || 0,
      venues: venuesResp.count || 0,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
