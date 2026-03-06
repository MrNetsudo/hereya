'use strict';

const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { supabase, supabaseAdmin } = require('../../utils/supabase');
const { requireAuth } = require('../middleware/auth');
const config = require('../../config');
const logger = require('../../utils/logger');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimits.auth,
  message: { error: 'RATE_LIMITED', message: 'Too many auth attempts' },
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  display_name: Joi.string().min(2).max(30).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ── Email OTP Template ────────────────────────────────────
function buildOtpEmail(name, code) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Loci verification code</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111111;border-radius:16px;border:1px solid #1e1e2e;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 40px 24px;border-bottom:1px solid #1e1e2e;">
              <p style="margin:0;font-size:28px;font-weight:900;letter-spacing:6px;color:#6C63FF;">LOCI</p>
              <p style="margin:8px 0 0;font-size:13px;color:#666;letter-spacing:1px;">Walk in. Connect.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Here's your code</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#888;line-height:1.6;">Hi ${name}, use this 6-digit code to verify your Loci account.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <div style="background:#6C63FF;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:48px;font-weight:900;letter-spacing:12px;color:#ffffff;font-family:'Courier New',Courier,monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#666;text-align:center;">This code expires in <strong style="color:#ffffff;">10 minutes</strong>.</p>
              <p style="margin:0;font-size:12px;color:#444;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px;border-top:1px solid #1e1e2e;">
              <p style="margin:0;font-size:12px;color:#444;">Loci &middot; by NetSudo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// POST /auth/anonymous
router.post('/anonymous', authLimiter, async (req, res, next) => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return next(error);

    const displayName = `User${Math.floor(Math.random() * 9000) + 1000}`;
    const { data: lociUser } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: data.user.id,
        is_anonymous: true,
        display_name: displayName,
        device_id: req.body.device_id || null,
      })
      .select()
      .single();

    return res.status(201).json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: { id: lociUser.id, is_anonymous: true, display_name: lociUser.display_name },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { error: valError, value } = registerSchema.validate(req.body);
    if (valError) return res.status(400).json({ error: 'VALIDATION_ERROR', message: valError.message });

    const { data, error } = await supabase.auth.signUp({
      email: value.email,
      password: value.password,
    });

    if (error) return res.status(400).json({ error: 'AUTH_ERROR', message: error.message });

    const { data: lociUser } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: data.user.id,
        is_anonymous: false,
        display_name: value.display_name || `User${Math.floor(Math.random() * 9000) + 1000}`,
      })
      .select()
      .single();

    return res.status(201).json({
      token: data.session?.access_token,
      user: { id: lociUser.id, is_anonymous: false, display_name: lociUser.display_name },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { error: valError, value } = loginSchema.validate(req.body);
    if (valError) return res.status(400).json({ error: 'VALIDATION_ERROR', message: valError.message });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: value.email,
      password: value.password,
    });

    if (error) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });

    const { data: lociUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    return res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: { id: lociUser.id, is_anonymous: false, display_name: lociUser.display_name },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/upgrade — anonymous → named account
router.post('/upgrade', requireAuth, authLimiter, async (req, res, next) => {
  try {
    if (!req.user.is_anonymous) {
      return res.status(400).json({ error: 'ALREADY_NAMED', message: 'Account is already a named account' });
    }

    const { error: valError, value } = registerSchema.validate(req.body);
    if (valError) return res.status(400).json({ error: 'VALIDATION_ERROR', message: valError.message });

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.authUser.id, {
      email: value.email,
      password: value.password,
    });

    if (error) return res.status(400).json({ error: 'AUTH_ERROR', message: error.message });

    await supabaseAdmin
      .from('users')
      .update({ is_anonymous: false, display_name: value.display_name || req.user.display_name })
      .eq('id', req.user.id);

    return res.json({ success: true, user: { id: req.user.id, is_anonymous: false } });
  } catch (err) {
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────
// POST /auth/email-signup
// Uses Supabase's built-in OTP generation — no otp_codes table needed!
// ─────────────────────────────────────────────────────────
router.post('/email-signup', authLimiter, async (req, res, next) => {
  try {
    const { name, email } = req.body;

    // Validate
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name must be at least 2 characters' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Please enter a valid email address' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName = String(name).trim();

    // Generate OTP via Supabase Admin (creates auth user if not exists)
    // The 'email_otp' field is a 6-digit code Supabase stores internally
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });

    if (linkError) {
      logger.error('Supabase generateLink error', { linkError });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to generate verification code. Please try again.' });
    }

    const code = linkData.properties.email_otp;
    if (!code || code.length < 6) {
      logger.error('No email_otp in generateLink response', { properties: linkData.properties });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to generate verification code.' });
    }

    // Send email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.resend.from,
        to: cleanEmail,
        subject: 'Your Loci verification code',
        html: buildOtpEmail(cleanName, code),
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.json().catch(() => ({}));
      logger.error('Resend error', { status: emailRes.status, errBody });
      return res.status(500).json({ error: 'EMAIL_ERROR', message: 'Failed to send verification email. Please try again.' });
    }

    logger.info('OTP sent via Supabase+Resend', { email: cleanEmail });
    return res.json({ ok: true, message: 'Verification code sent to your email' });
  } catch (err) {
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────
// POST /auth/verify-otp
// Verifies OTP against Supabase Auth internally — no otp_codes table needed!
// ─────────────────────────────────────────────────────────
router.post('/verify-otp', authLimiter, async (req, res, next) => {
  try {
    const { name, email, code } = req.body;

    if (!name || !email || !code) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name, email, and code are required' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanCode = String(code).trim();
    const cleanName = String(name).trim();

    // Verify OTP against Supabase Auth (stored internally by generateLink)
    // The email_otp from generateLink can be verified with type 'email' or 'magiclink'
    const verifyRes = await fetch(`${config.supabase.url}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabase.anonKey,
      },
      body: JSON.stringify({
        type: 'email',
        token: cleanCode,
        email: cleanEmail,
        gotrue_meta_security: {},
      }),
    });

    // Try magiclink type if email type fails
    let session = await verifyRes.json();

    if (!session.access_token) {
      // Try with 'magiclink' type
      const verifyRes2 = await fetch(`${config.supabase.url}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.supabase.anonKey,
        },
        body: JSON.stringify({
          type: 'magiclink',
          token: cleanCode,
          email: cleanEmail,
        }),
      });
      session = await verifyRes2.json();
    }

    if (!session.access_token) {
      const errMsg = session.error_description || session.msg || 'Invalid or expired verification code.';
      logger.warn('OTP verify failed', { email: cleanEmail, response: session });
      return res.status(400).json({ error: 'INVALID_CODE', message: errMsg });
    }

    const authUserId = session.user?.id;
    const authUserEmail = session.user?.email || cleanEmail;
    const emailVerified = !!(session.user?.email_confirmed_at);
    const accessToken = session.access_token;

    if (!authUserId) {
      logger.error('No user ID in verify response', { session });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Authentication failed.' });
    }

    // Upsert LOCI user (display_name only — email stored in Supabase Auth)
    const { data: lociUser, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        auth_id: authUserId,
        display_name: cleanName,
        is_anonymous: false,
      }, { onConflict: 'auth_id' })
      .select()
      .single();

    if (upsertError) {
      logger.error('User upsert error', { upsertError });
      return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to save user profile' });
    }

    logger.info('User verified via email OTP', { userId: lociUser.id, email: cleanEmail });

    return res.json({
      token: accessToken,
      user: {
        id: lociUser.id,
        display_name: lociUser.display_name,
        email: authUserEmail,
        email_verified: true, // Supabase confirmed the OTP = email is verified
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
