const { createRepository } = require('../../core/repository');

const empresas = createRepository({
  table: 'EMPRESAS', alias: 'E', columns: ['nit', 'razon_social', 'nombre_comercial', 'sector', 'direccion', 'ciudad', 'telefono', 'email', 'activo'],
  searchable: ['razon_social', 'nit', 'nombre_comercial'], filters: ['activo', 'ciudad'], orderBy: 'E.RAZON_SOCIAL',
  empresaColumn: 'id', // un CLIENTE solo ve su propia empresa
});
const sedes = createRepository({
  table: 'SEDES', alias: 'S', columns: ['empresa_id', 'nombre', 'direccion', 'ciudad', 'telefono', 'activo'],
  searchable: ['nombre', 'direccion'], filters: ['empresa_id', 'activo'], orderBy: 'S.NOMBRE', empresaColumn: 'empresa_id',
});
const contactos = createRepository({
  table: 'CONTACTOS', alias: 'C', columns: ['empresa_id', 'sede_id', 'nombre', 'cargo', 'email', 'telefono', 'whatsapp', 'principal', 'activo'],
  searchable: ['nombre', 'email'], filters: ['empresa_id', 'sede_id', 'activo'], orderBy: 'C.NOMBRE', empresaColumn: 'empresa_id',
});
module.exports = { empresas, sedes, contactos };
