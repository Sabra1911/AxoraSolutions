/**
 * Generador del PDF de cotización (AXORA SOLUTIONS).
 * Recibe datos ya consultados (cotización, cliente, emisor) y devuelve un PDFDocument listo para leer/pipe.
 * No toca la base de datos, así que se prueba sin Oracle; la consulta real vive en modules/cotizaciones/module.js.
 * Diseño: encabezado con logo en TODAS las páginas, tabla con encabezado repetido, filas que nunca se parten,
 * totales indivisibles y pie con numeración "Página X de Y".
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const LOGO = path.join(ASSETS, 'axora-logo.png');
const MASCOT = path.join(ASSETS, 'axora-mascota.png');

// Paleta de la identidad de marca (mantener sincronizada con frontend/src/styles.css)
const C = { deep: '#2a0f5c', purple: '#4b1394', teal: '#0aa9b8', tealText: '#067987', ink: '#1e1b2e', mute: '#716d86', line: '#e6e3ef', soft: '#f6f2fd', zebra: '#fbfaff' };
const PAGE = { w: 595.28, h: 841.89, mx: 40, top: 40, footer: 56 };
const CONTENT_W = PAGE.w - PAGE.mx * 2;
const BODY_TOP = PAGE.top + 78;
const BODY_BOTTOM = PAGE.h - PAGE.footer - 10;

const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const qty = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const pad = (n) => String(n).padStart(2, '0');
// Las columnas DATE de Oracle llegan como fecha local: se formatea con getters locales (sin corrimiento de zona)
const day = (d) => { if (!d) return null; const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`; };

const STATE_COLOR = { BORRADOR: '#64748b', ENVIADA: '#1d4ed8', APROBADA: '#15803d', RECHAZADA: '#b91c1c', VENCIDA: '#b45309', ANULADA: '#6b7280' };
const WATERMARK = new Set(['BORRADOR', 'ANULADA', 'VENCIDA', 'RECHAZADA']);

function drawHeader(doc, q, state) {
  const y = PAGE.top - 8;
  if (fs.existsSync(LOGO)) doc.image(LOGO, PAGE.mx, y, { height: 46 });
  const rx = PAGE.mx + CONTENT_W - 200;
  doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(20).text('COTIZACIÓN', rx, y + 2, { width: 200, align: 'right', lineBreak: false });
  doc.fillColor(C.purple).fontSize(12).text(q.codigo, rx, y + 26, { width: 200, align: 'right', lineBreak: false });
  const w = doc.font('Helvetica-Bold').fontSize(8).widthOfString(state) + 18;
  doc.roundedRect(PAGE.mx + CONTENT_W - w, y + 44, w, 15, 7.5).fill(STATE_COLOR[state] || C.mute);
  doc.fillColor('#fff').text(state, PAGE.mx + CONTENT_W - w, y + 48, { width: w, align: 'center', lineBreak: false });
  const g = doc.linearGradient(PAGE.mx, 0, PAGE.mx + CONTENT_W, 0).stop(0, C.purple).stop(1, C.teal);
  doc.rect(PAGE.mx, PAGE.top + 58, CONTENT_W, 3).fill(g);
}

function drawWatermark(doc, state) {
  if (!WATERMARK.has(state)) return;
  doc.save();
  doc.rotate(-35, { origin: [PAGE.w / 2, PAGE.h / 2] });
  doc.fillColor('#000').fillOpacity(0.05).font('Helvetica-Bold').fontSize(110).text(state, 0, PAGE.h / 2 - 55, { width: PAGE.w, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
}

/** Pie con numeración; se dibuja al final, cuando ya se conoce el total de páginas. */
function drawFooters(doc, issuer, q) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;      // evita que pdfkit cree una página nueva al escribir sobre el margen
    const y = PAGE.h - PAGE.footer + 8;
    doc.moveTo(PAGE.mx, y - 6).lineTo(PAGE.mx + CONTENT_W, y - 6).lineWidth(0.6).strokeColor(C.line).stroke();
    if (fs.existsSync(MASCOT)) doc.image(MASCOT, PAGE.mx, y - 1, { height: 26 });
    const contact = [issuer.legalName || issuer.brand, issuer.nit && `NIT ${issuer.nit}`, issuer.phone, issuer.email, issuer.web].filter(Boolean).join('  ·  ');
    doc.fillColor(C.mute).font('Helvetica').fontSize(7.5)
      .text(contact, PAGE.mx + 34, y + 2, { width: CONTENT_W - 190, lineBreak: false })
      .text(`${issuer.brand} · ${issuer.tagline}`, PAGE.mx + 34, y + 13, { width: CONTENT_W - 190, lineBreak: false });
    doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(8)
      .text(`${q.codigo}  ·  Página ${i - range.start + 1} de ${range.count}`, PAGE.mx + CONTENT_W - 150, y + 6, { width: 150, align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
}

function infoBox(doc, x, y, w, title, rows) {
  const lines = rows.filter(([, v]) => v);
  const h = 30 + lines.length * 13;
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(C.soft, C.line);
  doc.fillColor(C.purple).font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(), x + 12, y + 10, { width: w - 24, characterSpacing: 0.8, lineBreak: false });
  let cy = y + 24;
  for (const [k, v] of lines) {
    doc.fillColor(C.mute).font('Helvetica').fontSize(8).text(k, x + 12, cy, { width: 84, lineBreak: false });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5).text(String(v), x + 98, cy, { width: w - 110, height: 11, ellipsis: true });
    cy += 13;
  }
  return h;
}

/**
 * @param {object} p
 * @param {object} p.quotation  cotización con `items` (descripcion, cantidad, unidad, precio_unitario, total_linea)
 * @param {object} p.client     { razon_social, nit, direccion, ciudad, telefono, email, contacto }
 * @param {object} p.issuer     datos de env.company
 * @returns {PDFDocument} documento ya finalizado
 */
function buildQuotePdf({ quotation: q, client, issuer }) {
  const doc = new PDFDocument({
    size: 'A4', margins: { top: PAGE.top, bottom: PAGE.footer, left: PAGE.mx, right: PAGE.mx }, bufferPages: true,
    info: { Title: `Cotización ${q.codigo}`, Author: issuer.brand, Subject: `Cotización para ${client.razon_social}`, Creator: `${issuer.brand} · Plataforma de servicios` },
  });
  const state = q.estado;
  let pageNo = 0;
  const newPage = () => { if (pageNo > 0) doc.addPage(); pageNo += 1; drawHeader(doc, q, state); drawWatermark(doc, state); return BODY_TOP; };
  let y = newPage();

  const colW = (CONTENT_W - 14) / 2;
  const h1 = infoBox(doc, PAGE.mx, y, colW, 'Cliente', [
    ['Empresa', client.razon_social], ['NIT / Doc.', client.nit], ['Contacto', client.contacto],
    ['Dirección', [client.direccion, client.ciudad].filter(Boolean).join(', ')], ['Teléfono', client.telefono], ['Correo', client.email],
  ]);
  const h2 = infoBox(doc, PAGE.mx + colW + 14, y, colW, 'Datos de la cotización', [
    ['Número', q.codigo], ['Fecha de emisión', day(q.fecha_emision)], ['Válida hasta', day(q.validez_hasta) || 'No especificada'],
    ['Solicitud', q.solicitud_codigo], ['Plazo estimado', issuer.quoteExecutionTime], ['Garantía', issuer.quoteWarranty],
  ]);
  y += Math.max(h1, h2) + 18;

  const cols = [
    { t: '#', x: PAGE.mx + 8, w: 22, a: 'left' }, { t: 'DESCRIPCIÓN', x: PAGE.mx + 34, w: 222, a: 'left' },
    { t: 'UNIDAD', x: PAGE.mx + 262, w: 62, a: 'left' }, { t: 'CANT.', x: PAGE.mx + 326, w: 40, a: 'right' },
    { t: 'PRECIO UNIT.', x: PAGE.mx + 370, w: 70, a: 'right' }, { t: 'TOTAL', x: PAGE.mx + 444, w: 71, a: 'right' },
  ];
  const tableHeader = (yy) => {
    doc.roundedRect(PAGE.mx, yy, CONTENT_W, 22, 4).fill(C.deep);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
    for (const c of cols) doc.text(c.t, c.x, yy + 7, { width: c.w, align: c.a, lineBreak: false, characterSpacing: 0.4 });
    return yy + 22;
  };
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11).text('Detalle de servicios', PAGE.mx, y, { lineBreak: false });
  y = tableHeader(y + 18);

  (q.items || []).forEach((it, i) => {
    doc.font('Helvetica').fontSize(8.5);
    const rowH = Math.max(24, doc.heightOfString(it.descripcion || '', { width: cols[1].w }) + 14);
    if (y + rowH > BODY_BOTTOM) { y = tableHeader(newPage()); doc.font('Helvetica').fontSize(8.5); }   // la fila salta completa, nunca se parte
    if (i % 2 === 1) doc.rect(PAGE.mx, y, CONTENT_W, rowH).fill(C.zebra);
    doc.fillColor(C.mute).text(String(i + 1), cols[0].x, y + 7, { width: cols[0].w, lineBreak: false });
    doc.fillColor(C.ink).text(it.descripcion || '', cols[1].x, y + 7, { width: cols[1].w });
    doc.fillColor(C.mute).text(it.unidad || 'servicio', cols[2].x, y + 7, { width: cols[2].w, lineBreak: false, ellipsis: true });
    doc.fillColor(C.ink).text(qty(it.cantidad), cols[3].x, y + 7, { width: cols[3].w, align: 'right', lineBreak: false });
    doc.text(money(it.precio_unitario), cols[4].x, y + 7, { width: cols[4].w, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').text(money(it.total_linea), cols[5].x, y + 7, { width: cols[5].w, align: 'right', lineBreak: false });
    doc.moveTo(PAGE.mx, y + rowH).lineTo(PAGE.mx + CONTENT_W, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rowH;
  });
  if (!(q.items || []).length) { doc.fillColor(C.mute).font('Helvetica-Oblique').fontSize(9).text('Esta cotización no tiene líneas de servicio.', PAGE.mx + 8, y + 8); y += 30; }

  const rows = [['Subtotal', money(q.subtotal)]];
  if (Number(q.descuento) > 0) rows.push(['Descuento', `- ${money(q.descuento)}`]);
  rows.push([`IVA (${Number(q.iva_porcentaje)}%)`, money(q.iva_valor)]);
  if (y + 16 + rows.length * 17 + 44 > BODY_BOTTOM) y = newPage();
  y += 16;
  const tx = PAGE.mx + CONTENT_W - 230;
  for (const [k, v] of rows) {
    doc.fillColor(C.mute).font('Helvetica').fontSize(9).text(k, tx, y, { width: 100, lineBreak: false });
    doc.fillColor(C.ink).font('Helvetica-Bold').text(v, tx + 100, y, { width: 130, align: 'right', lineBreak: false });
    y += 17;
  }
  doc.roundedRect(tx, y + 4, 230, 32, 6).fill(doc.linearGradient(tx, 0, tx + 230, 0).stop(0, C.purple).stop(1, C.deep));
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text('TOTAL A PAGAR', tx + 12, y + 16, { width: 100, lineBreak: false });
  doc.fontSize(14).text(money(q.total), tx + 100, y + 13, { width: 118, align: 'right', lineBreak: false });
  doc.fillColor(C.mute).font('Helvetica').fontSize(7).text('Valores en pesos colombianos (COP).', PAGE.mx, y + 16, { width: 250, lineBreak: false });
  y += 52;

  const blocks = [];
  if (q.notas) blocks.push(['Observaciones', [q.notas]]);
  if (issuer.quoteTerms.length) blocks.push(['Condiciones comerciales', issuer.quoteTerms.map((t) => `•  ${t}`)]);
  for (const [title, lines] of blocks) {
    doc.font('Helvetica').fontSize(8.5);
    const bodyH = lines.reduce((s, l) => s + doc.heightOfString(l, { width: CONTENT_W - 28 }) + 3, 0);
    if (y + bodyH + 36 > BODY_BOTTOM) y = newPage();
    doc.roundedRect(PAGE.mx, y, CONTENT_W, bodyH + 30, 6).fillAndStroke('#fff', C.line);
    doc.rect(PAGE.mx, y + 6, 3, bodyH + 18).fill(C.teal);
    doc.fillColor(C.tealText).font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(), PAGE.mx + 14, y + 10, { lineBreak: false, characterSpacing: 0.8 });
    let ly = y + 24;
    doc.fillColor(C.ink).font('Helvetica').fontSize(8.5);
    for (const l of lines) { doc.text(l, PAGE.mx + 14, ly, { width: CONTENT_W - 28 }); ly += doc.heightOfString(l, { width: CONTENT_W - 28 }) + 3; }
    y += bodyH + 42;
  }
  if (q.motivo_rechazo && state === 'RECHAZADA') {
    if (y + 40 > BODY_BOTTOM) y = newPage();
    doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(8.5).text(`Motivo de rechazo: ${q.motivo_rechazo}`, PAGE.mx, y, { width: CONTENT_W });
  }
  drawFooters(doc, issuer, q);
  doc.end();
  return doc;
}

module.exports = { buildQuotePdf, money };
