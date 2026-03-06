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

    // Create LOCI user record
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

// POST /auth/email-signup — send OTP to email
router.post('/email-signup', authLimiter, async (req, res, next) => {
  try {
    const { name, email } = req.body;

    // Validate name
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name must be at least 2 characters' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Please enter a valid email address' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName = String(name).trim();

    // Generate 6-digit OTP
    const code = String(Math.floor(Math.random() * 900000) + 100000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete old OTPs for this email
    await supabaseAdmin
      .from('otp_codes')
      .delete()
      .eq('email', cleanEmail);

    // Insert new OTP
    const { error: insertError } = await supabaseAdmin
      .from('otp_codes')
      .insert({
        email: cleanEmail,
        code,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      logger.error('OTP insert error', { insertError });
      return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to generate verification code' });
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
      logger.error('Resend email error', { status: emailRes.status, errBody });
      return res.status(500).json({ error: 'EMAIL_ERROR', message: 'Failed to send verification email. Please try again.' });
    }

    logger.info('OTP sent', { email: cleanEmail });
    return res.json({ ok: true, message: 'Verification code sent to your email' });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/verify-otp — verify OTP and return JWT
router.post('/verify-otp', authLimiter, async (req, res, next) => {
  try {
    const { name, email, code } = req.body;

    if (!name || !email || !code) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name, email, and code are required' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanCode = String(code).trim();
    const cleanName = String(name).trim();

    // Look up the OTP
    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('otp_codes')
      .select('*')
      .eq('email', cleanEmail)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'No verification code found. Please request a new code.' });
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'EXPIRED_CODE', message: 'Verification code has expired. Please request a new one.' });
    }

    // Check code match
    if (otpRecord.code !== cleanCode) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Incorrect verification code. Please try again.' });
    }

    // Mark OTP as used
    await supabaseAdmin
      .from('otp_codes')
      .update({ used: true })
      .eq('id', otpRecord.id);

    // Generate a Supabase magic link to get a real session token
    // (creates user in Supabase auth if they don't exist)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });

    if (linkError) {
      logger.error('Supabase generateLink error', { linkError });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to create authentication session' });
    }

    const { hashed_token } = linkData.properties;
    const authUser = linkData.user;

    // Exchange hashed_token for a session via Supabase Auth REST API
    const verifyRes = await fetch(`${config.supabase.url}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabase.anonKey,
      },
      body: JSON.stringify({ token: hashed_token, type: 'magiclink' }),
    });

    if (!verifyRes.ok) {
      const verifyErr = await verifyRes.json().catch(() => ({}));
      logger.error('Supabase verify error', { status: verifyRes.status, verifyErr });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to create session. Please try again.' });
    }

    const session = await verifyRes.json();
    const accessToken = session.access_token;

    if (!accessToken) {
      logger.error('No access token in Supabase verify response', { session });
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Authentication failed. Please try again.' });
    }

    // Upsert LOCI user record
    const { data: lociUser, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        auth_id: authUser.id,
        display_name: cleanName,
        email: cleanEmail,
        email_verified: true,
        is_anonymous: false,
      }, { onConflict: 'auth_id' })
      .select()
      .single();

    if (upsertError) {
      logger.error('User upsert error', { upsertError });
      return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to save user profile' });
    }

    logger.info('User verified via OTP', { userId: lociUser.id, email: cleanEmail });

    return res.json({
      token: accessToken,
      user: {
        id: lociUser.id,
        display_name: lociUser.display_name,
        email: lociUser.email,
        email_verified: lociUser.email_verified,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
