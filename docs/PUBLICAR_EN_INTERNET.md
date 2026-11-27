# Publicar AXORA SOLUTIONS en internet (gratis)

> Estado honesto: este proyecto **no se ha desplegado** desde el entorno de desarrollo (no hay acceso a hosting ni a su cuenta). Los archivos `Dockerfile`, `render.yaml` y esta guía están preparados pero **sin probar en un servidor real**. Los límites gratuitos cambian: confírmelos en las páginas oficiales antes de empezar.

## Qué necesita
1. **Base de datos Oracle** (el proyecto usa `oracledb`; no funciona con MySQL/Postgres sin reescribir SQL).
2. **Un servidor Node** que ejecute el backend (este ya sirve el frontend compilado).
3. Su repositorio en GitHub (opcional, pero facilita el despliegue).

## Base de datos gratis compatible: Oracle Autonomous Database "Always Free"
Es la opción recomendada porque **es Oracle de verdad** (el SQL del proyecto corre igual).
- Según la documentación de Oracle: 1 OCPU, 8 GB RAM, **20 GB de almacenamiento**, hasta ~20–30 sesiones simultáneas, máximo 2 bases por cuenta. Si queda **detenida 3 meses seguidos** se reclama (borra).
- Requiere crear una cuenta en cloud.oracle.com/free (pide tarjeta para verificar identidad; no se cobra mientras use solo recursos "Always Free").

Pasos:
1. Cree la cuenta y elija una región cercana.
2. *Oracle Database → Autonomous Database → Create*: tipo **Transaction Processing**, marque **Always Free**, ponga contraseña de ADMIN.
3. En la base: *Database connection → Download wallet* (guarde la contraseña del wallet). Descomprímalo en una carpeta **fuera** del repositorio.
4. En *Database actions → SQL* cree el usuario de la app (`CREATE USER ms_enlinea IDENTIFIED BY "…"; GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE TRIGGER TO ms_enlinea; ALTER USER ms_enlinea QUOTA UNLIMITED ON DATA;`).
5. En `backend/.env` (nunca lo suba a GitHub):
   ```
   DB_USER=ms_enlinea
   DB_PASSWORD=su_clave
   DB_CONNECT_STRING=<alias>_low   # del archivo tnsnames.ora del wallet
   DB_CONFIG_DIR=/ruta/al/wallet
   DB_WALLET_LOCATION=/ruta/al/wallet
   DB_WALLET_PASSWORD=clave_del_wallet
   ```
6. Desde su máquina (con esas variables): `npm run db:migrate` y luego `npm run db:seed` solo si quiere datos demo (en producción requiere `ALLOW_DEMO_SEED=true`).

## Dónde correr el backend (elija una)
### A) Render (la más fácil, pero "duerme")
- Plan gratuito: se **apaga tras 15 min sin visitas** y tarda ~30–60 s en despertar; 750 horas/mes. No guarda archivos subidos de forma permanente.
- *New → Blueprint* sobre su repo (usa `render.yaml`), o *New → Web Service* con Docker.
- Variables de entorno en el panel (JWT_ACCESS_SECRET aleatorio de 32+ caracteres, DB_*, `CORS_ORIGINS=https://su-app.onrender.com`).
- El wallet súbalo como **Secret Files** (queda en `/etc/secrets`).
- Ventaja: URL con HTTPS lista. Desventaja: el primer ingreso tras inactividad es lento (avise a los jurados).

### B) Máquina virtual Oracle "Always Free" (siempre encendida)
- Oracle ofrece VMs gratuitas (AMD micro de 1 GB o Arm Ampere A1). Pueden **reclamarse si están inactivas** (uso de CPU bajo por 7 días).
- Instale Node 20, clone el repo, `npm ci` en backend y frontend, `npx ng build`, configure `.env`, ejecute con `pm2 start src/server.js`, y ponga **Caddy** o Nginx con HTTPS (Let's Encrypt) delante. Requiere abrir los puertos 80/443 en la VCN. Necesita un dominio (o usar uno gratuito tipo DuckDNS).
- Más trabajo, pero sin cold start.

## Antes de dar la URL a nadie
- `NODE_ENV=production` (cookies seguras) y HTTPS obligatorio.
- Cambie los secretos si alguna vez se compartieron; **rote** cualquier clave que haya aparecido en chats o ZIPs.
- Decida si deja abierto el registro (`REGISTRO_PUBLICO=true`) o lo cierra (`false`).
- Las fotos subidas se guardan en disco local: en Render gratuito se pierden al reiniciar. Para persistencia use almacenamiento en la nube (pendiente).
- Pruebe: ingreso, registro, solicitud, cotización con bono y PDF.

## Fuentes consultadas (verificar vigencia)
- Oracle: docs.oracle.com → «Always Free Autonomous AI Database» y «Always Free Resources».
- Render: render.com/free y docs sobre servicios gratuitos.
