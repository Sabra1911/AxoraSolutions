import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtDateTime, fmtMoney, label } from '../core/fmt';

@Component({
  selector: 'app-orden-detail', standalone: true, imports: [FormsModule, RouterLink],
  template: `
    @if (o(); as x) {
      <div class="card">
        <div class="row"><div><h1>Orden {{ x.codigo }}</h1><span class="muted">{{ x.empresa_nombre }} · {{ x.sede_nombre || 'Sin sede' }}@if (x.solicitud_codigo) { · <a [routerLink]="'/solicitudes/' + x.solicitud_id">{{ x.solicitud_codigo }}</a> }</span></div>
          <span class="spacer"></span><span class="badge" [class]="'badge b-' + x.prioridad">{{ x.prioridad }}</span><span class="badge" [class]="'badge b-' + x.estado">{{ lbl(x.estado) }}</span></div>
        <div class="row" style="margin-top:12px">
          @if (canExec() && x.estado === 'ASIGNADA') { <button class="primary" (click)="post('iniciar', 'Servicio iniciado')">▶ Iniciar servicio</button> }
          @if (canExec() && x.estado === 'EN_EJECUCION') { <button class="primary" (click)="finish()">✔ Finalizar servicio</button> }
          @if (manage() && x.estado === 'FINALIZADA') { <button class="primary" (click)="post('cerrar', 'Orden cerrada')">Cerrar orden</button> }
          @if (manage() && !['CERRADA','CANCELADA','FINALIZADA'].includes(x.estado)) { <button class="danger" (click)="cancel()">Cancelar orden</button> }
        </div>
      </div>
      <div class="tabs">@for (t of tabs; track t) { <button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button> }</div>

      @switch (tab()) {
        @case ('Resumen') {
          <div class="grid g2">
            <div class="card"><h2>Servicio</h2><dl class="kv">
              <dt>Trabajo</dt><dd style="white-space:pre-wrap">{{ x.descripcion_trabajo || '—' }}</dd><dt>Equipo</dt><dd>{{ x.equipo_nombre || '—' }}@if (x.equipo_marca) { ({{ x.equipo_marca }} {{ x.equipo_modelo }}) }</dd>
              <dt>Dirección</dt><dd>{{ x.sede_direccion || '—' }}</dd><dt>Programada</dt><dd>{{ d(x.fecha_programada) }}</dd><dt>Inicio</dt><dd>{{ dt(x.fecha_inicio) }}</dd><dt>Fin</dt><dd>{{ dt(x.fecha_fin) }}</dd><dt>Técnico</dt><dd>{{ x.tecnico_nombre || 'Sin asignar' }}</dd></dl></div>
            @if (manage() && ['PENDIENTE','ASIGNADA'].includes(x.estado)) {
              <div class="card"><h2>Asignación</h2><div class="field"><label>Técnico</label><select [(ngModel)]="tecnico"><option [ngValue]="null">— Seleccione —</option>@for (t of tecnicos(); track t.id) { <option [ngValue]="t.id">{{ t.nombre }}</option> }</select></div>
                <button class="primary" [disabled]="!tecnico" (click)="assign()">Asignar técnico</button></div>
            }
          </div>
        }
        @case ('Diagnóstico') {
          <div class="card"><h2>Diagnóstico y solución</h2>
            @if (canExec() && x.estado === 'EN_EJECUCION') {
              <div class="field"><label class="req">Diagnóstico</label><textarea rows="4" [(ngModel)]="diag.diagnostico"></textarea></div>
              <div class="field"><label>Solución aplicada</label><textarea rows="4" [(ngModel)]="diag.solucion"></textarea></div>
              <button class="primary" [disabled]="!diag.diagnostico.trim()" (click)="saveDiag()">Guardar diagnóstico</button>
            } @else { <h3>Diagnóstico</h3><p style="white-space:pre-wrap">{{ x.diagnostico || 'Aún no registrado' }}</p><h3>Solución</h3><p style="white-space:pre-wrap">{{ x.solucion || '—' }}</p> }
          </div>
        }
        @case ('Actividades') {
          <div class="card"><h2>Actividades y materiales</h2>
            <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Descripción</th><th class="right">Cant.</th>@if (!auth.isClient()) { <th class="right">Costo unit.</th> }<th>Registró</th><th></th></tr></thead><tbody>
              @for (i of x.detalle; track i.id) { <tr><td>{{ i.tipo }}</td><td>{{ i.descripcion }}</td><td class="right">{{ i.cantidad }}</td>@if (!auth.isClient()) { <td class="right">{{ money(i.costo_unitario) }}</td> }<td>{{ i.registrado_por_nombre }}</td>
                <td>@if (canExec() && x.estado === 'EN_EJECUCION') { <button class="link danger" (click)="removeItem(i)">Quitar</button> }</td></tr> } @empty { <tr><td colspan="6" class="muted">Sin registros</td></tr> }</tbody></table></div>
            @if (canExec() && x.estado === 'EN_EJECUCION') {
              <div class="row" style="margin-top:12px;align-items:flex-end">
                <div style="width:130px"><label>Tipo</label><select [(ngModel)]="item.tipo"><option value="ACTIVIDAD">Actividad</option><option value="MATERIAL">Material</option></select></div>
                <div style="flex:1;min-width:200px"><label>Descripción</label><input [(ngModel)]="item.descripcion" maxlength="500"></div>
                <div style="width:90px"><label>Cant.</label><input type="number" [(ngModel)]="item.cantidad" min="0.01" step="any"></div>
                <div style="width:130px"><label>Costo unit.</label><input type="number" [(ngModel)]="item.costo_unitario" min="0"></div>
                <button class="primary" [disabled]="!item.descripcion.trim()" (click)="addItem()">Agregar</button></div>
            }</div>
        }
        @case ('Evidencias') {
          <div class="card"><h2>Evidencias</h2>
            @for (a of x.adjuntos; track a.id) { <div class="row" style="padding:6px 0;border-top:1px solid var(--gray-100)">📷 <a href="#" (click)="openFile($event, a)">{{ a.nombre_original }}</a><span class="muted small">{{ dt(a.creado_en) }}</span><span class="spacer"></span>
              @if (canExec() && x.estado === 'EN_EJECUCION') { <button class="link danger" (click)="removeFile(a)">Eliminar</button> }</div> } @empty { <p class="muted">Sin evidencias</p> }
            @if (canExec() && x.estado === 'EN_EJECUCION') { <div class="row" style="margin-top:10px"><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" (change)="pick($event)" style="max-width:320px"><button class="primary" [disabled]="!files.length" (click)="upload()">Subir evidencias</button></div> }
          </div>
        }
        @case ('Historial') {
          <div class="card"><h2>Seguimiento</h2>@for (h of x.historial; track h.id) { <div style="padding:8px 0;border-top:1px solid var(--gray-100)"><b>{{ h.estado_anterior ? lbl(h.estado_anterior) + ' → ' : '' }}{{ lbl(h.estado_nuevo) }}</b>
            <div class="muted small">{{ dt(h.fecha) }} · {{ h.usuario_nombre || 'Sistema' }}</div>@if (h.comentario) { <div>{{ h.comentario }}</div> }</div> }</div>
        }
      }
    }`,
})
export class OrdenDetail implements OnInit {
  @Input() id!: string;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  o = signal<any>(null); tab = signal('Resumen'); tabs = ['Resumen', 'Diagnóstico', 'Actividades', 'Evidencias', 'Historial'];
  tecnicos = signal<any[]>([]); tecnico: number | null = null; files: File[] = [];
  diag = { diagnostico: '', solucion: '' }; item: any = { tipo: 'ACTIVIDAD', descripcion: '', cantidad: 1, costo_unitario: 0 };
  lbl = label; d = fmtDate; dt = fmtDateTime; money = fmtMoney;
  manage = () => this.auth.can('ordenes:manage');
  canExec = () => this.auth.can('ordenes:execute') && (this.auth.isStaff() || this.o()?.tecnico_id === this.auth.user()?.id);

  async ngOnInit() {
    await this.load();
    if (this.manage()) { try { this.tecnicos.set((await this.api.get('/usuarios', { rol: 'TECNICO', activo: 'true', size: 100 })).data); } catch { /* sin permiso */ } }
  }
  async load() {
    try { const x = await this.api.get(`/ordenes/${this.id}`); this.o.set(x); this.tecnico = x.tecnico_id; this.diag = { diagnostico: x.diagnostico || '', solucion: x.solucion || '' }; }
    catch (e) { this.ui.err(errMsg(e)); this.router.navigateByUrl('/ordenes'); }
  }
  private async run(fn: () => Promise<any>, ok: string) { try { await fn(); this.ui.ok(ok); await this.load(); } catch (e) { this.ui.err(errMsg(e)); } }
  post(path: string, ok: string) { return this.run(() => this.api.post(`/ordenes/${this.id}/${path}`), ok); }
  assign() { return this.run(() => this.api.post(`/ordenes/${this.id}/asignar`, { tecnico_id: this.tecnico }), 'Técnico asignado'); }
  saveDiag() { return this.run(() => this.api.put(`/ordenes/${this.id}/diagnostico`, { diagnostico: this.diag.diagnostico, solucion: this.diag.solucion || null }), 'Diagnóstico guardado'); }
  async addItem() { await this.run(() => this.api.post(`/ordenes/${this.id}/detalle`, { ...this.item, cantidad: Number(this.item.cantidad), costo_unitario: Number(this.item.costo_unitario) }), 'Registrado'); this.item = { tipo: this.item.tipo, descripcion: '', cantidad: 1, costo_unitario: 0 }; }
  removeItem(i: any) { return this.run(() => this.api.delete(`/ordenes/${this.id}/detalle/${i.id}`), 'Registro eliminado'); }
  async finish() { if (await this.ui.confirm('¿Finalizar el servicio? Requiere diagnóstico y al menos una actividad registrada.')) await this.post('finalizar', 'Servicio finalizado'); }
  async cancel() { const m = await this.ui.prompt('Cancelar orden', 'Motivo (opcional)', false); if (m === null) return; await this.run(() => this.api.post(`/ordenes/${this.id}/cancelar`, { motivo: m || null }), 'Orden cancelada'); }
  pick(ev: Event) { this.files = Array.from((ev.target as HTMLInputElement).files || []); }
  upload() { return this.run(async () => { await this.api.upload(`/adjuntos/ORDEN/${this.id}`, this.files, { tipo: 'EVIDENCIA' }); this.files = []; }, 'Evidencias cargadas'); }
  async openFile(ev: Event, a: any) { ev.preventDefault(); try { await this.api.download(`/adjuntos/${a.id}/descargar`, a.nombre_original, true); } catch (e) { this.ui.err(errMsg(e)); } }
  async removeFile(a: any) { if (!(await this.ui.confirm('¿Eliminar esta evidencia?'))) return; await this.run(() => this.api.delete(`/adjuntos/${a.id}`), 'Evidencia eliminada'); }
}
