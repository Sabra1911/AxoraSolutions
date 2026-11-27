-- MS En Línea · V002 · Roles, permisos, catálogo de servicios y plantillas (datos de referencia, sin credenciales)

INSERT INTO ROLES (CODIGO, NOMBRE, DESCRIPCION) VALUES ('SUPERADMIN', 'Superadministrador', 'Control total, incluida la gestión de administradores')
/
INSERT INTO ROLES (CODIGO, NOMBRE, DESCRIPCION) VALUES ('ADMIN', 'Administrador', 'Gestión operativa de MS')
/
INSERT INTO ROLES (CODIGO, NOMBRE, DESCRIPCION) VALUES ('TECNICO', 'Técnico', 'Ejecuta órdenes y mantenimientos asignados')
/
INSERT INTO ROLES (CODIGO, NOMBRE, DESCRIPCION) VALUES ('CLIENTE', 'Cliente empresarial', 'Usuario de una empresa cliente')
/

INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'empresas:read', 'Consultar empresas, sedes y contactos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'empresas:write', 'Crear/editar/desactivar empresas, sedes y contactos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'usuarios:read', 'Consultar usuarios' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'usuarios:write', 'Gestionar usuarios y roles' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'servicios:read', 'Consultar catálogo de servicios' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'servicios:write', 'Gestionar catálogo de servicios' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'equipos:read', 'Consultar equipos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'equipos:write', 'Registrar y editar equipos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'solicitudes:read', 'Consultar solicitudes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'solicitudes:create', 'Crear solicitudes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'solicitudes:cancel', 'Cancelar solicitudes propias de la empresa' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'solicitudes:manage', 'Gestionar, asignar y cambiar estado de solicitudes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'cotizaciones:read', 'Consultar cotizaciones' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'cotizaciones:write', 'Crear, editar, enviar y anular cotizaciones' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'cotizaciones:respond', 'Aprobar o rechazar cotizaciones' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'ordenes:read', 'Consultar órdenes de servicio' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'ordenes:manage', 'Crear, asignar, cerrar y cancelar órdenes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'ordenes:execute', 'Ejecutar órdenes asignadas (diagnóstico, actividades, finalización)' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'planes:read', 'Consultar planes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'planes:write', 'Gestionar planes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'contratos:read', 'Consultar contratos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'contratos:write', 'Gestionar contratos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'mantenimientos:read', 'Consultar mantenimientos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'mantenimientos:manage', 'Programar, asignar y cancelar mantenimientos' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'mantenimientos:execute', 'Ejecutar mantenimientos asignados' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'historial:read', 'Consultar historial' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'reportes:read', 'Consultar dashboard y reportes' FROM DUAL
/
INSERT INTO PERMISOS (CODIGO, DESCRIPCION) SELECT 'auditoria:read', 'Consultar auditoría' FROM DUAL
/

-- SUPERADMIN y ADMIN: todos los permisos
INSERT INTO ROL_PERMISO (ROL_ID, PERMISO_ID)
SELECT R.ID, P.ID FROM ROLES R CROSS JOIN PERMISOS P WHERE R.CODIGO IN ('SUPERADMIN','ADMIN')
/
-- TECNICO
INSERT INTO ROL_PERMISO (ROL_ID, PERMISO_ID)
SELECT R.ID, P.ID FROM ROLES R, PERMISOS P
WHERE R.CODIGO = 'TECNICO' AND P.CODIGO IN ('solicitudes:read','ordenes:read','ordenes:execute','mantenimientos:read','mantenimientos:execute','servicios:read')
/
-- CLIENTE
INSERT INTO ROL_PERMISO (ROL_ID, PERMISO_ID)
SELECT R.ID, P.ID FROM ROLES R, PERMISOS P
WHERE R.CODIGO = 'CLIENTE' AND P.CODIGO IN ('empresas:read','servicios:read','equipos:read','solicitudes:read','solicitudes:create','solicitudes:cancel',
  'cotizaciones:read','cotizaciones:respond','ordenes:read','contratos:read','mantenimientos:read','historial:read','reportes:read')
/

-- Catálogo inicial de servicios (editable desde el panel)
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('SOPORTE_EQUIPOS','SOP-001','Mantenimiento preventivo de computador','Limpieza física, actualización de software y revisión de estado',60000,'equipo')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('SOPORTE_EQUIPOS','SOP-002','Mantenimiento correctivo de portátil','Diagnóstico y reparación de fallas de hardware o software',90000,'equipo')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('SOPORTE_EQUIPOS','SOP-003','Soporte técnico en sitio','Visita técnica para atención de incidentes',80000,'visita')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('REDES','RED-001','Instalación de punto de red','Cableado estructurado, certificación y rotulado',120000,'punto')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('REDES','RED-002','Configuración de red y WiFi','Configuración de router, switch y puntos de acceso',150000,'servicio')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('REDES','RED-003','Mantenimiento de red','Revisión y optimización de la red existente',100000,'visita')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('CCTV','CCT-001','Instalación de cámara de seguridad','Instalación y configuración de cámara IP/analógica',180000,'cámara')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('CCTV','CCT-002','Instalación de DVR/NVR','Instalación de grabador y almacenamiento',250000,'equipo')
/
INSERT INTO SERVICIOS (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD) VALUES ('CCTV','CCT-003','Mantenimiento de cámaras','Limpieza, ajuste y verificación de grabación',70000,'visita')
/

-- Plantillas de notificación (el envío por correo/WhatsApp queda preparado; ver docs/PENDIENTES.md)
INSERT INTO PLANTILLAS_NOTIFICACION (CODIGO, CANAL, ASUNTO, CUERPO) VALUES ('SOLICITUD_NUEVA', 'EMAIL', 'Nueva solicitud {{codigo}}', 'Se registró la solicitud {{codigo}}: {{asunto}}.')
/
INSERT INTO PLANTILLAS_NOTIFICACION (CODIGO, CANAL, ASUNTO, CUERPO) VALUES ('COTIZACION_ENVIADA', 'EMAIL', 'Cotización {{codigo}} disponible', 'Tiene una cotización por {{total}} pendiente de respuesta.')
/
INSERT INTO PLANTILLAS_NOTIFICACION (CODIGO, CANAL, ASUNTO, CUERPO) VALUES ('ORDEN_ASIGNADA', 'WHATSAPP', NULL, 'Se le asignó la orden {{codigo}} en {{empresa}}.')
/
