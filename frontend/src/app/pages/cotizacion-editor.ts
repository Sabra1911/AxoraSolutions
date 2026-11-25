import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../core/api';
import { Ui } from '../core/ui';
import { errMsg, fmtMoney, toDateInput } from '../core/fmt';

@Component({
  selector: 'app-cotizacion-editor', standalone: true, imports: [FormsModule],
  template: `
    <form class="card" (ngSubmit)="save()" #f="ngForm">
      <h1>{{ id ? 'Editar cotización' : 'Nueva cotización' }}</h1>
      <div class="grid g2">
        <div class="field"><label class="req">Empresa</label>
          <select name="emp" [(ngModel)]="m.empresa_id" [disabled]="!!id || !!m.solicitud_id" required><option [ngValue]="null">— Seleccione —</option>@for (e of empresas(); track e.id) { <option [ngValue]="e.id">{{ e.razon_social }}</option> }</select></div>
        <div class="field"><label>Solicitud vinculada</label><input [value]="solCodigo() || 'Ninguna'" disabled></div>
        <div class="field"><label>Válida hasta</label><input type="date" name="val" [(ngModel)]="m.validez_hasta"></div>
        <div class="field"><label>IVA %</label><input type="number" name="iva" [(ngModel)]="m.iva_porcentaje" min="0" max="100"></div>
        <div class="field"><label>Descuento (COP)</label><input type="number" name="dto" [(ngModel)]="m.descuento" min="0"></div>
      </div>
      <h2 style="margin-top:8px">Conceptos</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Servicio</th><th>Descripción</th><th style="width:90px">Cant.</th><th style="width:140px">Precio unit.</th><th class="right" style="width:130px">Total</th><th></th></tr></thead>
        <tbody>
          @for (it of items; track $index; let i = $index) {
            <tr>
              <td><select [name]="'s' + i" [(ngModel)]="it.servicio_id" (ngModelChange)="pickService(it)"><option [ngValue]="null">Libre</option>@for (s of servicios(); track s.id) { <option [ngValue]="s.id">{{ s.nombre }}</option> }</select></td>
              <td><input [name]="'d' + i" [(ngModel)]="it.descripcion" required maxlength="300"></td>
              <td><input type="number" [name]="'c' + i" [(ngModel)]="it.cantidad" min="0.01" step="any" required></td>
              <td><input type="number" [name]="'p' + i" [(ngModel)]="it.precio_unitario" min="0" step="any" required></td>
              <td class="right">{{ money(line(it)) }}</td>
              <td><button type="button" class="link danger" (click)="items.splice(i, 1)" [disabled]="items.length === 1">✕</button></td>
            </tr>
          }
        </tbody>
      </table></div>
      <button type="button" style="margin-top:8px" (click)="add()">+ Agregar concepto</button>
      <div style="max-width:320px;margin-left:auto;margin-top:10px">
        <div class="row"><span>Subtotal</span><span class="spacer"></span>{{ money(subtotal()) }}</div>
        <div class="row"><span>Descuento</span><span class="spacer"></span>- {{ money(m.descuento || 0) }}</div>
        <div class="row"><span>IVA {{ m.iva_porcentaje }}%</span><span class="spacer"></span>{{ money(iva()) }}</div>
        <div class="row"><b>Total</b><span class="spacer"></span><b>{{ money(total()) }}</b></div>
        <p class="muted small">Los valores definitivos los calcula el servidor al guardar.</p>
      </div>
      <div class="field"><label>Notas</label><textarea name="notas" rows="2" [(ngModel)]="m.notas"></textarea></div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="row"><button class="primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Guardando…' : 'Guardar borrador' }}</button><button type="button" (click)="router.navigateByUrl('/cotizaciones')">Cancelar</button></div>
    </form>`,
})
export class CotizacionEditor implements OnInit {
  @Input() id?: string;
  api = inject(Api); ui = inject(Ui); router = inject(Router); route = inject(ActivatedRoute);
  m: any = { empresa_id: null, solicitud_id: null, validez_hasta: '', iva_porcentaje: 19, descuento: 0, notas: '' };
  items: any[] = [{ servicio_id: null, descripcion: '', cantidad: 1, precio_unitario: 0 }];
  empresas = signal<any[]>([]); servicios = signal<any[]>([]); solCodigo = signal(''); error = signal(''); busy = signal(false);
  money = fmtMoney;
  line = (i: any) => Math.round(Number(i.cantidad || 0) * Number(i.precio_unitario || 0) * 100) / 100;
  subtotal = () => this.items.reduce((a, i) => a + this.line(i), 0);
  iva = () => Math.round((this.subtotal() - Number(this.m.descuento || 0)) * Number(this.m.iva_porcentaje || 0)) / 100;
  total = () => this.subtotal() - Number(this.m.descuento || 0) + this.iva();
  add() { this.items.push({ servicio_id: null, descripcion: '', cantidad: 1, precio_unitario: 0 }); }

  async ngOnInit() {
    try {
      this.empresas.set((await this.api.get('/empresas', { size: 200, activo: 'true' })).data);
      this.servicios.set((await this.api.get('/servicios', { size: 200, activo: 'true' })).data);
      const sol = this.route.snapshot.queryParamMap.get('solicitud');
      if (sol && !this.id) {
        const s = await this.api.get(`/solicitudes/${sol}`);
        this.m.solicitud_id = s.id; this.m.empresa_id = s.empresa_id; this.solCodigo.set(s.codigo);
        if (s.servicio_id) { const sv = this.servicios().find((x) => x.id === s.servicio_id); if (sv) this.items = [{ servicio_id: sv.id, descripcion: sv.nombre, cantidad: 1, precio_unitario: Number(sv.precio_base) }]; }
      }
      if (this.id) {
        const c = await this.api.get(`/cotizaciones/${this.id}`);
        if (c.estado !== 'BORRADOR') { this.ui.err('Solo se editan cotizaciones en borrador'); this.router.navigateByUrl(`/cotizaciones/${this.id}`); return; }
        this.m = { empresa_id: c.empresa_id, solicitud_id: c.solicitud_id, validez_hasta: toDateInput(c.validez_hasta), iva_porcentaje: Number(c.iva_porcentaje), descuento: Number(c.descuento), notas: c.notas || '' };
        this.solCodigo.set(c.solicitud_codigo || '');
        this.items = c.items.map((i: any) => ({ servicio_id: i.servicio_id, descripcion: i.descripcion, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) }));
      }
    } catch (e) { this.ui.err(errMsg(e)); }
  }
  pickService(it: any) {
    const s = this.servicios().find((x) => x.id === it.servicio_id);
    if (s) { it.descripcion = s.nombre; it.precio_unitario = Number(s.precio_base); }
  }
  async save() {
    this.busy.set(true); this.error.set('');
    try {
      const body: any = {
        validez_hasta: this.m.validez_hasta || null, iva_porcentaje: Number(this.m.iva_porcentaje), descuento: Number(this.m.descuento || 0), notas: this.m.notas || null,
        items: this.items.map((i) => ({ servicio_id: i.servicio_id, descripcion: i.descripcion, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) })),
      };
      let c;
      if (this.id) c = await this.api.put(`/cotizaciones/${this.id}`, body);
      else c = await this.api.post('/cotizaciones', { ...body, empresa_id: this.m.empresa_id, solicitud_id: this.m.solicitud_id });
      this.ui.ok(`Cotización ${c.codigo} guardada`);
      this.router.navigateByUrl(`/cotizaciones/${c.id}`);
    } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}
