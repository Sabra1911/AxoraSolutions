const router = require('express').Router();
const svc = require('./service');
const { createCrudRoutes } = require('../../core/crud');
const { z, id, texto, textoOpc, email } = require('../../core/schemas');

const empresaBase = z.object({
  nit: texto(20), razon_social: texto(200), nombre_comercial: textoOpc(200), sector: textoOpc(100),
  direccion: textoOpc(250), ciudad: texto(100).default('Cúcuta'), telefono: textoOpc(40), email: email.nullish().or(z.literal('')),
});
const sedeBase = z.object({ empresa_id: id, nombre: texto(150), direccion: textoOpc(250), ciudad: textoOpc(100), telefono: textoOpc(40) });
const contactoBase = z.object({
  empresa_id: id, sede_id: id.nullish(), nombre: texto(150), cargo: textoOpc(100), email: email.nullish().or(z.literal('')),
  telefono: textoOpc(40), whatsapp: textoOpc(40), principal: z.boolean().optional(),
});

// Rutas anidadas primero para que no las capture /:id
router.use('/sedes', createCrudRoutes({ service: svc.sedes, read: 'empresas:read', write: 'empresas:write', createSchema: sedeBase, updateSchema: sedeBase.partial() }));
router.use('/contactos', createCrudRoutes({ service: svc.contactos, read: 'empresas:read', write: 'empresas:write', createSchema: contactoBase, updateSchema: contactoBase.partial() }));
router.use('/', createCrudRoutes({ service: svc.empresas, read: 'empresas:read', write: 'empresas:write', createSchema: empresaBase, updateSchema: empresaBase.partial() }));

module.exports = router;
