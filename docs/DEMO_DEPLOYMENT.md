# Publicar una demo gratuita en Oracle Cloud

Esta ruta conserva Oracle, Node y Angular sin migrar la base de datos. Oracle anuncia recursos Always Free para Autonomous Database y Compute; la disponibilidad depende de la región y de la cuota de la cuenta. La verificación de cuenta puede pedir una tarjeta. Revise siempre el consumo y no cambie a recursos de pago.

Referencias oficiales: [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/), [crear usuarios de Autonomous Database](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/manage-users-create.html), [descargar un wallet](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/connect-download-wallet.html) y [node-oracledb](https://node-oracledb.readthedocs.io/en/v6.7.2/user_guide/connection_handling.html).

## 1. Preparar un repositorio solo para el proyecto

1. Cree un repositorio vacío en GitHub.
2. Desde una terminal, cambie a `Downloads\ms-en-linea-clau`.
3. Compruebe que Git tiene como raíz la carpeta del proyecto. Si `git rev-parse --show-toplevel` muestra una carpeta contenedora como `Downloads`, no haga `git add .` ni `git push` desde allí; inicialice un repositorio independiente en la carpeta `ms-en-linea-clau`:

   ```bash
   git init -b main
   git add .gitignore README.md backend frontend database docs
   git status --short
   ```

4. Revise que `backend/.env`, wallets, `node_modules`, `dist` y `uploads` no aparezcan en la lista. Luego agregue el remoto de su nuevo repositorio y publique el código.

## 2. Crear la base de datos Always Free

1. Cree una cuenta en Oracle Cloud y seleccione una región con recursos Always Free disponibles.
2. Cree una instancia **Autonomous Transaction Processing** (el nombre puede aparecer como Autonomous AI Database), marcando explícitamente **Always Free**.
3. Cree primero la instancia de Compute del siguiente paso. Cuando conozca su IP pública fija, limite el acceso de red de la base de datos a esa IP.
4. En Database Actions, cree el usuario `MS_ENLINEA`, asígnele cuota sobre el tablespace `DATA` y concédale los privilegios de tablas, secuencias, vistas, triggers y sesiones que requiere la aplicación.
5. Descargue el *instance wallet*. Guárdelo **fuera del repositorio**, junto con su contraseña, y copie el alias de conexión de `tnsnames.ora` (use el servicio de baja concurrencia, normalmente terminado en `_low`).

La aplicación almacena datos de negocio en Oracle. Las fotografías del diseñador se guardan en `UPLOAD_DIR` en el servidor; no se guardan como BLOB en la base de datos.

## 3. Crear el servidor de la aplicación

1. Cree una VM Ubuntu en Compute con una forma elegible Always Free. Si no hay capacidad en la región, pruebe otra región antes de seleccionar una forma de pago.
2. Reserve una IP pública y permita solo SSH desde su red y HTTP/HTTPS públicos en las reglas de red.
3. Instale Node.js 20 LTS, Git, Nginx y Certbot.
4. Clone el repositorio de GitHub dentro de la VM. Cree fuera del código las carpetas para el wallet y los archivos subidos:

   ```bash
   sudo mkdir -p /opt/ms-en-linea/wallet /var/lib/ms-en-linea/uploads
   sudo chmod 700 /opt/ms-en-linea/wallet /var/lib/ms-en-linea/uploads
   ```

5. Copie y extraiga el wallet en `/opt/ms-en-linea/wallet`. No lo suba a GitHub.

## 4. Configurar y preparar la aplicación

1. Configure las variables del backend en `/etc/ms-en-linea.env`, no en el repositorio:

   ```env
   NODE_ENV=production
   TZ=America/Bogota
   PORT=3000
   APP_URL=https://SU-DOMINIO
   CORS_ORIGINS=https://SU-DOMINIO
   DB_USER=MS_ENLINEA
   DB_PASSWORD=CLAVE_DEL_USUARIO_DE_BASE_DE_DATOS
   DB_CONNECT_STRING=ALIAS_COPIADO_DE_TNSNAMES
   DB_CONFIG_DIR=/opt/ms-en-linea/wallet
   DB_WALLET_LOCATION=/opt/ms-en-linea/wallet
   DB_WALLET_PASSWORD=CLAVE_DEL_WALLET
   DB_POOL_MIN=1
   DB_POOL_MAX=4
   UPLOAD_DIR=/var/lib/ms-en-linea/uploads
   JWT_ACCESS_SECRET=SECRETO_ALEATORIO_DE_48_BYTES
   GEMINI_API_KEY=
   ```

   Genere `JWT_ACCESS_SECRET` en el servidor con `node -p "require('crypto').randomBytes(48).toString('base64url')"`. Use contraseñas distintas para Oracle, el wallet y la aplicación. Restrinja el archivo: `sudo chmod 600 /etc/ms-en-linea.env`.

2. Desde la carpeta del proyecto, instale dependencias, compile el frontend y aplique migraciones:

   ```bash
   cd frontend && npm ci && npm run build
   cd ../backend && npm ci && npm run db:migrate
   ```

3. Para llenar **solo la base de demostración**, defina `SEED_PASSWORD` temporalmente en el entorno y ejecute `npm run db:seed`. El seed crea registros ficticios identificados como `DEMO`, usuarios de prueba y tres cotizaciones con estados diferentes. No lo ejecute en una base con datos reales.
4. Después del seed, entre con `superadmin@msenlinea.local`, cree su usuario administrador propio desde el módulo de usuarios y retire las credenciales demo antes de compartir el sitio. No publique contraseñas de demostración en una página abierta.

## 5. Arrancar con HTTPS

1. Apunte un dominio a la IP pública de la VM. Configure Nginx como proxy inverso hacia `http://127.0.0.1:3000` y emita el certificado con Certbot.
2. Ejecute `backend/src/server.js` como servicio `systemd`, cargando `/etc/ms-en-linea.env`. No exponga directamente el puerto 3000.
3. Verifique `https://SU-DOMINIO/api/health` y luego inicie sesión en `https://SU-DOMINIO/login`.
4. Configure HTTPS antes de compartir el enlace: las cookies de renovación son `Secure` en producción.

Mantenga copias de seguridad de Oracle y de `/var/lib/ms-en-linea/uploads`. El plan gratuito no equivale a una garantía de disponibilidad; una VM o una base suspendida deja la demo fuera de servicio.

## 6. Habilitar la IA

1. Cree una clave en [Google AI Studio](https://aistudio.google.com/apikey).
2. Agréguela como `GEMINI_API_KEY` **solo** en el entorno seguro del backend y reinicie el servicio.
3. Pruebe análisis y generación con una fotografía no sensible. El usuario debe autorizar cada envío.

La disponibilidad gratuita, los modelos habilitados y las cuotas de generación de imágenes pueden cambiar; revise [precios y límites de Gemini](https://ai.google.dev/gemini-api/docs/pricing) antes de la demostración. No se debe asumir que la generación de imágenes será gratuita.
