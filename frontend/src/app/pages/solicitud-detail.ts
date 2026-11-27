import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtDateTime, fmtMoney, label } from '../core/fmt';
import { ESTADOS_SOL, PRIORIDADES } from '../shared/configs';

@Component({
  selector: 'app-solicitud-detail', standalone: true, imports: [FormsModule, RouterLink],
  template: `
    @if (s(); as x) {
      <div class="card">
        <div class="row"><div><h1>{{ x.codigo }} · {{ x.asunto }}</h1><span class="muted">{{ x.empresa_nombre }}</span></div><span class="spacer"></span>
          <span class="badge" [class]="'badge b-' + x.prioridad">{{ x.prioridad }}</span><span class="badge" [class]="'badge b-' + x.estado">{{ lbl(x.estado) }}</span></div>
        <div class="row" style="margin-top:12px">
          @if (auth.can('solicitudes:cancel') && ['NUEVA','EN_REVISION'].includes(x.estado)) { <button class="danger" (click)="cancel()">Cancelar solicitud</button> }
          @if (staff() && x.estado !== 'CERRADA' && x.estado !== 'CANCELADA') {
            <button (click)="router.navigateByUrl('/cotizaciones/nueva?solicitud=' + x.id)">Crear cotización</button>
          }
          @if (x.tipo === 'CONSULTA') { <span class="badge">Solo consulta</span> }
          @if (staff() && x.tipo === 'CONSULTA' && ['NUEVA','EN_REVISION'].includes(x.estado)) { <button class="primary" (click)="answerConsulta()">Responder consulta</button> }
          @if (staff() && x.estado === 'AUTORIZADA') { <button class="primary" (click)="makeOrder()">Generar orden de servicio</button> }
        </div>
      </div>
      <div class="tabs">@for (t of tabs; track t) { <button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button> }</div>

      @switch (tab()) {
        @case ('Resumen') {
          <div class="grid g2">
            <div class="card"><h2>Detalle</h2><dl class="kv">
              <dt>Categoría</dt><dd>{{ lbl(x.categoria) }}</dd><dt>Servicio</dt><dd>{{ x.servicio_nombre || '—' }}</dd><dt>Sede</dt><dd>{{ x.sede_nombre || '—' }}</dd>
              <dt>Equipo</dt><dd>{{ x.equipo_nombre || '—' }}</dd><dt>Creada</dt><dd>{{ dt(x.creado_en) }}</dd><dt>Programada</dt><dd>{{ d(x.fecha_programada) }}</dd><dt>Técnico</dt><dd>{{ x.tecnico_nombre || 'Sin asignar' }}</dd></dl>
              <h3 style="margin-top:12px">Descripción</h3><p style="white-space:pre-wrap">{{ x.descripcion }}</p>
              @if (x.observaciones) { <h3>Observaciones</h3><p style="white-space:pre-wrap">{{ x.observaciones }}</p> }</div>
            @if (staff()) {
              <div class="card"><h2>Gestión</h2>
                <div class="field"><label>Asignar técnico</label><div class="row"><select [(ngModel)]="tecnico" style="flex:1"><option [ngValue]="null">— Seleccione —</option>@for (t of tecnicos(); track t.id) { <option [ngValue]="t.id">{{ t.nombre }}</option> }</select>
                  <button (click)="assign()" [disabled]="!tecnico">Asignar</button></div></div>
                <div class="field"><label>Cambiar estado</label><div class="row"><select [(ngModel)]="nuevoEstado" style="flex:1"><option [ngValue]="''">— Seleccione —</option>@for (e of estados; track e.value) { <option [ngValue]="e.value">{{ e.label }}</option> }</select>
                  <button (click)="changeState()" [disabled]="!nuevoEstado">Aplicar</button></div></div>
                <div class="field"><label>Prioridad</label><select [(ngModel)]="edit.prioridad" (ngModelChange)="saveEdit()">@for (p of pris; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }</select></div>
                <div class="field"><label>Fecha programada</label><input type="date" [(ngModel)]="edit.fecha_programada" (change)="saveEdit()"></div>
                <div class="field"><label>Observaciones internas</label><textarea rows="3" [(ngModel)]="edit.observaciones"></textarea><button style="margin-top:6px" (click)="saveEdit()">Guardar observaciones</button></div>
              </div>
            }
          </div>
        }
        @case ('Archivos') {
          <div class="card"><h2>Adjuntos</h2>
            @for (a of x.adjuntos; track a.id) { <div class="row" style="padding:6px 0;border-top:1px solid var(--gray-100)">📎 <a href="#" (click)="open($event, a)">{{ a.nombre_original }}</a><span class="muted small">{{ (a.tamano / 1024).toFixed(0) }} KB · {{ dt(a.creado_en) }}</span><span class="spacer"></span>
              <button class="link danger" (click)="removeFile(a)">Eliminar</button></div> } @empty { <p class="muted">Sin adjuntos</p> }
            @if (!['CERRADA','CANCELADA'].includes(x.estado) && (auth.isClient() || staff())) {
              <div class="row" style="margin-top:10px"><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" (change)="pick($event)" style="max-width:320px"><button class="primary" [disabled]="!files.length" (click)="upload()">Subir</button></div>
            }</div>
        }
        @case ('Historial') {
          <div class="card"><h2>Seguimiento</h2>
            @for (h of x.historial; track h.id) { <div style="padding:8px 0;border-top:1px solid var(--gray-100)"><b>{{ h.estado_anterior ? lbl(h.estado_anterior) + ' → ' : '' }}{{ lbl(h.estado_nuevo) }}</b>
              <div class="muted small">{{ dt(h.fecha) }} · {{ h.usuario_nombre || 'Sistema' }}</div>@if (h.comentario) { <div>{{ h.comentario }}</div> }</div> }</div>
        }
        @case ('Relacionados') {
          <div class="grid g2">
            @if (x.cotizaciones) { <div class="card"><h2>Cotizaciones</h2>@for (c of x.cotizaciones; track c.id) { <div class="row" style="padding:6px 0"><a [routerLink]="'/cotizaciones/' + c.id">{{ c.codigo }}</a><span class="badge" [class]="'badge b-' + c.estado">{{ c.estado }}</span><span class="spacer"></span>{{ money(c.total) }}</div> } @empty { <p class="muted">Sin cotizaciones</p> }</div> }
            <div class="card"><h2>Órdenes de servicio</h2>@for (o of x.ordenes; track o.id) { <div class="row" style="padding:6px 0"><a [routerLink]="'/ordenes/' + o.id">{{ o.codigo }}</a><span class="badge" [class]="'badge b-' + o.estado">{{ lbl(o.estado) }}</span></div> } @empty { <p class="muted">Sin órdenes</p> }</div>
          </div>
        }
      }
    }`,
})
export class SolicitudDetail implements OnInit {
  @Input() id!: string;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  s = signal<any>(null); tab = signal('Resumen'); tabs = ['Resumen', 'Archivos', 'Historial', 'Relacionados'];
  tecnicos = signal<any[]>([]); tecnico: number | null = null; nuevoEstado = ''; edit: any = {}; files: File[] = [];
  estados = ESTADOS_SOL; pris = PRIORIDADES; lbl = label; d = fmtDate; dt = fmtDateTime; money = fmtMoney;
  staff = () => this.auth.can('solicitudes:manage');

  async ngOnInit() {
    await this.load();
    if (this.staff()) { try { this.tecnicos.set((await this.api.get('/usuarios', { rol: 'TECNICO', activo: 'true', size: 100 })).data); } catch { /* sin permiso */ } }
  }
  async load() {
    try {
      const x = await this.api.get(`/solicitudes/${this.id}`);
      this.s.set(x); this.tecnico = x.tecnico_id; this.edit = { prioridad: x.prioridad, observaciones: x.observaciones || '', fecha_programada: x.fecha_programada ? new Date(x.fecha_programada).toISOString().slice(0, 10) : '' };
    } catch (e) { this.ui.err(errMsg(e)); this.router.navigateByUrl('/solicitudes'); }
  }
  private async run(fn: () => Promise<any>, ok: string) { try { await fn(); this.ui.ok(ok); await this.load(); } catch (e) { this.ui.err(errMsg(e)); } }
  assign() { return this.run(() => this.api.post(`/solicitudes/${this.id}/asignar`, { tecnico_id: this.tecnico }), 'Técnico asignado'); }
  async answerConsulta() {
    const c = await this.ui.prompt('Responder consulta', 'Respuesta para el cliente');
    if (c) await this.run(() => this.api.patch(`/solicitudes/${this.id}/estado`, { estado: 'RESUELTA', comentario: c }), 'Consulta respondida');
  }
  async changeState() {
    const c = await this.ui.prompt('Cambiar estado a ' + label(this.nuevoEstado), 'Comentario (opcional)', false);
    if (c === null) return;
    await this.run(() => this.api.patch(`/solicitudes/${this.id}/estado`, { estado: this.nuevoEstado, comentario: c || null }), 'Estado actualizado'); this.nuevoEstado = '';
  }
  saveEdit() { return this.run(() => this.api.put(`/solicitudes/${this.id}`, { prioridad: this.edit.prioridad, observaciones: this.edit.observaciones || null, fecha_programada: this.edit.fecha_programada || null }), 'Guardado'); }
  async cancel() { const m = await this.ui.prompt('Cancelar solicitud', 'Motivo (opcional)', false); if (m === null) return; await this.run(() => this.api.post(`/solicitudes/${this.id}/cancelar`, { motivo: m || null }), 'Solicitud cancelada'); }
  async makeOrder() {
    if (!(await this.ui.confirm('¿Generar la orden de servicio para esta solicitud?'))) return;
    try { const o = await this.api.post('/ordenes', { solicitud_id: Number(this.id), tecnico_id: this.tecnico }); this.ui.ok(`Orden ${o.codigo} creada`); this.router.navigateByUrl(`/ordenes/${o.id}`); } catch (e) { this.ui.err(errMsg(e)); }
  }
  pick(ev: Event) { this.files = Array.from((ev.target as HTMLInputElement).files || []); }
  upload() { return this.run(async () => { await this.api.upload(`/adjuntos/SOLICITUD/${this.id}`, this.files); this.files = []; }, 'Archivos cargados'); }
  async open(ev: Event, a: any) { ev.preventDefault(); try { await this.api.download(`/adjuntos/${a.id}/descargar`, a.nombre_original, true); } catch (e) { this.ui.err(errMsg(e)); } }
  async removeFile(a: any) { if (!(await this.ui.confirm('¿Eliminar este archivo?'))) return; await this.run(() => this.api.delete(`/adjuntos/${a.id}`), 'Archivo eliminado'); }
}
