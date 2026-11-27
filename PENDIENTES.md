
## Pendiente tras la última iteración
- Seed ampliado, menú retráctil y modo manual: compilan y pasan tests (63), pero no se han probado contra Oracle ni en un navegador real: validar en su equipo.
- Botón «Probar IA» para administradores en la interfaz (hoy solo existe el endpoint de diagnóstico).

## Estado tras la entrega de planes, bonos, manual y registro
- Hecho y probado con BD simulada (88 pruebas) + compilación Angular: filtros y paginación de 10, planes/contratos demo, bonos, registro público, manual interactivo.
- **No verificado contra Oracle real ni en navegador**: `db:seed` ampliado, `bonos:cortesia`, `/api/auth/registro` y la interfaz nueva. Pruébelos en su máquina.
- Sin hacer: despliegue real (ver docs/PUBLICAR_EN_INTERNET.md), almacenamiento de fotos en la nube, recuperación de contraseña por correo real.
