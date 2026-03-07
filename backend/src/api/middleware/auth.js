'use strict';

const { supabase, supabaseAdmin } = require('../../utils/supabase');
const logger = require('../../utils/logger');

/**
 * requireAuth — Validates Supabase JWT from Authorization header.
 * Attaches req.user (Supabase auth user) and req.lociUser (our users table row).
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing auth token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }

    // Fetch our extended user record — auto-create if missing
    let { data: lociUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();

    if (userError || !lociUser) {
      // First-time user — create a record automatically
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anonymous';
      const { data: created, error: createErr } = await supabase
        .from('users')
        .insert({ auth_id: user.id, display_name: displayName, is_anonymous: !user.email })
        .select()
        .single();
      if (createErr || !created) {
        logger.warn('Could not auto-create user record', { auth_id: user.id, err: createErr?.message });
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User record not found' });
      }
      lociUser = created;
      logger.info('Auto-created user record', { auth_id: user.id, userId: lociUser.id });
    }

    if (lociUser.is_banned) {
      return res.status(403).json({ error: 'USER_BANNED', message: 'Account has been banned' });
    }

    req.authUser = user;
    req.user = lociUser;

    // Fire-and-forget: update last_active_at
    supabaseAdmin.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', lociUser.id).then(() => {});

    return next();
  } catch (err) {
    logger.error('Auth middleware error', { err });
    return next(err);
  }
};

/**
 * optionalAuth — Like requireAuth but doesn't fail if no token present.
 * req.user will be null for unauthenticated requests.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  // Try to resolve the user — but never block the request if it fails.
  try {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      const { data: lociUser } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();

      req.authUser = user;
      req.user = lociUser || null;
    } else {
      req.user = null;
    }
  } catch (_) {
    req.user = null;
  }

  return next();
};

module.exports = { requireAuth, optionalAuth };
