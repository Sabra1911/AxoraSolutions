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
            <span class="spacer"></span><button class="danger" (click)="reject()">Rechazar</button><button class="primary" (click)="approve()">Aprobar cotización</button>
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
          @if (+x.descuento > 0) { <div class="row"><span>Descuento</span><span class="spacer"></span>- {{ money(x.descuento) }}</div> }
          <div class="row"><span>IVA {{ +x.iva_porcentaje }}%</span><span class="spacer"></span>{{ money(x.iva_valor) }}</div>
          <div class="row"><b>Total</b><span class="spacer"></span><b>{{ money(x.total) }}</b></div></div>
      </div>
    }`,
})
export class CotizacionDetail implements OnInit {
  @Input() id!: string;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  c = signal<any>(null); pdfBusy = signal(false); d = fmtDate; money = fmtMoney;
  async ngOnInit() { await this.load(); }
  async load() { try { this.c.set(await this.api.get(`/cotizaciones/${this.id}`)); } catch (e) { this.ui.err(errMsg(e)); this.router.navigateByUrl('/cotizaciones'); } }
  private async run(fn: () => Promise<any>, ok: string) { try { await fn(); this.ui.ok(ok); await this.load(); } catch (e) { this.ui.err(errMsg(e)); } }
  act(path: string, ok: string) { return this.run(() => this.api.post(`/cotizaciones/${this.id}/${path}`), ok); }
  async annul() { if (await this.ui.confirm('¿Anular esta cotización?')) await this.act('anular', 'Cotización anulada'); }
  async approve() { if (await this.ui.confirm('¿Aprobar esta cotización? Se autorizará el servicio.')) await this.run(() => this.api.post(`/cotizaciones/${this.id}/respuesta`, { aprobada: true }), 'Cotización aprobada'); }
  async reject() { const m = await this.ui.prompt('Rechazar cotización', 'Motivo del rechazo'); if (m) await this.run(() => this.api.post(`/cotizaciones/${this.id}/respuesta`, { aprobada: false, motivo: m }), 'Cotización rechazada'); }
  async pdf() { this.pdfBusy.set(true); try { await this.api.download(`/cotizaciones/${this.id}/pdf`, `${this.c().codigo}.pdf`); } catch (e) { this.ui.err(errMsg(e)); } finally { this.pdfBusy.set(false); } }
}
