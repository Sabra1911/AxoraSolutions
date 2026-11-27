/** Para qué sirve cada sección del menú, según el perfil. Lo usan el menú (tooltip) y el manual. */
export type HelpRole = 'ADMIN' | 'CLIENTE' | 'TECNICO';
export interface MenuHelp { path: string; label: string; para: string; }

export const MENU_HELP: Record<HelpRole, MenuHelp[]> = {
  ADMIN: [
    { path: '/dashboard', label: 'Dashboard', para: 'Resumen del día: solicitudes por atender, cotizaciones pendientes y órdenes en curso.' },
    { path: '/empresas', label: 'Empresas', para: 'Clientes de AXORA con sus sedes, contactos y usuarios. Aquí se crean y se revisa su información.' },
    { path: '/usuarios', label: 'Usuarios', para: 'Cuentas de acceso y su rol. Al crear un usuario sin contraseña recibe una invitación por correo para activar su cuenta.' },
    { path: '/servicios', label: 'Servicios', para: 'Catálogo de lo que ofrece AXORA, con descripción, precio base de mano de obra y unidad de cobro.' },
    { path: '/equipos', label: 'Equipos', para: 'Inventario de equipos de cada cliente (computadores, impresoras, cámaras, redes) con su historial.' },
    { path: '/solicitudes', label: 'Solicitudes', para: 'Pedidos y consultas de los clientes: revisarlos, asignar técnico, cotizar o responder una consulta.' },
    { path: '/cotizaciones', label: 'Cotizaciones', para: 'Precios enviados a los clientes en COP. El cliente aprueba, rechaza o solo consulta.' },
    { path: '/ordenes', label: 'Órdenes de servicio', para: 'Trabajos aprobados que se asignan a un técnico y quedan documentados con evidencias.' },
    { path: '/promociones', label: 'Promociones', para: 'Descuentos con código y bonos de cortesía: quién puede usarlos, cuántas veces y hasta cuándo.' },
    { path: '/planes', label: 'Planes', para: 'Paquetes de mantenimiento mensual: servicios incluidos, precio y visitas al mes.' },
    { path: '/contratos', label: 'Contratos', para: 'Qué plan tiene cada empresa y su vigencia. Un contrato vigente alimenta los mantenimientos preventivos.' },
    { path: '/mantenimientos', label: 'Mantenimientos', para: 'Agenda de visitas preventivas y correctivas: equipo, fecha, frecuencia y técnico.' },
    { path: '/historial', label: 'Historial', para: 'Bitácora de cambios de estado: quién hizo qué y cuándo.' },
    { path: '/disenador-espacios', label: 'Diseñador de espacios', para: 'Propuestas visuales (con IA o manuales) de cámaras, techos o paneles a partir de la foto del cliente.' },
    { path: '/ia', label: 'Asistente IA', para: 'Apoyo para redactar, resumir y consultar información de la plataforma.' },
  ],
  CLIENTE: [
    { path: '/inicio', label: 'Inicio', para: 'Resumen de lo suyo: solicitudes en curso, cotizaciones por responder y próximos mantenimientos.' },
    { path: '/solicitudes/nueva', label: 'Nueva solicitud', para: 'Pida un servicio (recibirá una cotización) o haga solo una consulta, sin compromiso.' },
    { path: '/solicitudes', label: 'Seguimiento', para: 'Estado de todo lo que ha pedido, paso a paso.' },
    { path: '/cotizaciones', label: 'Cotizaciones', para: 'Precios que le enviamos. Puede aprobar, rechazar o solo consultar para hacer una pregunta.' },
    { path: '/ordenes', label: 'Servicios realizados', para: 'Trabajos hechos o en curso en su empresa, con la evidencia.' },
    { path: '/equipos', label: 'Equipos', para: 'Sus equipos registrados y el historial de cada uno.' },
    { path: '/historial', label: 'Historial', para: 'Todo lo ocurrido en su cuenta, por fecha.' },
    { path: '/mantenimientos', label: 'Mantenimientos', para: 'Visitas programadas por su plan.' },
    { path: '/beneficios', label: 'Beneficios', para: 'Reclame un bono o código de descuento y vea sus beneficios disponibles.' },
    { path: '/disenador-espacios', label: 'Diseñador de espacios', para: 'Suba una foto de su local y vea una propuesta de cámaras, techo o paneles.' },
    { path: '/ia', label: 'Asistente IA', para: 'Resuelva dudas sobre los servicios y la plataforma.' },
  ],
  TECNICO: [
    { path: '/ordenes', label: 'Órdenes asignadas', para: 'Sus trabajos de campo: cambie el estado, registre lo hecho y suba fotos.' },
    { path: '/disenador-espacios', label: 'Propuestas de espacios', para: 'Revise y ajuste propuestas de diseño y suba imágenes del sitio.' },
    { path: '/mantenimientos', label: 'Mantenimientos', para: 'Visitas preventivas asignadas a usted.' },
    { path: '/ia', label: 'Asistente IA', para: 'Consulte procedimientos y resuma información.' },
  ],
};
