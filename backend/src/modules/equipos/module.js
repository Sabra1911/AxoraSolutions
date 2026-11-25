const { createRepository } = require('../../core/repository');
const { createCrudService, createCrudRoutes } = require('../../core/crud');
const { badRequest, notFound } = require('../../core/errors');
const { z, id, fecha, texto, textoOpc } = require('../../core/schemas');
const db = require('../../config/db');

const repo = createRepository({
  table: 'EQUIPOS', alias: 'Q', columns: ['empresa_id', 'sede_id', 'tipo', 'nombre', 'marca', 'modelo', 'serial', 'ubicacion', 'fecha_compra', 'garantia_hasta', 'descripcion', 'estado', 'activo'],
  dateColumns: ['fecha_compra', 'garantia_hasta'], searchable: ['nombre', 'serial', 'marca', 'modelo'], filters: ['empresa_id', 'sede_id', 'tipo', 'estado', 'activo'],
  joins: 'JOIN EMPRESAS E ON E.ID = Q.EMPRESA_ID LEFT JOIN SEDES SD ON SD.ID = Q.SEDE_ID',
  selectExtra: 'E.RAZON_SOCIAL AS EMPRESA_NOMBRE, SD.NOMBRE AS SEDE_NOMBRE', orderBy: 'Q.NOMBRE', empresaColumn: 'empresa_id',
});

async function beforeWrite(user, data, current) {
  const empresaId = data.empresa_id ?? current?.empresa_id;
  const emp = await db.queryOne('SELECT ID, ACTIVO FROM EMPRESAS WHERE ID = :id', { id: empresaId });
  if (!emp) throw notFound('Empresa');
  if (current && data.empresa_id && data.empresa_id !== current.empresa_id) throw badRequest('No se puede cambiar la empresa de un equipo');
  const sedeId = data.sede_id ?? (data.sede_id === undefined ? current?.sede_id : null);
  if (sedeId) {
    const sede = await db.queryOne('SELECT EMPRESA_ID FROM SEDES WHERE ID = :id', { id: sedeId });
    if (!sede || sede.empresa_id !== empresaId) throw badRequest('La sede no pertenece a la empresa del equipo');
  }
  return data;
}

const service = createCrudService({ repo, entity: 'EQUIPO', label: 'Equipo', beforeWrite });
const base = z.object({
  empresa_id: id, sede_id: id.nullish(),
  tipo: z.enum(['COMPUTADOR', 'PORTATIL', 'CAMARA', 'DVR_NVR', 'ROUTER', 'SWITCH', 'ACCESS_POINT', 'IMPRESORA', 'OTRO']),
  nombre: texto(150), marca: textoOpc(80), modelo: textoOpc(80), serial: textoOpc(100), ubicacion: textoOpc(200),
  fecha_compra: fecha.nullish().or(z.literal('')), garantia_hasta: fecha.nullish().or(z.literal('')), descripcion: textoOpc(1000),
  estado: z.enum(['OPERATIVO', 'EN_REPARACION', 'FUERA_DE_SERVICIO', 'BAJA']).default('OPERATIVO'),
});
const router = createCrudRoutes({ service, read: 'equipos:read', write: 'equipos:write', createSchema: base, updateSchema: base.partial() });
module.exports = { repo, service, router };
