# Guía de código: MS En Línea

Esta guía explica dónde vive cada responsabilidad y cómo hacer cambios pequeños sin mezclar la interfaz, las reglas de negocio y el acceso a Oracle.

## 1. Mapa del proyecto

```text
frontend/src/app/
  app.routes.ts          rutas y permisos de pantalla
  core/                  API, sesión, guards, interceptor y mensajes
  layout/shell.ts        navegación y marco de la aplicación
  pages/                 pantallas de cada flujo
  shared/                CRUD reutilizable y configuración de catálogos
backend/src/
  server.js              conexión a Oracle e inicio del servidor
  app.js                 Express, middlewares y montaje de módulos
  middleware/            autenticación y permisos de API
  core/                  validación, SQL común, auditoría y errores
  modules/               funcionalidades agrupadas por dominio
  integrations/           Gemini, correo y otros proveedores
database/migrations/     cambios versionados del esquema y datos base
backend/test/            pruebas automatizadas de servicios y API
docs/                    guías, datos de demostración y verificación
```

La aplicación es un monolito modular: Angular es el cliente web, Express ofrece la API y Oracle persiste los datos. Mantenerlo en un solo despliegue no impide que cada área tenga límites claros.

## 2. Cómo inicia sesión una persona

1. La pantalla de acceso llama a `Auth.login()` en `frontend/src/app/core/auth.ts`.
2. Express recibe `POST /api/auth/login` en `backend/src/modules/auth/routes.js`.
3. `backend/src/modules/auth/service.js` verifica el hash con bcrypt, el estado de la cuenta y los intentos fallidos.
4. El servidor entrega un token de acceso y una cookie de renovación `httpOnly`. El frontend conserva el token de acceso solo en memoria; no lo guarda en `localStorage`.
5. El guard protege rutas del navegador y el middleware de Express vuelve a verificar identidad y permisos para cada API. La protección real siempre debe estar en el backend, no solo en botones o rutas de Angular.

Las contraseñas no se escriben en código ni se guardan en texto plano. `SEED_PASSWORD` sirve para crear usuarios de demostración que aún no existen; volver a ejecutar el seed no cambia la contraseña hash de un usuario existente.

## 3. Permisos y separación entre empresas

- Los roles y permisos provienen de las tablas de seguridad y se cargan al autenticar o renovar la sesión.
- `frontend/src/app/app.routes.ts` oculta o protege pantallas para mejorar la experiencia; no reemplaza la autorización de la API.
- Los módulos del backend aplican autenticación, permiso y validación de datos. Para datos de clientes, la empresa debe derivarse de la identidad validada, no confiarse a un `empresa_id` enviado por el navegador.
- Al agregar una operación, compruebe tanto quién puede ejecutarla como si el registro pertenece a la empresa autorizada.

## 4. Catálogos, tablas y formularios

`frontend/src/app/shared/crud-page.ts` implementa búsqueda, filtros, paginación, formularios, estados y acciones reutilizables. `frontend/src/app/shared/configs.ts` define las columnas, campos, permisos y rutas de cada catálogo.

Para ajustar un catálogo existente:

1. Revise primero su configuración en `shared/configs.ts`.
2. Confirme que el backend valida y devuelve los mismos nombres y formatos.
3. Si una lista de opciones depende de otra, use `dependsOn`; los fallos de carga deben quedar visibles y permitir reintentar.
4. Agregue lógica específica en una página propia solo cuando el CRUD común no represente el flujo.

La navegación y el marco compartidos están en `frontend/src/app/layout/shell.ts`. Los iconos de navegación usan Lucide para mantener el mismo estilo visual.

## 5. API y base de datos

- Cada dominio se organiza en `backend/src/modules/<dominio>` con rutas, servicio y repositorio según la funcionalidad.
- `backend/src/app.js` conecta los módulos con Express; `backend/src/server.js` abre el pool Oracle y escucha en el puerto configurado.
- Los repositorios usan `backend/src/config/db.js`. Mantenga las consultas parametrizadas y use `withTransaction()` cuando una operación modifica varias tablas que deben confirmarse juntas.
- Los cambios del esquema y datos de referencia van en una migración SQL nueva, con el siguiente número `V00N`; no edite una migración aplicada para corregir datos existentes.
- `backend/scripts/seed-demo.js` crea ejemplos ficticios. Ejecute `npm run db:seed` solo en una base de demostración.

## 6. Inteligencia artificial y fotografías

La integración está en `backend/src/integrations/gemini-space.js`; la lógica de negocio y el catálogo relacionado están en `backend/src/modules/ia/`. `GEMINI_API_KEY` debe existir únicamente en el entorno del backend y no en Angular, en el repositorio ni en capturas de pantalla.

La fotografía se envía al proveedor solo después de que la persona acepta el consentimiento del flujo. La API puede clasificar y analizar imágenes aunque la generación visual tenga una cuota distinta; un mensaje de error del proveedor no debe presentarse como una imagen generada. Revise las cuotas de Google antes de una demostración.

## 7. Desarrollo y verificación

Desde PowerShell, en la carpeta raíz del proyecto:

```powershell
Set-Location .\backend
npm test
npm run db:migrate
npm run db:seed

Set-Location ..\frontend
npm run build
```

`npm test` usa sustitutos de base de datos para sus pruebas automatizadas; no demuestra que la base Oracle local o remota esté disponible. Después de una migración, compruebe también el estado del servicio y los datos en una base de pruebas. Para Gemini, haga una prueba con una imagen sintética antes de usar una fotografía de una persona o empresa.

## 8. Al entregar un cambio

1. Mantenga validaciones y permisos en el backend.
2. Agregue pruebas para el comportamiento nuevo o corregido.
3. Ejecute las pruebas del backend y la compilación de Angular.
4. Revise los archivos cambiados y asegúrese de no incluir `.env`, wallets, contraseñas, tokens ni datos personales de clientes.
5. Documente límites reales: cuotas externas, funciones no implementadas y pruebas que no se pudieron realizar.

---
## Cambios de identidad AXORA y módulos nuevos
**Frontend**
- `src/styles.css`: tokens de diseño (`--brand-*`, `--accent-*`). Cambiar la paleta aquí actualiza toda la app; `--g-*` quedan como alias para las pantallas existentes.
- `src/app/layout/shell.ts`: menú lateral con logo, barra superior con mascota y avatar. Recursos en `public/brand/`.
- `src/app/core/api.ts` → `blob()`: en descargas, si el servidor responde un error JSON se lee el Blob para mostrar el mensaje real.
- `src/app/pages/cotizacion-detail.ts`: botón de PDF con estado de carga.

**Backend**
- `src/core/quote-pdf.js`: generador del PDF (ver `GENERACION_COTIZACIONES.md`).
- `src/config/env.js`: `company` (datos del emisor) y `ai.imageProvider/openai`.
- `src/integrations/ai-provider.js`: selector de proveedor; `gemini-space.js` y `openai-space.js` son adaptadores; `space-prompts.js` guarda los prompts; `ai-diagnostics.js` alimenta `GET /api/ia/diagnostico-proveedor`.
- `scripts/seed-demo.js` y `scripts/reset-demo.js`: datos demo (ver `CONFIGURACION_DEMO.md`).

**Autenticación y roles (sin cambios):** JWT de acceso de 15 min + refresh rotativo; `requirePerm(...)` en `middleware/auth.js` valida permisos en cada ruta; el aislamiento por empresa/técnico se deriva del token en `core/repository.js` (`scopeFor`).
