const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../../config/env');
const svc = require('./service');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, email, password } = require('../../core/schemas');

const COOKIE = 'ms_rt';
const cookieOpts = () => ({ httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api/auth', maxAge: env.refreshTtlDays * 86400000 });
const meta = (req) => ({ ip: req.ip, ua: req.headers['user-agent'] });
const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos, intente más tarde' } } });

const sessionResponse = (res, s) => {
  res.cookie(COOKIE, s.refreshToken, cookieOpts());
  res.json({ accessToken: s.accessToken, user: s.user });
};

router.post('/login', strict, validate(z.object({ email, password: z.string().min(1).max(100) })), asyncHandler(async (req, res) => {
  sessionResponse(res, await svc.login(req.valid.email, req.valid.password, meta(req)));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  try {
    sessionResponse(res, await svc.refresh(req.cookies[COOKIE], meta(req)));
  } catch (e) {
    res.clearCookie(COOKIE, { path: '/api/auth' });
    throw e;
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await svc.logout(req.cookies[COOKIE], ctxOf(req));
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.status(204).end();
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => res.json(await svc.me(req.user.id))));

router.post('/cambiar-password', authenticate, validate(z.object({ actual: z.string().min(1), nueva: password })), asyncHandler(async (req, res) => {
  await svc.changePassword(ctxOf(req), req.valid.actual, req.valid.nueva);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.status(204).end();
}));

router.post('/olvide-password', strict, validate(z.object({ email })), asyncHandler(async (req, res) => {
  await svc.forgotPassword(req.valid.email, ctxOf(req));
  res.json({ mensaje: 'Si el correo está registrado, recibirá instrucciones para restablecer su contraseña.' });
}));

router.post('/restablecer-password', strict, validate(z.object({ token: z.string().min(20).max(200), nueva: password })), asyncHandler(async (req, res) => {
  await svc.resetPassword(req.valid.token, req.valid.nueva, ctxOf(req));
  res.status(204).end();
}));

module.exports = router;
