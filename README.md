# AXORA SOLUTIONS · Tu aliado tecnológico

Plataforma web para MIPYMES de Cúcuta: panel de administración para MS y portal privado para clientes.
Monolito modular · **Angular 19** (frontend) · **Node.js + Express** (API REST) · **Oracle** (base de datos).

```
backend/    API REST (src/core = base compartida, src/modules/* = módulos de negocio)
frontend/   Aplicación Angular
database/   Migraciones SQL versionadas (V001, V002…)
docs/       Instalación detallada, API, modelo de datos, guía de código y resultados de pruebas
```

## Requisitos
- Node.js 20 o superior (probado con 22) y npm
- Oracle Database 19c o superior (XE sirve) — el driver `oracledb` usa modo *Thin*: no requiere Oracle Client
- Variable de zona horaria del servidor: `TZ=America/Bogota` (las columnas DATE se interpretan en hora local)
- La interfaz usa iconos de Lucide (`@lucide/angular`) y mantiene el backend y las pantallas existentes.

## Instalación paso a paso
1. **Crear el esquema en Oracle** (como SYSTEM/DBA, dentro del PDB, p. ej. `XEPDB1`):
   ```sql
   CREATE USER ms_enlinea IDENTIFIED BY "UNA_CLAVE_SEGURA" QUOTA UNLIMITED ON USERS;
   GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE TRIGGER TO ms_enlinea;
   ```
2. **Configurar el backend**
   ```bash
   cd backend
   cp .env.example .env        # edite DB_*, JWT_ACCESS_SECRET, CORS_ORIGINS, APP_URL, SEED_PASSWORD
   npm install
   npm run db:migrate          # crea tablas y datos de referencia (roles, permisos, servicios, plantillas)
   npm run db:seed             # OPCIONAL: usuarios, empresas DEMO y cotizaciones de ejemplo (clave = SEED_PASSWORD)
   ```
3. **Compilar el frontend**
   ```bash
   cd ../frontend
   npm install
   npx ng build                # genera frontend/dist/ms-en-linea/browser
   ```
4. **Ejecutar**
   ```bash
   cd ../backend
   NODE_ENV=production TZ=America/Bogota npm start
   ```
   Abra `http://localhost:3000`. En producción el backend sirve el frontend compilado desde el mismo origen
   (necesario para la cookie de renovación `SameSite=Strict`). Ponga un proxy HTTPS (Nginx/IIS) delante.

### Desarrollo
- Terminal 1: `cd backend && npm run dev` (puerto 3000)
- Terminal 2: `cd frontend && npx ng serve` (puerto 4200, ya incluye proxy `/api` → 3000)

### Documentación adicional
[Demo](./docs/CONFIGURACION_DEMO.md) · [IA](./docs/CONFIGURACION_IA.md) · [Cotizaciones PDF](./docs/GENERACION_COTIZACIONES.md) · [Guía de código](./docs/GUIA_DE_CODIGO.md)

### Usuarios de demostración (solo si ejecutó `db:seed`)
Cuentas `superadmin|admin|tecnico|cliente@demo.msenlinea.com` (dominio configurable con `DEMO_EMAIL_DOMAIN`); detalles en [CONFIGURACION_DEMO.md](./docs/CONFIGURACION_DEMO.md). Las direcciones antiguas `@msenlinea.local` / `@demo.local` ya no las crea el seed.

`superadmin@msenlinea.local`, `admin@msenlinea.local`, `tecnico@msenlinea.local`, `cliente@demo.local` — todos con la contraseña definida en `SEED_PASSWORD`.
El seed también puede crear clientes ficticios marcados DEMO. `SEED_PASSWORD` solo se usa al crear cuentas nuevas; volver a ejecutar el seed no restablece la contraseña de cuentas existentes.
**No ejecute `db:seed` en producción.** Cree las cuentas reales por un proceso administrativo y desactive las de demostración.

### Asistente de IA (opcional)
El asistente usa Google Gemini para clasificar solicitudes, proponer diagnósticos y responder preguntas sobre datos autorizados. Para habilitarlo, obtenga una clave de Gemini y configúrela únicamente en `backend/.env`:
```env
GEMINI_API_KEY=su_clave
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1
GEMINI_TIMEOUT_MS=60000
GEMINI_IMAGE_TIMEOUT_MS=120000
```
Reinicie el backend después de configurar la clave. La clave nunca se envía al navegador. Las preguntas y el contexto autorizado sí se envían a Google; se ocultan correos y secuencias numéricas detectables, pero evite incluir nombres, direcciones u otros datos personales. Las sugerencias requieren revisión humana.

### Diseñador de espacios con IA
El portal incluye el flujo de cliente en **Diseñador de espacios**: fotografía, selección de servicios/especificaciones, análisis visual, generación y versiones, comparador antes/después y solicitud de cotización. Las migraciones `V003` y `V004` agregan el diseñador y el catálogo actualizado; ejecute `npm run db:migrate` después de actualizar.

La fotografía permanece en `backend/uploads` y no se envía al proveedor al cargarla. Antes del análisis o de cada generación, el usuario debe autorizar explícitamente el envío a Google Gemini. La generación usa la Interactions API con `store=false`; la clave solo vive en el backend. Se requiere `GEMINI_API_KEY`; sin ella, se pueden guardar borradores, pero no se presenta un análisis ni una imagen como si fueran reales. La integración usa [`gemini-nano-banana-2.1`](https://ai.google.dev/gemini-api/docs/image-generation) por defecto.

Las opciones de panel/PVC, cámara, puntos eléctricos y redes se relacionan con servicios activos del catálogo cuando hay coincidencia. El catálogo incluye los 19 precios de referencia de la lista proporcionada en COP; las adecuaciones por metro requieren validar cantidades y materiales antes de cotizar. Las recomendaciones de IA se limitan a códigos y precios del catálogo, y no sustituyen una cotización aprobada por MS. Solicitar cotización crea una solicitud existente y adjunta la fotografía original y la última versión.

Para presentar un recorrido realista de una MIPYME, consulte [docs/DEMO_MIPYME.md](./docs/DEMO_MIPYME.md).

### Publicar una demo fuera del equipo
La app sigue usando Oracle y las fotografías se conservan en el almacenamiento persistente del servidor. Para una opción gratuita con estos requisitos, vea [docs/DEMO_DEPLOYMENT.md](./docs/DEMO_DEPLOYMENT.md): Oracle Autonomous Database Always Free y una VM Always Free, con wallet y HTTPS. La disponibilidad depende de región/cuota; la generación de imágenes puede tener costo. El seed crea empresas ficticias marcadas `DEMO`; no use esos registros como empresas reales ni lo ejecute sobre datos de producción.

## Pruebas
```bash
cd backend && npm test      # usa una base simulada; NO requiere Oracle
```
Ver `docs/PENDIENTES.md` para el estado exacto de verificación.

### Guía de código
Consulte [docs/GUIA_DE_CODIGO.md](./docs/GUIA_DE_CODIGO.md) para entender el flujo de inicio de sesión, permisos, módulos, base Oracle y pasos para extender la aplicación.

## Seguridad (resumen)
JWT de acceso de 15 min en memoria + refresh token rotativo (cookie httpOnly, hash SHA-256 en BD, detección de reutilización) ·
bcrypt (costo 12) · bloqueo tras 5 intentos fallidos · permisos verificados en el backend por ruta · aislamiento por empresa
derivado SIEMPRE de la identidad del token (nunca del cuerpo/consulta) · SQL 100 % con bind variables y columnas en lista blanca ·
adjuntos limitados por tipo, tamaño y firma de archivo, nombres aleatorios en disco · CORS por lista blanca · Helmet/CSP · limitación de tasa · auditoría de operaciones sensibles.

## Novedades de interfaz
- Menú lateral **retráctil** (botón al pie del menú; la preferencia se recuerda en el navegador).
- **Diseñador de espacios en modo manual** cuando la IA no responde.
- Datos demo ampliados con varios escenarios por rol: ver `docs/CONFIGURACION_DEMO.md`.
- **Landing pública** en `/` para visitantes; **Promociones** (admin) y **Beneficios** (cliente): `docs/PROMOCIONES.md`.
