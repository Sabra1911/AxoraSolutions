# Promociones y «Beneficio de primeros aliados AXORA»

## Qué hace
- El administrador crea promociones (menú **Promociones**): nombre, código, % o valor fijo, máximo de beneficiarios, usos por cliente, valor mínimo, vigencia, servicios aplicables (vacío = todos) y estado activo/inactivo.
- Solo pueden usarla las personas **autorizadas**: el administrador registra su correo (y, si quiere, genera un código individual `AXO-XXXXXXXXXX`).
- Propuesta inicial (migración V005): **AXORAALIADO**, 15 %, primeros 10 tutores, **inactiva** hasta que el administrador la confirme y la active. (La carga demo la activa y autoriza dos cuentas para poder mostrarla.)

## Cómo se aplica
En el detalle de una cotización (`POST /api/cotizaciones/:id/promocion {codigo}`):
- El **cliente** la aplica en cotizaciones `ENVIADA` de su empresa; el **personal** puede aplicarla en `BORRADOR`/`ENVIADA` y se valida contra el solicitante de la cotización.
- El backend comprueba, dentro de una transacción que bloquea la promoción: código válido, persona autorizada, promoción activa y vigente, usos disponibles, servicios aplicables, valor mínimo, que no haya ya otra promoción ni descuento manual, y recalcula subtotal/IVA/total. El front solo muestra el resultado.
- Un código inexistente y uno no autorizado devuelven el mismo mensaje (no se puede sondear códigos).
- Ciclo del uso: `RESERVADO` al aplicar → `APLICADO` si el cliente aprueba → `LIBERADO` si se rechaza, anula o vence (el cupo vuelve a estar disponible).
- La cotización (pantalla y PDF) muestra subtotal, descuento («Desc. promoción») e IVA/total. Mientras haya promoción no se pueden editar conceptos; el personal puede quitarla en borrador.

## Endpoints
| Ruta | Permiso |
|---|---|
| `GET/POST /api/promociones`, `GET/PUT /api/promociones/:id`, `POST/DELETE …/:id/beneficiarios` | `promociones:read` / `promociones:write` (ADMIN/SUPERADMIN) |
| `GET /api/promociones/mis-beneficios` | cliente autenticado |
| `GET /api/publico/promocion`, `GET /api/publico/servicios` | públicos; la promoción solo aparece si está activa y vigente, sin beneficiarios ni cupos; el catálogo no incluye precios |

## Verificado / no verificado
Probado con tests (BD simulada): cálculo, vigencia, autorización, un solo uso, servicios excluidos, aislamiento entre empresas, permisos y máximo de beneficiarios. **No se ejecutó contra Oracle**: valide `npm run db:migrate` (V005) y el flujo completo en su base.
