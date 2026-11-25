const { createRepository } = require('../../core/repository');
const { createCrudService, createCrudRoutes } = require('../../core/crud');
const { z, texto, textoOpc } = require('../../core/schemas');

const repo = createRepository({
  table: 'SERVICIOS', alias: 'S', columns: ['linea', 'codigo', 'nombre', 'descripcion', 'precio_base', 'unidad', 'activo'],
  searchable: ['nombre', 'codigo', 'descripcion'], filters: ['linea', 'activo'], orderBy: 'S.LINEA, S.NOMBRE',
});
const service = createCrudService({ repo, entity: 'SERVICIO', label: 'Servicio' });
const base = z.object({
  linea: z.enum(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'ADECUACIONES']), codigo: texto(30), nombre: texto(150), descripcion: textoOpc(1000),
  precio_base: z.coerce.number().min(0), unidad: texto(30).default('servicio'),
});
const router = createCrudRoutes({ service, read: 'servicios:read', write: 'servicios:write', createSchema: base, updateSchema: base.partial() });
module.exports = { repo, service, router };
