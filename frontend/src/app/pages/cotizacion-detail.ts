import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtMoney } from '../core/fmt';

@Component({
  selector: 'app-cotizacion-detail', standalone: true, imports: [RouterLink],
  template: `
    @if (c(); as x) {
      <div class="card">
        <div class="row"><div><h1>Cotización {{ x.codigo }}</h1><span class="muted">{{ x.empresa_nombre }}@if (x.solicitud_codigo) { · Solicitud <a [routerLink]="'/solicitudes/' + x.solicitud_id">{{ x.solicitud_codigo }}</a> }</span></div>
          <span class="spacer"></span><span class="badge" [class]="'badge b-' + x.estado">{{ x.estado }}</span></div>
        <div class="row" style="margin-top:12px">
          <button class="primary" [disabled]="pdfBusy()" (click)="pdf()">{{ pdfBusy() ? 'Generando PDF…' : 'Descargar cotización PDF' }}</button>
          @if (auth.can('cotizaciones:write')) {
            @if (x.estado === 'BORRADOR') { <button (click)="router.navigateByUrl('/cotizaciones/' + x.id + '/editar')">Editar</button><button class="primary" (click)="act('enviar', 'Cotización enviada al cliente')">Enviar al cliente</button> }
            @if (['BORRADOR','ENVIADA'].includes(x.estado)) { <button class="danger" (click)="annul()">Anular</button> }
          }
          @if (auth.can('cotizaciones:respond') && x.estado === 'ENVIADA') {
            <span class="spacer"></span><button (click)="consult()" title="Haga una pregunta sin aprobar ni rechazar">Solo consultar</button><button class="danger" (click)="reject()">Rechazar</button><button class="primary" (click)="approve()">Aprobar cotización</button>
          }
        </div>
      </div>
      <div class="card">
        <dl class="kv"><dt>Emisión</dt><dd>{{ d(x.fecha_emision) }}</dd><dt>Válida hasta</dt><dd>{{ d(x.validez_hasta) }}</dd>
          @if (x.motivo_rechazo) { <dt>Motivo rechazo</dt><dd>{{ x.motivo_rechazo }}</dd> } @if (x.notas) { <dt>Notas</dt><dd>{{ x.notas }}</dd> }</dl>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Concepto</th><th class="right">Cant.</th><th class="right">Precio unit.</th><th class="right">Total</th></tr></thead><tbody>
          @for (i of x.items; track i.id) { <tr><td>{{ i.descripcion }}</td><td class="right">{{ i.cantidad }}</td><td class="right">{{ money(i.precio_unitario) }}</td><td class="right">{{ money(i.total_linea) }}</td></tr> }</tbody></table></div>
        <div style="max-width:300px;margin-left:auto;margin-top:12px">
          <div class="row"><span>Subtotal</span><span class="spacer"></span>{{ money(x.subtotal) }}</div>
          @if (+x.descuento > 0) { <div class="row"><span>Descuento@if (x.promocion_nombre) { · {{ x.promocion_nombre }} }</span><span class="spacer"></span>- {{ money(x.descuento) }}</div> }
          <div class="row"><span>IVA {{ +x.iva_porcentaje }}%</span><span class="spacer"></span>{{ money(x.iva_valor) }}</div>
          <div class="row"><b>Total</b><span class="spacer"></span><b>{{ money(x.total) }}</b></div></div>
      </div>
      @if (promoAvailable(x)) {
        <div class="card promo-box">
          <h2>Beneficio de primeros aliados AXORA</h2>
          <p class="muted small">@if (auth.isClient()) { Si fue autorizado como aliado, ingrese su código promocional. } @else { Se validará contra los beneficiarios autorizados del solicitante de esta cotización. }
            El descuento se calcula y valida en el servidor.</p>
          <form class="row" (submit)="$event.preventDefault(); applyPromo()">
            <input name="codigo" [value]="promoCode()" (input)="promoCode.set($any($event.target).value)" placeholder="Código promocional" maxlength="40" autocomplete="off" aria-label="Código promocional">
            <button class="primary" type="submit" [disabled]="promoBusy() || promoCode().trim().length < 4">{{ promoBusy() ? 'Validando…' : 'Aplicar código' }}</button>
          </form>
        </div>
      }
      @if (x.promocion_id && x.estado === 'BORRADOR' && auth.can('cotizaciones:write')) {
        <div class="card"><div class="row"><span>Promoción aplicada: <b>{{ x.promocion_nombre }}</b> ({{ x.promocion_codigo }})</span><span class="spacer"></span>
          <button class="danger" (click)="removePromo()">Quitar promoción</button></div></div>
      }
    }`,
})
export class CotizacionDetail implements OnInit {
  @Input() id!: string;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  c = signal<any>(null); pdfBusy = signal(false); promoCode = signal(''); promoBusy = signal(false); d = fmtDate; money = fmtMoney;
  async ngOnInit() { await this.load(); }
  async load() { try { this.c.set(await this.api.get(`/cotizaciones/${this.id}`)); } catch (e) { this.ui.err(errMsg(e)); this.router.navigateByUrl('/cotizaciones'); } }
  private async run(fn: () => Promise<any>, ok: string) { try { await fn(); this.ui.ok(ok); await this.load(); } catch (e) { this.ui.err(errMsg(e)); } }
  act(path: string, ok: string) { return this.run(() => this.api.post(`/cotizaciones/${this.id}/${path}`), ok); }
  async annul() { if (await this.ui.confirm('¿Anular esta cotización?')) await this.act('anular', 'Cotización anulada'); }
  async approve() { if (await this.ui.confirm('¿Aprobar esta cotización? Se autorizará el servicio.')) await this.run(() => this.api.post(`/cotizaciones/${this.id}/respuesta`, { aprobada: true }), 'Cotización aprobada'); }
  /** «Solo consultar»: envía una pregunta al equipo; la cotización sigue pendiente de su decisión. */
  async consult() { const m = await this.ui.prompt('Consultar esta cotización', 'Escriba su pregunta o comentario'); if (m && m.trim().length >= 3) await this.run(() => this.api.post(`/cotizaciones/${this.id}/consulta`, { mensaje: m.trim() }), 'Consulta enviada. Le responderemos pronto; la cotización sigue pendiente.'); }
  async reject() { const m = await this.ui.prompt('Rechazar cotización', 'Motivo del rechazo'); if (m) await this.run(() => this.api.post(`/cotizaciones/${this.id}/respuesta`, { aprobada: false, motivo: m }), 'Cotización rechazada'); }
  promoAvailable(x: any) {
    if (x.promocion_id || +x.descuento > 0) return false;
    if (this.auth.isClient()) return x.estado === 'ENVIADA' && this.auth.can('cotizaciones:respond');
    return this.auth.can('cotizaciones:write') && ['BORRADOR', 'ENVIADA'].includes(x.estado);
  }
  async applyPromo() {
    this.promoBusy.set(true);
    try { const r = await this.api.post(`/cotizaciones/${this.id}/promocion`, { codigo: this.promoCode().trim() }); this.ui.ok(`Descuento aplicado: ${fmtMoney(r.descuento)}`); this.promoCode.set(''); await this.load(); }
    catch (e) { this.ui.err(errMsg(e)); } finally { this.promoBusy.set(false); }
  }
  async removePromo() { if (await this.ui.confirm('¿Quitar la promoción de esta cotización?')) await this.run(() => this.api.delete(`/cotizaciones/${this.id}/promocion`), 'Promoción retirada'); }
  async pdf() { this.pdfBusy.set(true); try { await this.api.download(`/cotizaciones/${this.id}/pdf`, `${this.c().codigo}.pdf`); } catch (e) { this.ui.err(errMsg(e)); } finally { this.pdfBusy.set(false); } }
}
