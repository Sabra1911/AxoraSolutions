const { z } = require('zod');

const id = z.coerce.number().int().positive();
const fecha = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const texto = (max = 255, min = 1) => z.string().trim().min(min).max(max);
const textoOpc = (max = 255) => z.string().trim().max(max).nullish();
const email = z.string().trim().toLowerCase().email().max(150);
const password = z.string().min(10, 'Mínimo 10 caracteres').max(100)
  .regex(/[A-Za-z]/, 'Debe incluir letras').regex(/\d/, 'Debe incluir números');

module.exports = { z, id, fecha, texto, textoOpc, email, password };
