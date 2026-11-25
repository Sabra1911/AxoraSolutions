const { ZodError } = require('zod');
const { AppError } = require('../core/errors');

const ORA = {
  1: [409, 'Ya existe un registro con esos datos únicos (por ejemplo NIT, correo o código).'],
  2291: [400, 'Una de las referencias indicadas no existe.'],
  2292: [409, 'No se puede eliminar: existen registros relacionados.'],
  2290: [400, 'Un valor no cumple las restricciones permitidas.'],
  1400: [400, 'Falta un dato obligatorio.'],
  12899: [400, 'Un texto excede la longitud permitida.'],
};

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'Datos inválidos', details: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: { code: 'UPLOAD', message: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : 'Error al cargar archivos' } });
  }
  const m = /^ORA-(\d+)/.exec(err && err.message ? err.message : '');
  if (m && ORA[Number(m[1])]) {
    const [status, message] = ORA[Number(m[1])];
    return res.status(status).json({ error: { code: `ORA-${m[1]}`, message } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON inválido' } });
  }
  console.error('[error]', err); // nunca se devuelve el detalle interno al cliente
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
}

module.exports = { errorHandler, notFoundHandler };
