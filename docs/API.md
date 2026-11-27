# API REST — `/api`
Autenticación: `Authorization: Bearer <accessToken>`. Errores: `{ "error": { "code", "message", "details?" } }`.
Listados: `?page=1&size=20&q=texto` + filtros por columna; respuesta `{ data, page, size, total }`.
El alcance por empresa/técnico se aplica en el servidor según el token; los parámetros `empresa_id`/`tecnico_id` del cliente no amplían el acceso.

| Módulo | Endpoints | Permiso |
|---|---|---|
| Auth | `POST /auth/login` · `/auth/refresh` (cookie) · `/auth/logout` · `GET /auth/me` · `POST /auth/cambiar-password` · `/auth/olvide-password` · `/auth/restablecer-password` | público / token |
| Usuarios | `GET/POST /usuarios` · `GET/PUT /usuarios/:id` · `PATCH /usuarios/:id/activo` · `PUT /usuarios/:id/password` | usuarios:read / write |
| Empresas | `GET/POST /empresas` · `GET/PUT /empresas/:id` · `PATCH /empresas/:id/activo` · idem `/empresas/sedes` y `/empresas/contactos` | empresas:read / write |
| Servicios | CRUD `/servicios` (+ `PATCH /:id/activo`) | servicios:read / write |
| Equipos | CRUD `/equipos` (+ activo) | equipos:read / write |
| Solicitudes | `GET/POST /solicitudes` · `GET/PUT /:id` · `PATCH /:id/estado` · `POST /:id/cancelar` · `POST /:id/asignar` | solicitudes:read, create, cancel, manage |
| Adjuntos | `GET/POST /adjuntos/:SOLICITUD\|ORDEN/:id` (multipart `archivos`, `?tipo=EVIDENCIA`) · `GET /adjuntos/:id/descargar` · `DELETE /adjuntos/:id` | según entidad dueña |
| Cotizaciones | `GET/POST /cotizaciones` · `GET/PUT /:id` · `GET /:id/pdf` · `POST /:id/enviar` · `/anular` · `/respuesta {aprobada,motivo}` | cotizaciones:read, write, respond |
| Órdenes | `GET/POST /ordenes` (desde solicitud AUTORIZADA) · `GET /:id` · `POST /:id/asignar` · `/iniciar` · `PUT /:id/diagnostico` · `POST /:id/detalle` · `DELETE /:id/detalle/:did` · `POST /:id/finalizar` · `/cerrar` · `/cancelar` | ordenes:read, manage, execute |
| Planes / Contratos | CRUD `/planes` (con `servicio_ids`) · CRUD `/contratos` | planes:*, contratos:* |
| Mantenimientos | `GET/POST /mantenimientos` · `GET/PUT /:id` · `POST /:id/iniciar` · `/completar {resultado}` · `/cancelar` | mantenimientos:read, manage, execute |
| Historial | `GET /historial?entidad=&entidad_id=&equipo_id=&empresa_id=&desde=&hasta=` | historial:read |
| Notificaciones | `GET /notificaciones` · `POST /:id/leer` · `POST /leer-todas` | autenticado (solo las propias) |
| Reportes | `GET /reportes/dashboard?desde=&hasta=&empresa_id=&estado=&servicio_id=` | reportes:read |
| IA | `GET /ia/estado` · `POST /ia/clasificar` (`solicitudes:create`) · `POST /ia/diagnostico` (`ordenes:execute`) · `POST /ia/chat` (solicitudes/cotizaciones/servicios:read) | token y permiso correspondiente |
| Diseñador de espacios | `GET /ia/espacios/catalogo` · `GET/POST /ia/espacios` · `GET /ia/espacios/:id` · `POST /:id/analizar` · `POST /:id/versiones` · `GET /:id/fotografia` · `GET /:id/versiones/:versionId/imagen` · `POST /:id/cotizacion` · `DELETE /:id` | `solicitudes:create`; alcance por empresa del token |

Roles → permisos: ver `database/migrations/V002__datos_base.sql`.

El asistente requiere `GEMINI_API_KEY` en `backend/.env`. Las solicitudes se envían a Google Gemini con contexto limitado al alcance del usuario autenticado; no se consultan columnas de nombres ni de contacto, aunque estos datos podrían aparecer en textos libres. Se ocultan correos y secuencias numéricas detectables; los usuarios deben evitar ingresar nombres, direcciones u otros datos personales.

`GET /ia/estado` devuelve `{ "configurada", "modelo", "modelo_imagen" }`; no expone la clave.

`POST /ia/clasificar` y `POST /ia/diagnostico` reciben `{ "categoria", "asunto", "descripcion", "equipo_tipo?" }`. `POST /ia/chat` recibe `{ "pregunta", "historial?": [{ "rol": "user|assistant", "texto" }] }`; el backend obtiene hasta ocho registros permitidos por cada tipo de dato y no acepta SQL ni identificadores arbitrarios del modelo.

### Diseñador de espacios
- `POST /ia/espacios` recibe `multipart/form-data` con una sola fotografía en `fotografia` (JPG, PNG o WEBP, máximo 5 MB). Personal MS también debe enviar `empresa_id`; para clientes el backend usa la empresa del token.
- `GET /ia/espacios` y `GET /ia/espacios/:id` devuelven únicamente propuestas accesibles para el usuario autenticado. Las imágenes se sirven mediante rutas autenticadas; no son archivos estáticos públicos.
- `POST /ia/espacios/:id/analizar` recibe `{ "confirmar_envio": true, "servicios": [{ "clave": "CIELO_PVC|PANELES_DECORATIVOS|CAMARAS_SEGURIDAD|INSTALACIONES_ELECTRICAS|REDES_CABLEADO|ADECUACIONES_TECNOLOGICAS|CATALOGO", "servicio_id?": 1, "especificaciones": "..." }], "observaciones": "..." }`. Es necesario seleccionar de uno a seis servicios. La respuesta se guarda como análisis, no como imagen generada.
- `POST /ia/espacios/:id/versiones` recibe `{ "confirmar_envio": true }`; crea una versión solamente si Gemini devuelve una imagen válida. Cada nueva versión conserva las especificaciones vigentes al momento de generarla.
- `POST /ia/espacios/:id/cotizacion` crea una solicitud `OTRO` dentro del módulo existente, agrega la fotografía original y la última imagen generada como adjuntos y vincula la solicitud a la propuesta. No calcula precios.
- `DELETE /ia/espacios/:id` elimina las imágenes y versiones de un borrador no vinculado. Si ya hay solicitud, la eliminación se bloquea para conservar sus adjuntos.

El análisis y la edición envían la imagen y las especificaciones a Google solo tras una autorización explícita. La generación usa `GEMINI_IMAGE_MODEL` (por defecto `gemini-nano-banana-2.1`), timeout `GEMINI_IMAGE_TIMEOUT_MS` y `store=false` en Interactions. Las claves permanecen en `backend/.env`; nunca se incluyen en Angular. Si Gemini no devuelve una imagen real, el endpoint devuelve error y no guarda una versión.
