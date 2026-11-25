import { Auth } from '../core/auth';
import { CrudConfig, Field } from './crud-page';
import { fmtDate } from '../core/fmt';

const opt = (arr: string[]) => arr.map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));
export const ESTADOS_SOL = opt(['NUEVA', 'EN_REVISION', 'COTIZADA', 'AUTORIZADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'CANCELADA']);
export const PRIORIDADES = opt(['BAJA', 'MEDIA', 'ALTA', 'URGENTE']);
export const CATEGORIAS = opt(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'OTRO']);
const empresaFilter = (auth: Auth): Field[] => (auth.isStaff() ? [{ key: 'empresa_id', label: 'Empresa', optionsUrl: '/empresas', optionLabel: 'razon_social' }] : []);

export const empresasConfig = (): CrudConfig => ({
  title: 'Empresas', url: '/empresas', writePerm: 'empresas:write', rowLink: (r) => `/empresas/${r.id}`, createLabel: 'Nueva empresa',
  filters: [{ key: 'activo', label: 'Estado', options: [{ value: 'true', label: 'Activas' }, { value: 'false', label: 'Inactivas' }] }],
  columns: [{ key: 'nit', label: 'NIT' }, { key: 'razon_social', label: 'Razón social' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'telefono', label: 'Teléfono' }, { key: 'email', label: 'Correo' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [
    { key: 'nit', label: 'NIT', required: true }, { key: 'razon_social', label: 'Razón social', required: true }, { key: 'nombre_comercial', label: 'Nombre comercial' },
    { key: 'sector', label: 'Sector' }, { key: 'direccion', label: 'Dirección' }, { key: 'ciudad', label: 'Ciudad', required: true }, { key: 'telefono', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' },
  ],
  defaults: { ciudad: 'Cúcuta' },
});

export const sedesConfig = (empresaId: number): CrudConfig => ({
  title: 'Sedes', url: '/empresas/sedes', writePerm: 'empresas:write', fixedParams: { empresa_id: empresaId }, defaults: { empresa_id: empresaId }, createLabel: 'Nueva sede',
  columns: [{ key: 'nombre', label: 'Sede' }, { key: 'direccion', label: 'Dirección' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'telefono', label: 'Teléfono' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [{ key: 'nombre', label: 'Nombre', required: true }, { key: 'direccion', label: 'Dirección' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'telefono', label: 'Teléfono' }],
  toPayload: (v) => ({ ...v, empresa_id: empresaId }),
});

export const contactosConfig = (empresaId: number): CrudConfig => ({
  title: 'Contactos', url: '/empresas/contactos', writePerm: 'empresas:write', fixedParams: { empresa_id: empresaId }, createLabel: 'Nuevo contacto',
  columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'cargo', label: 'Cargo' }, { key: 'email', label: 'Correo' }, { key: 'telefono', label: 'Teléfono' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [
    { key: 'nombre', label: 'Nombre', required: true }, { key: 'cargo', label: 'Cargo' }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'telefono', label: 'Teléfono' }, { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'sede_id', label: 'Sede', type: 'select', optionsUrl: '/empresas/sedes', optionParams: { empresa_id: empresaId, activo: 'true' } }, { key: 'principal', label: 'Contacto principal', type: 'checkbox' },
  ],
  toPayload: (v) => ({ ...v, empresa_id: empresaId, principal: !!v['principal'] }),
});

export const usuariosConfig = (empresaId?: number): CrudConfig => ({
  title: empresaId ? 'Usuarios de la empresa' : 'Usuarios', url: '/usuarios', writePerm: 'usuarios:write', createLabel: 'Nuevo usuario', loadRow: false,
  fixedParams: empresaId ? { empresa_id: empresaId } : undefined,
  filters: empresaId ? [] : [{ key: 'rol', label: 'Rol', options: opt(['SUPERADMIN', 'ADMIN', 'TECNICO', 'CLIENTE']) }, { key: 'activo', label: 'Estado', options: [{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }] }],
  columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Correo' }, { key: 'roles', label: 'Roles', fn: (r) => (r.roles || []).join(', ') }, { key: 'empresa_nombre', label: 'Empresa' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [
    { key: 'nombre', label: 'Nombre', required: true }, { key: 'email', label: 'Correo', type: 'email', required: true }, { key: 'telefono', label: 'Teléfono' },
    ...(empresaId ? [] : [
      { key: 'roles', label: 'Roles', type: 'multiselect', options: opt(['SUPERADMIN', 'ADMIN', 'TECNICO', 'CLIENTE']), hint: 'CLIENTE no se combina con otros roles' } as Field,
      { key: 'empresa_id', label: 'Empresa (solo para CLIENTE)', type: 'select', optionsUrl: '/empresas', optionParams: { activo: 'true' }, optionLabel: 'razon_social' } as Field,
    ]),
    { key: 'password', label: 'Contraseña inicial', type: 'password', required: true, hideOnEdit: true, hint: 'Mín. 10 caracteres, letras y números' },
  ],
  toPayload: (v) => {
    const p: any = { ...v };
    if (empresaId) { p.roles = ['CLIENTE']; p.empresa_id = empresaId; }
    else if (!(p.roles || []).includes('CLIENTE')) p.empresa_id = null;
    if (p.password === null) delete p.password;
    return p;
  },
});

export const serviciosConfig = (): CrudConfig => ({
  title: 'Catálogo de servicios', url: '/servicios', writePerm: 'servicios:write', createLabel: 'Nuevo servicio',
  filters: [{ key: 'linea', label: 'Línea', options: opt(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'ADECUACIONES']) }],
  columns: [{ key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Servicio' }, { key: 'linea', label: 'Línea', type: 'badge' }, { key: 'precio_base', label: 'Precio base', type: 'money' }, { key: 'unidad', label: 'Unidad' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [
    { key: 'linea', label: 'Línea comercial', type: 'select', options: opt(['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'ADECUACIONES']), required: true }, { key: 'codigo', label: 'Código', required: true },
    { key: 'nombre', label: 'Nombre', required: true }, { key: 'precio_base', label: 'Precio base (COP)', type: 'number', required: true }, { key: 'unidad', label: 'Unidad', required: true },
    { key: 'descripcion', label: 'Descripción', type: 'textarea' },
  ],
  defaults: { unidad: 'servicio', precio_base: 0 },
});

export const equiposConfig = (auth: Auth, empresaId?: number): CrudConfig => ({
  title: empresaId ? 'Equipos de la empresa' : 'Equipos', url: '/equipos', writePerm: 'equipos:write', createLabel: 'Nuevo equipo',
  fixedParams: empresaId ? { empresa_id: empresaId } : undefined,
  filters: [...(empresaId ? [] : empresaFilter(auth)), { key: 'tipo', label: 'Tipo', options: opt(['COMPUTADOR', 'PORTATIL', 'CAMARA', 'DVR_NVR', 'ROUTER', 'SWITCH', 'ACCESS_POINT', 'IMPRESORA', 'OTRO']) }, { key: 'estado', label: 'Estado', options: opt(['OPERATIVO', 'EN_REPARACION', 'FUERA_DE_SERVICIO', 'BAJA']) }],
  columns: [{ key: 'nombre', label: 'Equipo' }, { key: 'tipo', label: 'Tipo', fn: (r) => String(r.tipo).replace(/_/g, ' ') }, { key: 'marca', label: 'Marca' }, { key: 'serial', label: 'Serial' }, ...(empresaId || auth.isClient() ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'sede_nombre', label: 'Sede' }, { key: 'estado', label: 'Estado', type: 'badge' as const }, { key: 'activo', label: 'Activo', type: 'bool' }],
  fields: [
    ...(empresaId ? [] : [{ key: 'empresa_id', label: 'Empresa', type: 'select', optionsUrl: '/empresas', optionParams: { activo: 'true' }, optionLabel: 'razon_social', required: true, disabledOnEdit: true } as Field]),
    { key: 'sede_id', label: 'Sede', type: 'select', optionsUrl: '/empresas/sedes', ...(empresaId ? { optionParams: { empresa_id: empresaId, activo: 'true' } } : { dependsOn: 'empresa_id', optionParams: { activo: 'true' } }) },
    { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: opt(['COMPUTADOR', 'PORTATIL', 'CAMARA', 'DVR_NVR', 'ROUTER', 'SWITCH', 'ACCESS_POINT', 'IMPRESORA', 'OTRO']) },
    { key: 'nombre', label: 'Nombre / etiqueta', required: true }, { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }, { key: 'serial', label: 'Serial' }, { key: 'ubicacion', label: 'Ubicación' },
    { key: 'estado', label: 'Estado', type: 'select', options: opt(['OPERATIVO', 'EN_REPARACION', 'FUERA_DE_SERVICIO', 'BAJA']), required: true },
    { key: 'fecha_compra', label: 'Fecha de compra', type: 'date' }, { key: 'garantia_hasta', label: 'Garantía hasta', type: 'date' }, { key: 'descripcion', label: 'Descripción', type: 'textarea' },
  ],
  defaults: { estado: 'OPERATIVO', ...(empresaId ? { empresa_id: empresaId } : {}) },
  toPayload: (v) => (empresaId ? { ...v, empresa_id: empresaId } : v),
});

export const planesConfig = (): CrudConfig => ({
  title: 'Planes de mantenimiento', url: '/planes', writePerm: 'planes:write', createLabel: 'Nuevo plan', loadRow: true,
  columns: [{ key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Plan' }, { key: 'precio_mensual', label: 'Precio mensual', type: 'money' }, { key: 'visitas_mes', label: 'Visitas/mes' }, { key: 'servicios_incluidos', label: 'Servicios incluidos' }, { key: 'activo', label: 'Estado', type: 'bool' }],
  fields: [
    { key: 'codigo', label: 'Código', required: true }, { key: 'nombre', label: 'Nombre', required: true }, { key: 'precio_mensual', label: 'Precio mensual (COP)', type: 'number', required: true },
    { key: 'visitas_mes', label: 'Visitas por mes', type: 'number', required: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea' }, { key: 'alcance', label: 'Alcance', type: 'textarea' },
    { key: 'servicio_ids', label: 'Servicios incluidos', type: 'multiselect', optionsUrl: '/servicios', optionParams: { activo: 'true' } },
  ],
  defaults: { visitas_mes: 1, precio_mensual: 0, servicio_ids: [] },
});

export const contratosConfig = (auth: Auth, empresaId?: number): CrudConfig => ({
  title: empresaId ? 'Contratos de la empresa' : 'Contratos', url: '/contratos', writePerm: 'contratos:write', createLabel: 'Nuevo contrato', toggleActive: false,
  fixedParams: empresaId ? { empresa_id: empresaId } : undefined,
  filters: [{ key: 'estado', label: 'Estado', options: opt(['VIGENTE', 'SUSPENDIDO', 'VENCIDO', 'CANCELADO']) }],
  columns: [{ key: 'codigo', label: 'Código' }, ...(empresaId ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'plan_nombre', label: 'Plan' }, { key: 'fecha_inicio', label: 'Inicio', type: 'date' as const }, { key: 'fecha_fin', label: 'Fin', type: 'date' as const }, { key: 'precio_mensual', label: 'Mensual', type: 'money' as const }, { key: 'estado', label: 'Estado', type: 'badge' as const }],
  fields: [
    ...(empresaId ? [] : [{ key: 'empresa_id', label: 'Empresa', type: 'select', optionsUrl: '/empresas', optionParams: { activo: 'true' }, optionLabel: 'razon_social', required: true, disabledOnEdit: true } as Field]),
    { key: 'plan_id', label: 'Plan', type: 'select', optionsUrl: '/planes', optionParams: { activo: 'true' }, required: true },
    { key: 'fecha_inicio', label: 'Inicio', type: 'date', required: true }, { key: 'fecha_fin', label: 'Fin', type: 'date', required: true },
    { key: 'precio_mensual', label: 'Precio mensual (COP)', type: 'number', hint: 'Vacío = precio del plan' },
    { key: 'estado', label: 'Estado', type: 'select', options: opt(['VIGENTE', 'SUSPENDIDO', 'VENCIDO', 'CANCELADO']), required: true }, { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
  defaults: { estado: 'VIGENTE', ...(empresaId ? { empresa_id: empresaId } : {}) },
  toPayload: (v) => (empresaId ? { ...v, empresa_id: empresaId } : v),
});

export const mantenimientosConfig = (auth: Auth): CrudConfig => ({
  title: auth.isTecnico() ? 'Mis mantenimientos' : 'Mantenimientos', url: '/mantenimientos', writePerm: 'mantenimientos:manage', createLabel: 'Programar mantenimiento', toggleActive: false,
  subtitle: 'Preventivos y correctivos programados',
  filters: [...empresaFilter(auth), { key: 'estado', label: 'Estado', options: opt(['PROGRAMADO', 'EN_EJECUCION', 'COMPLETADO', 'CANCELADO']) }, { key: 'tipo', label: 'Tipo', options: opt(['PREVENTIVO', 'CORRECTIVO']) }],
  columns: [{ key: 'codigo', label: 'Código' }, { key: 'titulo', label: 'Mantenimiento', fn: (r) => r.titulo + (r.vencido ? ' ⚠ vencido' : '') }, ...(auth.isClient() ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'equipo_nombre', label: 'Equipo' }, { key: 'tipo', label: 'Tipo' }, { key: 'fecha_programada', label: 'Programado', type: 'date' as const }, { key: 'tecnico_nombre', label: 'Técnico' }, { key: 'estado', label: 'Estado', type: 'badge' as const }],
  fields: [
    { key: 'empresa_id', label: 'Empresa', type: 'select', optionsUrl: '/empresas', optionParams: { activo: 'true' }, optionLabel: 'razon_social', required: true, disabledOnEdit: true },
    { key: 'sede_id', label: 'Sede', type: 'select', optionsUrl: '/empresas/sedes', dependsOn: 'empresa_id' }, { key: 'equipo_id', label: 'Equipo', type: 'select', optionsUrl: '/equipos', dependsOn: 'empresa_id' },
    { key: 'tipo', label: 'Tipo', type: 'select', options: opt(['PREVENTIVO', 'CORRECTIVO']), required: true }, { key: 'titulo', label: 'Título', required: true },
    { key: 'fecha_programada', label: 'Fecha programada', type: 'date', required: true }, { key: 'frecuencia_dias', label: 'Repetir cada (días)', type: 'number', hint: 'Opcional: reprograma automáticamente al completar' },
    { key: 'tecnico_id', label: 'Técnico', type: 'select', optionsUrl: '/usuarios', optionParams: { rol: 'TECNICO', activo: 'true' } }, { key: 'descripcion', label: 'Descripción', type: 'textarea' },
  ],
  defaults: { tipo: 'PREVENTIVO' },
  rowActions: [
    { label: 'Iniciar', show: (r) => r.estado === 'PROGRAMADO' && auth.can('mantenimientos:execute') && (auth.isStaff() || r.tecnico_id === auth.user()?.id), run: async (r, { api, ui }) => { await api.post(`/mantenimientos/${r.id}/iniciar`); ui.ok('Mantenimiento iniciado'); } },
    { label: 'Completar', show: (r) => r.estado === 'EN_EJECUCION' && auth.can('mantenimientos:execute') && (auth.isStaff() || r.tecnico_id === auth.user()?.id), run: async (r, { api, ui }) => { const t = await ui.prompt('Resultado del mantenimiento', 'Describa el trabajo realizado'); if (!t) return; await api.post(`/mantenimientos/${r.id}/completar`, { resultado: t }); ui.ok('Mantenimiento completado'); } },
    { label: 'Cancelar', danger: true, show: (r) => ['PROGRAMADO', 'EN_EJECUCION'].includes(r.estado) && auth.can('mantenimientos:manage'), run: async (r, { api, ui }) => { const t = await ui.prompt('Cancelar mantenimiento', 'Motivo'); if (!t) return; await api.post(`/mantenimientos/${r.id}/cancelar`, { motivo: t }); ui.ok('Mantenimiento cancelado'); } },
  ],
});

export const solicitudesConfig = (auth: Auth): CrudConfig => ({
  title: auth.isClient() ? 'Seguimiento de solicitudes' : auth.isTecnico() ? 'Solicitudes asignadas' : 'Solicitudes', url: '/solicitudes', writePerm: 'solicitudes:create', createRoute: '/solicitudes/nueva', createLabel: 'Nueva solicitud',
  rowLink: (r) => `/solicitudes/${r.id}`,
  filters: [{ key: 'estado', label: 'Estado', options: ESTADOS_SOL }, { key: 'prioridad', label: 'Prioridad', options: PRIORIDADES }, { key: 'categoria', label: 'Categoría', options: CATEGORIAS }, ...empresaFilter(auth)],
  columns: [{ key: 'codigo', label: 'Código' }, { key: 'asunto', label: 'Asunto' }, ...(auth.isClient() ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'equipo_nombre', label: 'Equipo' }, { key: 'prioridad', label: 'Prioridad', type: 'badge' as const }, { key: 'estado', label: 'Estado', type: 'badge' as const }, { key: 'tecnico_nombre', label: 'Técnico' }, { key: 'creado_en', label: 'Creada', type: 'datetime' as const }],
});

export const cotizacionesConfig = (auth: Auth): CrudConfig => ({
  title: 'Cotizaciones', url: '/cotizaciones', writePerm: 'cotizaciones:write', createRoute: '/cotizaciones/nueva', createLabel: 'Nueva cotización', rowLink: (r) => `/cotizaciones/${r.id}`,
  filters: [{ key: 'estado', label: 'Estado', options: ['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'ANULADA'].filter((e) => !(auth.isClient() && e === 'BORRADOR')).map((v) => ({ value: v, label: v })) }, ...empresaFilter(auth)],
  columns: [{ key: 'codigo', label: 'Código' }, ...(auth.isClient() ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'solicitud_codigo', label: 'Solicitud' }, { key: 'total', label: 'Total', type: 'money' as const }, { key: 'validez_hasta', label: 'Válida hasta', type: 'date' as const }, { key: 'estado', label: 'Estado', type: 'badge' as const }],
});

export const ordenesConfig = (auth: Auth): CrudConfig => ({
  title: auth.isTecnico() ? 'Órdenes asignadas' : auth.isClient() ? 'Servicios realizados' : 'Órdenes de servicio', url: '/ordenes', rowLink: (r) => `/ordenes/${r.id}`,
  filters: [{ key: 'estado', label: 'Estado', options: opt(['PENDIENTE', 'ASIGNADA', 'EN_EJECUCION', 'FINALIZADA', 'CERRADA', 'CANCELADA']) }, { key: 'prioridad', label: 'Prioridad', options: PRIORIDADES }, ...empresaFilter(auth)],
  columns: [{ key: 'codigo', label: 'Orden' }, ...(auth.isClient() ? [] : [{ key: 'empresa_nombre', label: 'Empresa' }]), { key: 'solicitud_asunto', label: 'Trabajo' }, { key: 'equipo_nombre', label: 'Equipo' }, { key: 'tecnico_nombre', label: 'Técnico' }, { key: 'prioridad', label: 'Prioridad', type: 'badge' as const }, { key: 'fecha_programada', label: 'Programada', type: 'date' as const }, { key: 'estado', label: 'Estado', type: 'badge' as const }],
});

export const historialConfig = (auth: Auth, empresaId?: number): CrudConfig => ({
  title: empresaId ? 'Historial de la empresa' : 'Historial', url: '/historial', noSearch: true, subtitle: 'Cambios de estado de solicitudes, cotizaciones, órdenes y mantenimientos',
  fixedParams: empresaId ? { empresa_id: empresaId } : undefined,
  filters: [{ key: 'entidad', label: 'Tipo', options: [{ value: 'SOLICITUD', label: 'Solicitudes' }, { value: 'COTIZACION', label: 'Cotizaciones' }, { value: 'ORDEN', label: 'Órdenes' }, { value: 'MANTENIMIENTO', label: 'Mantenimientos' }] }, { key: 'equipo_id', label: 'Equipo', optionsUrl: '/equipos' }, ...(empresaId ? [] : empresaFilter(auth))],
  columns: [{ key: 'fecha', label: 'Fecha', type: 'datetime' }, { key: 'entidad', label: 'Tipo' }, { key: 'entidad_codigo', label: 'Código' }, { key: 'equipo_nombre', label: 'Equipo' }, { key: 'estado_nuevo', label: 'Cambio', fn: (r) => (r.estado_anterior ? `${String(r.estado_anterior).replace(/_/g, ' ')} → ` : '') + String(r.estado_nuevo).replace(/_/g, ' ') }, { key: 'comentario', label: 'Comentario' }, { key: 'usuario_nombre', label: 'Usuario' }],
});
export { fmtDate };
