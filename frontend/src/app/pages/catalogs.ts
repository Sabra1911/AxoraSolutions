import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate } from '../core/fmt';
import { CrudConfig, CrudPage } from '../shared/crud-page';
import * as C from '../shared/configs';

@Component({ selector: 'app-empresas-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class EmpresasPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.empresasConfig(); })(); }
@Component({ selector: 'app-usuarios-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class UsuariosPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.usuariosConfig(); })(); }
@Component({ selector: 'app-servicios-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class ServiciosPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.serviciosConfig(); })(); }
@Component({ selector: 'app-equipos-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class EquiposPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.equiposConfig(a); })(); }
@Component({ selector: 'app-planes-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class PlanesPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.planesConfig(); })(); }
@Component({ selector: 'app-contratos-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class ContratosPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.contratosConfig(a); })(); }
@Component({ selector: 'app-mantenimientos-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class MantenimientosPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.mantenimientosConfig(a); })(); }
@Component({ selector: 'app-solicitudes-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class SolicitudesPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.solicitudesConfig(a); })(); }
@Component({ selector: 'app-cotizaciones-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class CotizacionesPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.cotizacionesConfig(a); })(); }
@Component({ selector: 'app-ordenes-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class OrdenesPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.ordenesConfig(a); })(); }
@Component({ selector: 'app-historial-page', standalone: true, imports: [CrudPage], template: '<app-crud-page [config]="cfg" />' })
export class HistorialPage { private a = inject(Auth); cfg: CrudConfig = (() => { const a = this.a; return C.historialConfig(a); })(); }

@Component({
  selector: 'app-empresa-detail', standalone: true, imports: [CrudPage],
  template: `
    @if (emp(); as e) {
      <div class="card">
        <div class="row"><div><h1>{{ e.razon_social }}</h1><span class="muted">NIT {{ e.nit }} · {{ e.ciudad }}</span></div><span class="spacer"></span>
          <span class="badge" [class]="'badge b-' + (e.activo ? 'ACTIVO' : 'INACTIVO')">{{ e.activo ? 'Activa' : 'Inactiva' }}</span>
          @if (auth.can('empresas:write')) { <button [class.danger]="e.activo" (click)="toggle()">{{ e.activo ? 'Desactivar empresa' : 'Reactivar empresa' }}</button> }
        </div>
      </div>
      <div class="tabs">@for (t of tabs; track t.key) { <button [class.on]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button> }</div>
      @switch (tab()) {
        @case ('datos') {
          <div class="card"><dl class="kv">
            <dt>Nombre comercial</dt><dd>{{ e.nombre_comercial || '—' }}</dd><dt>Sector</dt><dd>{{ e.sector || '—' }}</dd><dt>Dirección</dt><dd>{{ e.direccion || '—' }}</dd>
            <dt>Teléfono</dt><dd>{{ e.telefono || '—' }}</dd><dt>Correo</dt><dd>{{ e.email || '—' }}</dd><dt>Registrada</dt><dd>{{ fmt(e.creado_en) }}</dd></dl>
            <p class="muted small">Para editar estos datos use «Editar» en el listado de empresas.</p></div>
        }
        @case ('sedes') { <app-crud-page [config]="cfg.sedes" /> }
        @case ('contactos') { <app-crud-page [config]="cfg.contactos" /> }
        @case ('usuarios') { <app-crud-page [config]="cfg.usuarios" /> }
        @case ('equipos') { <app-crud-page [config]="cfg.equipos" /> }
        @case ('contratos') { <app-crud-page [config]="cfg.contratos" /> }
        @case ('historial') { <app-crud-page [config]="cfg.historial" /> }
      }
    }`,
})
export class EmpresaDetail implements OnInit {
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); route = inject(ActivatedRoute);
  emp = signal<any>(null); tab = signal('datos'); fmt = fmtDate; cfg: any = {};
  tabs = [{ key: 'datos', label: 'Datos' }, { key: 'sedes', label: 'Sedes' }, { key: 'contactos', label: 'Contactos' }, { key: 'usuarios', label: 'Usuarios' }, { key: 'equipos', label: 'Equipos' }, { key: 'contratos', label: 'Contratos' }, { key: 'historial', label: 'Historial' }];
  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.cfg = { sedes: C.sedesConfig(id), contactos: C.contactosConfig(id), usuarios: C.usuariosConfig(id), equipos: C.equiposConfig(this.auth, id), contratos: C.contratosConfig(this.auth, id), historial: C.historialConfig(this.auth, id) };
    try { this.emp.set(await this.api.get(`/empresas/${id}`)); } catch (e) { this.ui.err(errMsg(e)); }
  }
  async toggle() {
    const e = this.emp();
    const msg = e.activo ? '¿Desactivar la empresa? También se desactivarán sus usuarios y se cerrarán sus sesiones.' : '¿Reactivar la empresa? Sus usuarios deberán reactivarse manualmente.';
    if (!(await this.ui.confirm(msg))) return;
    try { this.emp.set(await this.api.patch(`/empresas/${e.id}/activo`, { activo: !e.activo })); this.ui.ok('Empresa actualizada'); } catch (er) { this.ui.err(errMsg(er)); }
  }
}
