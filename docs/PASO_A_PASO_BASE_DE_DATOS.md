# Paso a paso: base de datos y funcionamiento

> Estos pasos no se ejecutaron en el entorno donde se desarrolló (no hay Oracle allí). Si un comando falla, copie el mensaje de error y se corrige.

## Parte A. Base de datos en su computador (Oracle gratis)
Necesita **Docker Desktop** y **Node 20+**.

1. **Levantar Oracle** (imagen gratuita de la comunidad, tarda unos minutos la primera vez):
   ```
   docker run -d --name oracle-axora -p 1521:1521 -e ORACLE_PASSWORD=ClaveAdmin123 -v oracle-axora-data:/opt/oracle/oradata gvenzl/oracle-free:slim
   docker logs -f oracle-axora      # espere "DATABASE IS READY TO USE!" y salga con Ctrl+C
   ```
2. **Crear el usuario de la aplicación** (en una terminal):
   ```
   docker exec -it oracle-axora sqlplus sys/ClaveAdmin123@localhost/FREEPDB1 as sysdba
   ```
   y pegue:
   ```sql
   CREATE USER ms_enlinea IDENTIFIED BY "ClaveApp12345";
   GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE TRIGGER, CREATE PROCEDURE TO ms_enlinea;
   ALTER USER ms_enlinea QUOTA UNLIMITED ON USERS;
   EXIT;
   ```
3. **Configurar el backend**: en `backend/` copie `.env.example` a `.env` y ponga:
   ```
   DB_USER=ms_enlinea
   DB_PASSWORD=ClaveApp12345
   DB_CONNECT_STRING=localhost:1521/FREEPDB1
   JWT_ACCESS_SECRET=<una frase aleatoria de 32+ caracteres>
   APP_URL=http://localhost:3000
   SEED_PASSWORD=<la clave que tendrán las cuentas demo, mín. 10 caracteres>
   ```
   (`.env` nunca se sube a GitHub ni se comparte.)
4. **Instalar y crear las tablas**:
   ```
   cd backend
   npm install
   npm run db:migrate      # aplica V001 … V006
   ```
5. **Cargar datos de demostración** (clientes, planes, contratos, usuarios):
   ```
   npm run db:seed
   ```
6. **Generar los 4 bonos de cortesía**: `npm run bonos:cortesia` (guarde los códigos AXO-…).
7. **Compilar el frontend y arrancar todo**:
   ```
   cd ../frontend && npm install && npx ng build
   cd ../backend && npm start
   ```
   Abra **http://localhost:3000**. Si queda un proceso viejo en el puerto 3000, ciérrelo primero.
8. Para rehacer los datos demo: `npm run db:demo:rebuild`.

## Parte B. Recorrido para comprobar que todo funciona
Cuentas demo (clave = `SEED_PASSWORD`): `superadmin@demo.msenlinea.com`, `admin@…`, `tecnico@…`, `cliente@…` y, por empresa, `cliente.espiga@demo.invalid` / `compras.espiga@demo.invalid`.

| # | Haga esto | Debe ocurrir |
|---|---|---|
| 1 | Ingrese como **admin** → Contratos | Lista con más de 10 contratos, paginada de 10 en 10; use filtros, orden por columna y «Limpiar filtros» |
| 2 | Admin → Planes | 6 planes con servicios y precios |
| 3 | Admin → Usuarios → Nuevo, **sin contraseña** | Aparece «Pendiente de activar»; el enlace de activación sale en la consola del backend (modo `console`) |
| 4 | Abra ese enlace → cree contraseña → ingrese | Entra con su rol; antes de activar, el ingreso lo rechaza |
| 5 | **Crear cuenta** (página pública) | Pantalla «Revise su correo»; no entra hasta activar |
| 6 | Cliente → Nueva solicitud → «Solo consultar» | Se crea sin cotización; el admin la ve y pulsa «Responder consulta» |
| 7 | Cliente → Nueva solicitud de servicio → admin crea y envía cotización | El cliente ve Aprobar / Rechazar / **Solo consultar** |
| 8 | Cliente → Beneficios → código `AXO-…` → aplicarlo en la cotización | Descuento del mantenimiento preventivo |
| 9 | Aprobar → admin genera orden → técnico la ejecuta | Historial registra cada paso |
| 10 | **Manual de usuario** y tooltips del menú | Explican cada sección según el perfil |
| 11 | Abra la app desde el **celular** (misma red: `http://IP-de-su-PC:3000`) | Tablas como tarjetas, formularios a pantalla completa |

## Parte C. Base de datos gratis en internet
Ver `docs/PUBLICAR_EN_INTERNET.md` (Oracle Autonomous Database Always Free + servidor Node). Los pasos 3–6 de la Parte A son los mismos, cambiando `DB_CONNECT_STRING` y agregando el wallet.
