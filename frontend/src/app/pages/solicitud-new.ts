import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg } from '../core/fmt';
import { CATEGORIAS, PRIORIDADES } from '../shared/configs';

@Component({
  selector: 'app-solicitud-new', standalone: true, imports: [FormsModule],
  template: `
    <form class="card" style="max-width:820px" (ngSubmit)="save()" #f="ngForm">
      <h1>Nueva solicitud de soporte</h1>
      <p class="muted">Describa el problema o requerimiento. Puede adjuntar fotos o documentos (JPG, PNG, WEBP o PDF, máx. 5 MB c/u).</p>
      <div class="grid g2">
        @if (auth.isStaff()) {
          <div class="field"><label class="req">Empresa</label>
            <select name="empresa" [(ngModel)]="m.empresa_id" (ngModelChange)="onEmpresa()" required><option [ngValue]="null">— Seleccione —</option>@for (e of empresas(); track e.id) { <option [ngValue]="e.id">{{ e.razon_social }}</option> }</select></div>
        }
        <div class="field"><label>Sede</label><select name="sede" [(ngModel)]="m.sede_id"><option [ngValue]="null">— Sin especificar —</option>@for (s of sedes(); track s.id) { <option [ngValue]="s.id">{{ s.nombre }}</option> }</select></div>
        <div class="field"><label>Equipo relacionado</label><select name="equipo" [(ngModel)]="m.equipo_id"><option [ngValue]="null">— Ninguno —</option>@for (q of equipos(); track q.id) { <option [ngValue]="q.id">{{ q.nombre }} ({{ q.tipo }})</option> }</select></div>
        <div class="field"><label class="req">Categoría</label><select name="cat" [(ngModel)]="m.categoria" required>@for (c of cats; track c.value) { <option [ngValue]="c.value">{{ c.label }}</option> }</select></div>
        <div class="field"><label>Servicio</label><select name="serv" [(ngModel)]="m.servicio_id"><option [ngValue]="null">— No sé / otro —</option>@for (s of servicios(); track s.id) { <option [ngValue]="s.id">{{ s.nombre }}</option> }</select></div>
        <div class="field"><label class="req">Prioridad</label><select name="pri" [(ngModel)]="m.prioridad" required>@for (p of pris; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }</select></div>
      </div>
      <div class="field"><label class="req">Asunto</label><input name="asunto" [(ngModel)]="m.asunto" required maxlength="200"></div>
      <div class="field"><label class="req">Descripción</label><textarea name="desc" rows="5" [(ngModel)]="m.descripcion" required maxlength="4000"></textarea></div>
      <div class="field"><label>Adjuntos</label><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" (change)="pick($event)">
        @for (f of files; track f.name) { <div class="small muted">📎 {{ f.name }} ({{ (f.size / 1024).toFixed(0) }} KB)</div> }</div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="row"><button class="primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Enviando…' : 'Enviar solicitud' }}</button><button type="button" (click)="router.navigateByUrl('/solicitudes')">Cancelar</button></div>
    </form>`,
})
export class SolicitudNew implements OnInit {
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  cats = CATEGORIAS; pris = PRIORIDADES;
  m: any = { empresa_id: null, sede_id: null, equipo_id: null, servicio_id: null, categoria: 'SOPORTE_EQUIPOS', prioridad: 'MEDIA', asunto: '', descripcion: '' };
  empresas = signal<any[]>([]); sedes = signal<any[]>([]); equipos = signal<any[]>([]); servicios = signal<any[]>([]);
  files: File[] = []; error = signal(''); busy = signal(false);

  async ngOnInit() {
    try {
      this.servicios.set((await this.api.get('/servicios', { size: 200, activo: 'true' })).data);
      if (this.auth.isStaff()) this.empresas.set((await this.api.get('/empresas', { size: 200, activo: 'true' })).data);
      else await this.onEmpresa();
    } catch (e) { this.ui.err(errMsg(e)); }
  }
  async onEmpresa() {
    this.m.sede_id = null; this.m.equipo_id = null;
    if (this.auth.isStaff() && !this.m.empresa_id) { this.sedes.set([]); this.equipos.set([]); return; }
    const p: any = { size: 200, activo: 'true', ...(this.auth.isStaff() ? { empresa_id: this.m.empresa_id } : {}) };
    this.sedes.set((await this.api.get('/empresas/sedes', p)).data);
    this.equipos.set((await this.api.get('/equipos', p)).data);
  }
  pick(ev: Event) { this.files = Array.from((ev.target as HTMLInputElement).files || []); }
  async save() {
    this.busy.set(true); this.error.set('');
    try {
      const body = { ...this.m }; if (!this.auth.isStaff()) delete body.empresa_id;
      const s = await this.api.post('/solicitudes', body);
      if (this.files.length) {
        try { await this.api.upload(`/adjuntos/SOLICITUD/${s.id}`, this.files); }
        catch (e) { this.ui.err('La solicitud se creó, pero los adjuntos fallaron: ' + errMsg(e)); }
      }
      this.ui.ok(`Solicitud ${s.codigo} creada`);
      this.router.navigateByUrl(`/solicitudes/${s.id}`);
    } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}
