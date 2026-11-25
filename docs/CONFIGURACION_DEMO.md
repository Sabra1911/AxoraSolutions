# Configuración de la demostración

Cuentas y datos ficticios para presentar la plataforma. **Solo desarrollo o una demo aislada; nunca producción.**

## Cargar
```bash
cd backend
npm run db:migrate
npm run db:seed            # usa SEED_PASSWORD (mín. 10 caracteres) de backend/.env
```
El seed se niega a ejecutarse con `NODE_ENV=production` (salvo `ALLOW_DEMO_SEED=true`, solo para una demo pública y aislada).

## Cuentas
Correo `<rol>@DEMO_EMAIL_DOMAIN` (por defecto `demo.msenlinea.com`). La clave es el valor de `SEED_PASSWORD`: **no está escrita en el repositorio**; la define quien ejecuta el seed.

| Rol | Correo | Alcance |
|---|---|---|
| SUPERADMIN | superadmin@demo.msenlinea.com | Administración completa |
| ADMIN | admin@demo.msenlinea.com | Gestión operativa de MS |
| TECNICO | tecnico@demo.msenlinea.com | Órdenes asignadas y mantenimientos |
| CLIENTE | cliente@demo.msenlinea.com | Solo su empresa (Distribuidora Demo) |

El seed solo crea cuentas nuevas. Para restablecer la clave de cuentas existentes: `DEMO_RESET_PASSWORDS=true npm run db:seed`.

## Datos incluidos
Empresa → usuario cliente → equipo → solicitud → cotización aprobada → orden de servicio asignada al técnico (Distribuidora Demo), más tres empresas ficticias con cotizaciones BORRADOR, ENVIADA y APROBADA. Todo marcado «DEMO».

## Limpiar o restablecer
```bash
npm run db:demo:reset                 # vista previa: cuenta filas, NO borra
npm run db:demo:reset -- --confirmar  # borra
npm run db:demo:rebuild               # borra y recarga
```
Solo afecta a las 4 empresas demo (NIT + razón social deben coincidir), en una sola transacción. Conserva las cuentas de personal demo y no borra archivos de `uploads/`.

## Permisos
Se validan en el backend por ruta (`requirePerm`) y el aislamiento por empresa/técnico sale del token, no del cuerpo de la petición. Las pruebas `test/api.test.js` lo cubren con una base simulada; **recorra cada rol manualmente contra Oracle antes de presentar**.

---

## Datos demo ampliados (para varias pruebas de demostración)

`npm run db:seed` ahora carga, además de lo anterior (código en `backend/scripts/demo-data.js`, idempotente):

| Cuenta (`<usuario>@DEMO_EMAIL_DOMAIN` salvo clientes de empresa) | Qué se ve |
|---|---|
| `superadmin@` / `admin@` | Las 6 empresas demo, todas las solicitudes, cotizaciones, órdenes, mantenimientos, contratos y el dashboard con meses de historia |
| `tecnico@` y `tecnico2@` | Cada uno con órdenes en distintos estados (asignada, en ejecución, finalizada, cerrada) y mantenimientos propios |
| `cliente@` (Distribuidora Demo) | Cuenta principal de demostración: flujo completo — solicitud nueva urgente, cotización enviada, órdenes asignada / en ejecución / finalizada, mantenimientos próximos, vencidos y completados, contrato vigente |
| `cliente.norte@`, `cliente.andino@`, `cliente.bodega@`, `cliente.sabor@`, `cliente.salud@` (`@demo.invalid`) | Una empresa cada uno, con equipos en distintos estados y casos propios |

Cobertura de estados: solicitudes (NUEVA, EN_REVISION, COTIZADA, AUTORIZADA, EN_PROCESO, RESUELTA, CERRADA, CANCELADA), cotizaciones (BORRADOR, ENVIADA, APROBADA, RECHAZADA, VENCIDA, ANULADA), órdenes (ASIGNADA, EN_EJECUCION, FINALIZADA, CERRADA) con actividades y materiales, mantenimientos (PROGRAMADO, vencido, EN_EJECUCION, COMPLETADO), contratos (VIGENTE, VENCIDO), planes Básico y Premium, notificaciones por rol e historial de estados. Las fechas son relativas a la fecha de carga.

Las propuestas del Diseñador de espacios no se siembran (requieren una imagen real): créelas en vivo; el modo manual permite hacerlo sin IA.

Para recargar desde cero: `npm run db:demo:rebuild`. **Estado de verificación:** la sintaxis y el plan de borrado están probados con tests; la carga contra Oracle no pudo ejecutarse en el entorno de desarrollo, por lo que debe confirmarse en su base (si algún INSERT falla, el seed hace rollback completo y muestra el error).
