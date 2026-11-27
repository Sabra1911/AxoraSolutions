# Configuración de IA (Diseñador de espacios y asistente)

## Proveedor
`AI_PROVIDER=gemini` (por defecto) o `openai` en `backend/.env`. El frontend solo habla con la API propia; las claves nunca salen del backend. Los prompts (conservar perspectiva, puertas, ventanas, estructura; aplicar solo los servicios elegidos) están en `src/integrations/space-prompts.js` y los comparten todos los proveedores.

Para agregar otro proveedor: crear `src/integrations/<nombre>-space.js` con `{ assertConfigured, analyze, generateImage }` y registrarlo en `src/integrations/ai-provider.js`.

## Error «El modelo configurado no está disponible»
Google respondió 404 para el modelo. Un administrador puede consultar, con sesión iniciada:
`GET /api/ia/diagnostico-proveedor` (lista los modelos que admite *esa* clave y marca si los configurados aparecen) y
`GET /api/ia/diagnostico-proveedor?probar=1` (añade una llamada mínima de texto). No devuelve la clave ni genera imágenes.
Con el resultado, actualice `GEMINI_MODEL` / `GEMINI_IMAGE_MODEL`. El mensaje de error ahora nombra el modelo y el código HTTP; el texto crudo del proveedor solo se registra en el log del servidor.

## OpenAI (opcional, de pago por uso)
Requiere `OPENAI_API_KEY`, `OPENAI_MODEL` y `OPENAI_IMAGE_MODEL`; no se asume ningún nombre de modelo. La edición usa `/v1/images/edits` con la foto original. La edición de imágenes puede exigir verificación de la organización. Compare calidad y costo con Gemini antes de migrar.

## Estado de verificación
Probado con `fetch` simulado: selección de proveedor, armado de peticiones, traducción de errores, diagnóstico. **No** se probó contra Gemini ni OpenAI reales (no había clave ni red). Pendiente: diagnóstico real, análisis y edición con una fotografía autorizada. `docs/PENDIENTES.md` registraba que la generación visual respondió 429 (cuota) con la clave anterior.

## Privacidad
La foto y las especificaciones se envían al proveedor solo con consentimiento explícito del usuario.

---

## Modo manual (cuando la IA falla o no está configurada)

En el Diseñador de espacios, tras subir la foto y elegir servicios, puede escribir la descripción de la propuesta y los materiales y pulsar **«Guardar propuesta manual (sin IA)»**. No se llama a ningún proveedor, no se genera imagen y la propuesta se marca como «Manual». Desde ahí se puede generar la cotización (solo se adjunta la foto original). No requiere migraciones: reutiliza el estado `ANALIZADA` con `modo: MANUAL` en el análisis. Endpoint: `POST /api/ia/espacios/:id/manual` (permiso `solicitudes:create`).

---

## Asistente AXORA flotante
Botón con la mascota (abajo a la derecha, para cualquier usuario con sesión) que abre un chat conectado al backend (`POST /api/ia/chat`, mismos permisos y límites que la pantalla «Asistente IA»). Si la IA no está configurada o falla, muestra el error real y la plataforma sigue funcionando; no se simulan respuestas. Código: `frontend/src/app/shared/axora-assistant.ts`. La mascota también acompaña estados vacíos, la carga del análisis de fotos y la pantalla de nueva solicitud (`axora-hint.ts`).

---

## Imagen manual de un profesional (propuestas manuales)
Cuando el cliente guarda una **propuesta manual**, administración, superadministración y técnicos pueden subirle una imagen (boceto, render o foto marcada):
- Entrar a **Diseñador de espacios** (el técnico lo ve como «Propuestas de espacios», solo con propuestas manuales), abrir la propuesta y usar «Mostrar una imagen al cliente».
- Se guarda como versión «Manual (profesional)» (nunca se presenta como generada por IA), el cliente recibe una notificación y la ve en su propuesta con el comparador antes/después.
- Endpoint: `POST /api/ia/espacios/:id/imagen-profesional` (multipart `fotografia` + `descripcion`; JPG/PNG/WEBP, máx. 5 MB; permisos `solicitudes:manage` u `ordenes:execute`). El técnico solo puede leer y completar propuestas manuales; no crea, analiza, genera ni cotiza.
