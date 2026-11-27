const env = require('../config/env');

/** Envío de correo. mode=console solo escribe en el log (desarrollo). mode=smtp usa nodemailer. */
async function sendMail({ to, subject, text }) {
  if (env.mail.mode === 'smtp') {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: env.mail.host, port: env.mail.port, secure: env.mail.port === 465,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
    await transport.sendMail({ from: env.mail.from, to, subject, text });
    return;
  }
  if (env.isProd) throw new Error('MAIL_MODE=console no está permitido en producción');
  console.log(`[mail:console] Para: ${to} | Asunto: ${subject}\n${text}`);
}
module.exports = { sendMail };
