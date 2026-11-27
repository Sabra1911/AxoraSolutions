# Correo, activación de cuentas y accesos

## Cómo ingresa una persona nueva
1. **Se registra sola** (página «Crear cuenta»): se crea su empresa y su usuario CLIENTE **sin verificar**. No inicia sesión. Recibe un correo con un enlace (válido 48 h).
2. **La crea un administrador** (menú Usuarios): si deja la contraseña vacía, la persona recibe una **invitación** y crea su propia contraseña al abrir el enlace. Si escribe una contraseña, igual debe activar el correo.
3. Sin activar, el ingreso responde «Debe activar su cuenta…» y se ofrece **Reenviar enlace de activación**. El administrador también tiene la acción **Reenviar invitación** en la fila del usuario.
4. Las cuentas que ya existían (y los usuarios demo) quedan marcadas como verificadas.

## Configurar el envío real de correo
Por defecto `MAIL_MODE=console`: el correo **no se envía**, solo se escribe en el log del servidor (el enlace de activación aparece ahí). Para enviarlo de verdad, en `backend/.env`:
```
MAIL_MODE=smtp
MAIL_FROM="AXORA SOLUTIONS <su-correo@su-dominio.com>"
SMTP_HOST=smtp.su-proveedor.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
APP_URL=https://su-direccion-publica   # el enlace del correo usa esta URL
```
Ejemplos de proveedores con plan gratuito para pruebas: Brevo, Mailjet o una cuenta Gmail con «contraseña de aplicación» (verifique límites vigentes). Esto **no se ha probado con un servidor SMTP real** desde este entorno.

## Perfiles (qué ve cada uno)
| Perfil | Qué puede hacer |
|---|---|
| SUPERADMIN / ADMIN | Todo: empresas, usuarios, catálogo, cotizar, planes, contratos, promociones, historial. (Solo SUPERADMIN gestiona administradores.) |
| TECNICO | Solo sus órdenes y mantenimientos asignados, propuestas de espacios y asistente. |
| CLIENTE | Solo lo de su empresa: solicitar o consultar, aprobar/rechazar/consultar cotizaciones, ver servicios, equipos, historial y beneficios. |
En la aplicación, pase el mouse por cada opción del menú para ver para qué sirve, y use **Manual de usuario → «¿Para qué sirve cada sección del menú?»**.

## Cuentas demo
Tras `npm run db:seed` hay clientes con 2 usuarios cada uno, p. ej. `cliente.espiga@demo.invalid` y `compras.espiga@demo.invalid` (clave = `SEED_PASSWORD`). Son solo para pruebas.
