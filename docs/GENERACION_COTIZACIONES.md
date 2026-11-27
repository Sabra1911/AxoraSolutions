# Generación de cotizaciones PDF

`GET /api/cotizaciones/:id/pdf` (permiso `cotizaciones:read`; el cliente solo ve las de su empresa y nunca borradores). En la interfaz: botón **Descargar cotización PDF** en el detalle de la cotización.

## Piezas
- `backend/src/core/quote-pdf.js`: `buildQuotePdf({ quotation, client, issuer })`. Sin acceso a BD (se prueba sin Oracle). Usa `pdfkit`.
- `backend/src/modules/cotizaciones/module.js` → `service.pdf`: consulta cotización, líneas, empresa, contacto (quien creó la solicitud asociada) y unidad de cada servicio; arma el PDF completo en memoria y recién entonces responde.
- `backend/assets/axora-logo.png` y `axora-mascota.png`: marca oficial extraída del PDF de identidad.

## Contenido
Logo, número, estados con color, fechas de emisión y vencimiento, cliente (empresa, NIT, contacto, dirección, teléfono, correo), tabla (descripción, unidad, cantidad, precio, total), subtotal, descuento, IVA, total en COP, observaciones, condiciones, plazo y garantía, pie con numeración «Página X de Y». Marca de agua en BORRADOR, ANULADA, VENCIDA y RECHAZADA. Encabezado repetido en cada página; las filas saltan completas.

## Datos que no se inventan
El esquema no guarda NIT/teléfono del emisor ni condiciones. Se leen de `backend/.env` y **solo se imprime lo configurado**: `COMPANY_*`, `QUOTE_TERMS` (separadas por `|`), `QUOTE_EXECUTION_TIME`, `QUOTE_WARRANTY`. Si se necesitan por cotización, requiere una migración nueva.

## Verificación
`test/quote-pdf.test.js` genera PDFs reales (1 y 60 líneas, sin líneas) y comprueba `%PDF-`, total en COP, numeración, encabezado en cada página, total único y filas sin partir. Requiere `pdftotext` (poppler). **No** se probó la ruta HTTP contra Oracle ni el envío por correo (no existe despachador de correo de cotizaciones).
