const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../../config/env');
const svc = require('./service');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('../../core/http');
const { z, email, password, texto, textoOpc } = require('../../core/schemas');

const COOKIE = 'ms_rt';
const cookieOpts = () => ({ httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api/auth', maxAge: env.refreshTtlDays * 86400000 });
const meta = (req) => ({ ip: req.ip, ua: req.headers['user-agent'] });
const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) > 0 ? Number(process.env.AUTH_RATE_LIMIT) : 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos, intente más tarde' } } });

const sessionResponse = (res, s) => {
  res.cookie(COOKIE, s.refreshToken, cookieOpts());
  res.json({ accessToken: s.accessToken, user: s.user });
};

router.post('/login', strict, validate(z.object({ email, password: z.string().min(1).max(100) })), asyncHandler(async (req, res) => {
  sessionResponse(res, await svc.login(req.valid.email, req.valid.password, meta(req)));
}));

const registroSchema = z.object({
  tipo: z.enum(['EMPRESA', 'PERSONA']).default('EMPRESA'),
  nombre: texto(150, 3), email, telefono: textoOpc(30), password,
  nit: z.string().trim().min(5, 'Escriba el NIT o documento').max(20).regex(/^[A-Za-z0-9.\-]+$/, 'Use solo letras, números, punto o guion'),
  razon_social: textoOpc(200), ciudad: texto(100).default('Cúcuta'),
  acepta_datos: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar el tratamiento de datos personales' }) }),
});
const registroLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: Number(process.env.REGISTRO_RATE_LIMIT) > 0 ? Number(process.env.REGISTRO_RATE_LIMIT) : 10, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados registros desde esta red. Intente más tarde.' } } });
router.post('/registro', registroLimit, validate(registroSchema), asyncHandler(async (req, res) => {
  res.status(202).json(await svc.register(req.valid, meta(req)));
}));

router.post('/activar', strict, validate(z.object({ token: z.string().min(20).max(200), password: password.optional() })), asyncHandler(async (req, res) => {
  await svc.activate(req.valid.token, req.valid.password, meta(req));
  res.json({ ok: true });
}));
router.post('/reenviar-activacion', strict, validate(z.object({ email })), asyncHandler(async (req, res) => {
  await svc.resendActivation(req.valid.email);
  res.json({ ok: true });
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
