import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtMoney, toDateInput } from '../core/fmt';

const blank = () => ({
  nombre: '', codigo: '', descripcion: '', tipo_descuento: 'PORCENTAJE', valor_descuento: 15, max_beneficiarios: 10, usos_por_cliente: 1, valor_minimo: 0,
  fecha_inicio: toDateInput(new Date()), fecha_fin: toDateInput(new Date(Date.now() + 90 * 86400000)), servicio_ids: [] as number[],
});
export const discountText = (p: any) => (p.tipo_descuento === 'PORCENTAJE' ? `${+p.valor_descuento}%` : fmtMoney(p.valor_descuento));

/** Administración de promociones y autorización de beneficiarios (el backend valida cada operación y permiso). */
@Component({
  selector: 'app-promociones-page', standalone: true, imports: [FormsModule],
  template: `
    <div class="card">
      <div class="row"><div><h1>Promociones</h1><span class="muted">Beneficio de primeros aliados AXORA y otras promociones. Solo las personas autorizadas pueden usarlas.</span></div>
        <span class="spacer"></span><button class="primary" (click)="startNew()">Nueva promoción</button></div>
    </div>
    <div class="card">
      <div class="table-wrap"><table><thead><tr><th>Promoción</th><th>Código</th><th>Descuento</th><th>Vigencia</th><th class="right">Beneficiarios</th><th class="right">Usos</th><th>Estado</th><th></th></tr></thead><tbody>
        @for (p of list(); track p.id) {
          <tr><td>{{ p.nombre }}</td><td><code>{{ p.codigo }}</code></td><td>{{ disc(p) }}</td><td>{{ d(p.fecha_inicio) }} – {{ d(p.fecha_fin) }}</td>
            <td class="right">{{ p.beneficiarios }} / {{ p.max_beneficiarios }}</td><td class="right">{{ p.usos }}</td>
            <td><span class="badge" [class]="'badge b-' + (+p.activa ? 'ACTIVO' : 'INACTIVO')">{{ +p.activa ? 'Activa' : 'Inactiva' }}</span></td>
            <td class="right"><button (click)="open(p.id)">Gestionar</button></td></tr>
        } @empty { <tr><td colspan="8" class="muted">Aún no hay promociones.</td></tr> }
      </tbody></table></div>
    </div>

    @if (form(); as f) {
      <div class="card">
        <h2>{{ editId() ? 'Editar promoción' : 'Nueva promoción' }}</h2>
        <form (ngSubmit)="save()" #fm="ngForm">
          <div class="grid g2">
            <div class="field"><label>Nombre de la promoción</label><input name="nombre" [(ngModel)]="f.nombre" required maxlength="150"></div>
            <div class="field"><label>Código promocional</label><input name="codigo" [(ngModel)]="f.codigo" required maxlength="40" [disabled]="!!editId() && usosActuales() > 0" style="text-transform:uppercase"></div>
            <div class="field"><label>Tipo de descuento</label><select name="tipo" [(ngModel)]="f.tipo_descuento"><option value="PORCENTAJE">Porcentaje (%)</option><option value="VALOR">Valor fijo (COP)</option></select></div>
            <div class="field"><label>{{ f.tipo_descuento === 'PORCENTAJE' ? 'Porcentaje' : 'Valor del descuento' }}</label><input type="number" name="valor" [(ngModel)]="f.valor_descuento" min="0.01" [max]="f.tipo_descuento === 'PORCENTAJE' ? 100 : 1000000000" step="any" required></div>
            <div class="field"><label>Máximo de beneficiarios</label><input type="number" name="max" [(ngModel)]="f.max_beneficiarios" min="1" required></div>
            <div class="field"><label>Usos por cliente</label><input type="number" name="usos" [(ngModel)]="f.usos_por_cliente" min="1" required></div>
            <div class="field"><label>Valor mínimo de cotización (COP)</label><input type="number" name="min" [(ngModel)]="f.valor_minimo" min="0"></div>
            <div class="field"><label>Fecha de inicio</label><input type="date" name="ini" [(ngModel)]="f.fecha_inicio" required></div>
            <div class="field"><label>Fecha de vencimiento</label><input type="date" name="fin" [(ngModel)]="f.fecha_fin" required></div>
          </div>
          <div class="field"><label>Descripción</label><textarea name="desc" [(ngModel)]="f.descripcion" rows="2" maxlength="1000"></textarea></div>
          <div class="field"><label>Servicios aplicables <span class="muted small">(sin selección = todos)</span></label>
            <div class="chips">@for (s of servicios(); track s.id) { <label class="chip"><input type="checkbox" [checked]="f.servicio_ids.includes(s.id)" (change)="toggleSvc(s.id)"> {{ s.nombre }}</label> }</div></div>
          <div class="row"><button class="primary" type="submit" [disabled]="fm.invalid || busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button><button type="button" (click)="form.set(null)">Cancelar</button></div>
        </form>
      </div>
    }

    @if (sel(); as p) {
      <div class="card">
        <div class="row"><h2>{{ p.nombre }}</h2><span class="spacer"></span>
          <button (click)="edit(p)">Editar condiciones</button>
          <button [class.primary]="!+p.activa" [class.danger]="+p.activa" (click)="toggle(p)">{{ +p.activa ? 'Desactivar' : 'Activar promoción' }}</button></div>
        <p class="muted small">La promoción solo se aplica a beneficiarios autorizados, dentro de su vigencia y hasta el máximo de usos. El backend valida cada aplicación.</p>
        <h3>Beneficiarios autorizados ({{ p.beneficiarios.length }} / {{ p.max_beneficiarios }})</h3>
        <form class="row" (ngSubmit)="addBenef()" #bf="ngForm">
          <input type="email" name="email" [(ngModel)]="nb.email" placeholder="Correo del tutor" required maxlength="150" aria-label="Correo del beneficiario">
          <input name="nombre" [(ngModel)]="nb.nombre" placeholder="Nombre (opcional)" maxlength="150" aria-label="Nombre">
          <label class="chip"><input type="checkbox" name="gen" [(ngModel)]="nb.generar_codigo"> Generar código individual</label>
          <button class="primary" type="submit" [disabled]="bf.invalid || busy()">Autorizar</button>
        </form>
        @if (lastCode()) { <p class="note-ok">Código individual generado para <b>{{ lastCode()!.email }}</b>: <code>{{ lastCode()!.codigo_individual }}</code>. Compártalo solo con esa persona.</p> }
        <div class="table-wrap"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Código individual</th><th>Cuenta</th><th class="right">Usos</th><th></th></tr></thead><tbody>
          @for (b of p.beneficiarios; track b.id) {
            <tr><td>{{ b.email }}</td><td>{{ b.nombre || '—' }}</td><td>{{ b.codigo_individual || '—' }}</td><td>{{ b.usuario_id ? 'Registrada' : 'Sin cuenta aún' }}</td><td class="right">{{ b.usos }}</td>
              <td class="right"><button class="danger" [disabled]="+b.usos > 0" (click)="removeBenef(b)">Quitar</button></td></tr>
          } @empty { <tr><td colspan="6" class="muted">Todavía no hay beneficiarios autorizados.</td></tr> }
        </tbody></table></div>
      </div>
    }`,
  styles: [`
    .chips { display:flex; flex-wrap:wrap; gap:8px; } .chip { display:inline-flex; gap:6px; align-items:center; border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:13px; cursor:pointer; }
    .chip input { width:auto; margin:0; } .note-ok { background:var(--accent-100); border-radius:10px; padding:9px 12px; } code { background:var(--brand-50); padding:2px 6px; border-radius:6px; }
    form.row { flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px; } form.row input:not([type=checkbox]) { min-width:200px; }
  `],
})
export class PromocionesPage implements OnInit {
  api = inject(Api); ui = inject(Ui);
  list = signal<any[]>([]); sel = signal<any>(null); form = signal<any>(null); editId = signal<number | null>(null);
  servicios = signal<any[]>([]); busy = signal(false); lastCode = signal<any>(null);
  nb: any = { email: '', nombre: '', generar_codigo: false };
  d = fmtDate; disc = discountText;
  usosActuales = () => +(this.sel()?.usos ?? 0);
  async ngOnInit() {
    await this.load();
    try { const r = await this.api.get('/servicios', { activo: 1, limit: 200 }); this.servicios.set(r.data ?? r.items ?? r); } catch { /* el selector de servicios es opcional */ }
  }
  async load() { try { this.list.set(await this.api.get('/promociones')); } catch (e) { this.ui.err(errMsg(e)); } }
  async open(id: number) { try { this.sel.set(await this.api.get(`/promociones/${id}`)); this.lastCode.set(null); } catch (e) { this.ui.err(errMsg(e)); } }
  startNew() { this.editId.set(null); this.form.set(blank()); }
  edit(p: any) { this.editId.set(p.id); this.form.set({ ...p, fecha_inicio: toDateInput(p.fecha_inicio), fecha_fin: toDateInput(p.fecha_fin), valor_descuento: +p.valor_descuento, valor_minimo: +p.valor_minimo, servicio_ids: [...(p.servicio_ids || [])] }); }
  toggleSvc(id: number) { const f = this.form(); f.servicio_ids = f.servicio_ids.includes(id) ? f.servicio_ids.filter((x: number) => x !== id) : [...f.servicio_ids, id]; }
  async save() {
    const f = this.form(); this.busy.set(true);
    const body = { nombre: f.nombre, codigo: String(f.codigo).trim().toUpperCase(), descripcion: f.descripcion || null, tipo_descuento: f.tipo_descuento, valor_descuento: +f.valor_descuento,
      max_beneficiarios: +f.max_beneficiarios, usos_por_cliente: +f.usos_por_cliente, valor_minimo: +f.valor_minimo, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, servicio_ids: f.servicio_ids };
    try {
      const saved = this.editId() ? await this.api.put(`/promociones/${this.editId()}`, body) : await this.api.post('/promociones', body);
      this.ui.ok('Promoción guardada'); this.form.set(null); await this.load(); this.sel.set(saved);
    } catch (e) { this.ui.err(errMsg(e)); } finally { this.busy.set(false); }
  }
  async toggle(p: any) {
    const activar = !+p.activa;
    if (!await this.ui.confirm(activar ? `¿Activar «${p.nombre}»? Los beneficiarios autorizados podrán usarla.` : `¿Desactivar «${p.nombre}»?`)) return;
    try { this.sel.set(await this.api.put(`/promociones/${p.id}`, { activa: activar })); this.ui.ok(activar ? 'Promoción activada' : 'Promoción desactivada'); await this.load(); } catch (e) { this.ui.err(errMsg(e)); }
  }
  async addBenef() {
    this.busy.set(true);
    try {
      const r = await this.api.post(`/promociones/${this.sel().id}/beneficiarios`, { email: this.nb.email, nombre: this.nb.nombre || null, generar_codigo: !!this.nb.generar_codigo });
      this.lastCode.set(r.codigo_individual ? r : null); this.nb = { email: '', nombre: '', generar_codigo: false };
      this.ui.ok('Beneficiario autorizado'); await this.open(this.sel().id); await this.load();
    } catch (e) { this.ui.err(errMsg(e)); } finally { this.busy.set(false); }
  }
  async removeBenef(b: any) {
    if (!await this.ui.confirm(`¿Quitar a ${b.email} de los beneficiarios?`)) return;
    try { await this.api.delete(`/promociones/${this.sel().id}/beneficiarios/${b.id}`); this.ui.ok('Beneficiario retirado'); await this.open(this.sel().id); await this.load(); } catch (e) { this.ui.err(errMsg(e)); }
  }
}

/** Vista del cliente: sus beneficios autorizados y si ya los usó. No muestra datos de otras personas. */
@Component({
  selector: 'app-beneficios-page', standalone: true, imports: [RouterLink],
  template: `
    <div class="card"><h1>Beneficio de primeros aliados AXORA</h1>
      <p class="muted">Gracias por acompañar el crecimiento de AXORA SOLUTIONS. Como parte de nuestros primeros aliados, queremos ofrecerte un beneficio especial en tus primeros servicios.</p></div>
    @for (b of items(); track b.id) {
      <div class="card">
        <div class="row"><div><h2>{{ b.nombre }}</h2><span class="muted">{{ b.descripcion }}</span></div><span class="spacer"></span>
          <span class="badge" [class]="'badge b-' + (b.disponible ? 'ACTIVO' : 'INACTIVO')">{{ b.disponible ? 'Disponible' : (b.vigente ? 'Ya utilizado' : 'No vigente') }}</span></div>
        <dl class="kv"><dt>Descuento</dt><dd><b>{{ disc(b) }}</b></dd><dt>Código</dt><dd><code>{{ b.codigo_individual || b.codigo }}</code></dd>
          <dt>Vigencia</dt><dd>{{ d(b.fecha_inicio) }} – {{ d(b.fecha_fin) }}</dd><dt>Usos</dt><dd>{{ b.usos }} de {{ b.usos_por_cliente }}</dd>
          @if (+b.valor_minimo > 0) { <dt>Valor mínimo</dt><dd>{{ money(b.valor_minimo) }}</dd> }</dl>
        @if (b.disponible) { <p class="muted small">Cuando reciba una cotización, ingrese el código en su detalle para aplicar el descuento. <a routerLink="/cotizaciones">Ver mis cotizaciones</a></p> }
      </div>
    } @empty {
      <div class="card"><p>No tiene beneficios autorizados por ahora. Si usted es tutor aliado de AXORA, pida al administrador que autorice su correo.</p></div>
    }`,
  styles: [`code { background:var(--brand-50); padding:2px 6px; border-radius:6px; }`],
})
export class BeneficiosPage implements OnInit {
  api = inject(Api); ui = inject(Ui); items = signal<any[]>([]); d = fmtDate; money = fmtMoney; disc = discountText;
  async ngOnInit() { try { this.items.set(await this.api.get('/promociones/mis-beneficios')); } catch (e) { this.ui.err(errMsg(e)); } }
}
