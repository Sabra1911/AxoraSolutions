# Modelo de datos (Oracle)

Scripts: `database/migrations/V001__esquema_base.sql` (estructura) y `V002__datos_base.sql` (roles, permisos, catálogo, plantillas).
Se aplican con `npm run db:migrate` (registra en `SCHEMA_MIGRATIONS`; es reproducible e idempotente por versión).

| Grupo | Tablas |
|---|---|
| Seguridad | ROLES, PERMISOS, ROL_PERMISO, USUARIOS, USUARIO_ROL, REFRESH_TOKENS, PASSWORD_RESETS, AUDITORIA |
| Clientes | EMPRESAS, SEDES, CONTACTOS |
| Catálogo y activos | SERVICIOS (3 líneas: SOPORTE_EQUIPOS, REDES, CCTV), EQUIPOS |
| Flujo comercial | SOLICITUDES, ADJUNTOS (= archivos/evidencias), COTIZACIONES, DETALLE_COTIZACION, ASIGNACIONES |
| Ejecución | ORDENES_SERVICIO, DETALLE_ORDEN (actividades y materiales), MANTENIMIENTOS |
| Planes | PLANES, PLAN_SERVICIO, CONTRATOS, PAGOS (tabla creada; sin pantalla aún) |
| Transversal | HISTORIAL_ESTADOS (empresa/equipo/solicitud/cotización/orden/mantenimiento), NOTIFICACIONES, PLANTILLAS_NOTIFICACION |

Decisiones:
- **Historial de equipos**: no hay tabla aparte; `HISTORIAL_ESTADOS.EQUIPO_ID` lo cubre y se filtra por equipo.
- **Archivos**: `ADJUNTOS` guarda metadatos; el binario va a disco (`UPLOAD_DIR`) con nombre aleatorio.
- **Códigos legibles** (SOL-000012, COT-…, OS-…, MTO-…, CTR-…) son columnas `VIRTUAL` derivadas del ID.
- **Sin borrado físico** de información histórica: `ACTIVO = 0` (empresas, sedes, usuarios, equipos, servicios, planes, adjuntos).
  Contratos, cotizaciones, órdenes y mantenimientos cambian de **estado** (CANCELADO/ANULADA…).
- Restricciones CHECK en estados/tipos, claves foráneas en todas las relaciones e índices en FK y filtros frecuentes.
- Un usuario CLIENTE pertenece a una empresa (`USUARIOS.EMPRESA_ID`); el personal de MS tiene `EMPRESA_ID NULL`.

## Flujos de estado
- Solicitud: NUEVA → EN_REVISION → COTIZADA → AUTORIZADA → EN_PROCESO → RESUELTA → CERRADA (CANCELADA desde estados tempranos)
- Cotización: BORRADOR → ENVIADA → APROBADA | RECHAZADA | VENCIDA (ANULADA)
- Orden: PENDIENTE → ASIGNADA → EN_EJECUCION → FINALIZADA → CERRADA (CANCELADA)
- Mantenimiento: PROGRAMADO → EN_EJECUCION → COMPLETADO (CANCELADO); si tiene frecuencia, al completarse se programa el siguiente.
