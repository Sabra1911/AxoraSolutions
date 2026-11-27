# Estado de verificación y pendientes

## Verificado (ejecutado en este entorno)
- **Backend: 46/46 pruebas pasan** después de los últimos cambios. Cubren: cálculo de cotizaciones, máquinas de estado, firma de archivos adjuntos,
  reglas de roles, autenticación (login, bloqueo a 5 intentos, rotación y detección de reutilización del refresh token, bcrypt),
  la capa HTTP real (401/403, aislamiento por empresa y técnico) y las rutas del diseñador (firma, consentimiento, separación por empresa, no generación falsa).
- **Frontend**: `npm run build` de producción compila sin errores. Se actualizó el marco adaptable con iconos Lucide, se mejoraron tablas/tarjetas/formularios y las listas remotas ahora muestran el error y permiten reintentar.
- **Gemini en navegador**: el problema original se debió al modelo retirado. Tras configurar el modelo compatible, el análisis funcionó con una imagen sintética; no se envió una fotografía personal.
- **Oracle local**: V003 y V004 aplicadas. Se verificaron los 19 servicios y precios del catálogo, tres empresas ficticias DEMO y tres cotizaciones (BORRADOR, ENVIADA y APROBADA); sus totales coinciden con sus líneas e impuestos.
- **Datos DEMO**: `npm run db:seed` se ejecutó repetidamente; mantiene los ejemplos sin duplicarlos.
- **Gemini análisis**: el proveedor informó que `gemini-2.5-flash` dejó de estar disponible para usuarios nuevos. Se configuró `gemini-3.5-flash-lite`, compatible con entrada de imagen y disponible para esta clave. Un análisis real con una imagen sintética de prueba produjo la estructura JSON esperada.
- **Cuentas locales**: se revisó estado, empresa, roles, permisos y presencia del hash sin leer ni mostrar hashes. Las cuentas demo activas aceptaron la clave de seed; no se probaron credenciales personales. Los conteos de permisos corresponden a los roles asignados.
- **Reinicio del servicio**: el backend se reinició con el build actualizado. `/api/health`, la página principal y el catálogo autenticado del diseñador respondieron HTTP 200; el catálogo devuelve 23 servicios y 6 opciones.

## No verificado todavía
- Análisis con una fotografía real de cliente. La prueba real de análisis usó una imagen sintética, no una foto personal.
- **Generación visual**: la prueba con imagen sintética respondió HTTP 429 (cuota/límite del proveedor). No se generó ni guardó una imagen. Revisar la cuota y facturación del modelo de imágenes en Google AI Studio antes de la demo.
- Despliegue público y conexión a una base de datos remota; consultar [DEMO_DEPLOYMENT.md](./DEMO_DEPLOYMENT.md).
- Generación real del PDF y envío SMTP.
- Revisión de dependencias en `npm audit --omit=dev` detectó avisos altos en Angular 19 (7 avisos reportados), Nodemailer 6 y Zod 3 (2 altos en backend). La corrección propuesta por npm requiere saltos de versión mayor; no se aplicó `npm audit fix --force` porque exige una migración y validación aparte. No publicar la app con estos hallazgos sin resolverlos o aceptar explícitamente el riesgo.

**Siguiente verificación recomendada:** planear y validar una actualización mayor de dependencias para resolver los avisos de `npm audit`; para Gemini, repetir análisis con una fotografía autorizada y revisar la cuota antes de probar generación visual. Consulte el [guion de demo para MIPYMES](./DEMO_MIPYME.md). No compartir la clave en el chat.

## Funcionalidades pendientes / parciales
- **Correo y WhatsApp**: hay avisos internos (campana) y tablas/plantillas preparadas. El correo solo se usa en la recuperación de contraseña
  (`MAIL_MODE=smtp` con nodemailer, sin probar). No hay despachador de notificaciones por correo/WhatsApp (`integrations/whatsapp.js` es un punto de extensión).
- **IA**: el asistente ofrece clasificación, diagnóstico y consultas limitadas por permisos. El Diseñador de espacios agrega carga privada, análisis visual, generación/versiones, comparación y vínculo real con solicitudes; `V003` y `V004` están aplicadas en la base local. El análisis fue validado con una imagen sintética; la generación visual sigue bloqueada por la cuota 429 de la clave. La fotografía y especificaciones se envían a Google solo con consentimiento, y la generación usa `store=false`.
- **Catálogo para adecuaciones**: V004 agrega los 19 precios proporcionados y la línea `ADECUACIONES`. Las opciones de PVC, paneles decorativos, cámaras, puntos eléctricos y red se relacionan con servicios catalogados cuando corresponde; confirmar alcance y precio final mediante cotización.
- **Conservación de imágenes**: las propuestas no vinculadas se pueden eliminar desde el diseñador; al convertir una propuesta en solicitud, las imágenes quedan como adjuntos de esa solicitud y no se pueden borrar desde el diseñador. No hay purga automática de adjuntos asociados; establecer plazo y proceso de conservación antes de producción.
- **Pagos**: la tabla `PAGOS` existe; no hay endpoints ni pantallas.
- **Cotizaciones vencidas**: se marcan VENCIDA al intentar responderlas; no hay tarea programada que las venza automáticamente. Tampoco hay tarea que marque contratos VENCIDO.
- **Reportes**: dashboard con filtros; no hay exportación a Excel/PDF.
- **Auditoría**: se registra en `AUDITORIA`; no hay pantalla de consulta (permiso `auditoria:read` reservado).
- **Permisos en token**: los permisos viajan en el JWT (15 min); un cambio de rol o la desactivación de un usuario surte efecto en la siguiente renovación (≤ 15 min), aunque la desactivación revoca de inmediato los refresh tokens.
- **Pruebas automáticas del frontend** no incluidas.
- Zona horaria: el servidor debe correr en `America/Bogota`.
- Antes de producción: HTTPS, copias de seguridad de la BD y de `UPLOAD_DIR`, antivirus para adjuntos si se requiere, rotación de `JWT_ACCESS_SECRET`.

---
## Actualización (rediseño AXORA, noviembre 2026)
**Verificado:** backend 58/58 (base simulada, sin Oracle); `ng build` compila; PDFs reales generados y revisados visualmente con datos sintéticos.
**No verificado:** consulta del PDF contra Oracle; seed y reset contra Oracle (solo sintaxis y orden de FK); login por rol en navegador; diagnóstico y edición de imágenes con Gemini/OpenAI reales; apariencia del rediseño en un navegador.
**Sin hacer:** rediseño del dashboard con gráficos, pulido de cada módulo (estados vacíos con mascota, pantalla de carga), página pública de inicio, envío de cotización por correo, vencimiento automático de cotizaciones.
**Seguridad:** el `.env` entregado en el archivo original contenía valores reales; rotar clave de Oracle, `JWT_ACCESS_SECRET` y `SEED_PASSWORD`. Siguen los avisos de `npm audit`.
