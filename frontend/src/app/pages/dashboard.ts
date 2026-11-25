import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtMoney, label } from '../core/fmt';
import { ESTADOS_SOL } from '../shared/configs';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [FormsModule, RouterLink],
  template: `
    <div class="card">
      <div class="row"><div><h1>{{ auth.isClient() ? 'Bienvenido, ' + auth.user()?.nombre : 'Dashboard' }}</h1><span class="muted">Indicadores calculados con información real de la base de datos</span></div></div>
      <div class="row" style="margin-top:12px">
        <div><label>Desde</label><input type="date" [(ngModel)]="f.desde"></div><div><label>Hasta</label><input type="date" [(ngModel)]="f.hasta"></div>
        @if (auth.isStaff()) { <div><label>Cliente</label><select [(ngModel)]="f.empresa_id"><option [ngValue]="''">Todos</option>@for (e of empresas(); track e.id) { <option [ngValue]="e.id">{{ e.razon_social }}</option> }</select></div> }
        <div><label>Estado solicitud</label><select [(ngModel)]="f.estado"><option [ngValue]="''">Todos</option>@for (e of estados; track e.value) { <option [ngValue]="e.value">{{ e.label }}</option> }</select></div>
        <div><label>Servicio</label><select [(ngModel)]="f.servicio_id"><option [ngValue]="''">Todos</option>@for (s of servicios(); track s.id) { <option [ngValue]="s.id">{{ s.nombre }}</option> }</select></div>
        <div style="align-self:flex-end"><button class="primary" (click)="load()">Aplicar</button> <button (click)="clear()">Limpiar</button></div>
      </div>
    </div>
    @if (d(); as x) {
      <div class="grid g4" style="margin-bottom:16px">
        @if (auth.isStaff()) {
          <div class="kpi"><span class="muted">Empresas activas</span><b>{{ x.kpis.empresas_activas }}</b></div><div class="kpi"><span class="muted">Equipos</span><b>{{ x.kpis.equipos_activos }}</b></div>
          <div class="kpi"><span class="muted">Contratos vigentes</span><b>{{ x.kpis.contratos_vigentes }}</b></div><div class="kpi"><span class="muted">Usuarios activos</span><b>{{ x.kpis.usuarios_activos }}</b></div>
        } @else if (auth.isClient() && x.kpis) {
          <div class="kpi"><span class="muted">Solicitudes abiertas</span><b>{{ x.kpis.solicitudes_abiertas }}</b></div><div class="kpi"><span class="muted">Cotizaciones por responder</span><b>{{ x.kpis.cotizaciones_pendientes }}</b></div>
          <div class="kpi"><span class="muted">Equipos registrados</span><b>{{ x.kpis.equipos_activos }}</b></div>
        }
        <div class="kpi"><span class="muted">Solicitudes (total)</span><b>{{ sum(x.solicitudesPorEstado) }}</b></div>
        <div class="kpi"><span class="muted">Mantenimientos vencidos</span><b>{{ x.mantenimientos?.vencidos || 0 }}</b></div>
        <div class="kpi"><span class="muted">Mantenimientos programados</span><b>{{ x.mantenimientos?.programados || 0 }}</b></div>
      </div>
      @if (auth.isClient()) { <div class="row" style="margin-bottom:16px"><a class="btn primary" routerLink="/solicitudes/nueva">+ Nueva solicitud</a><a class="btn" routerLink="/cotizaciones">Ver cotizaciones</a><a class="btn" routerLink="/equipos">Mis equipos</a></div> }
      <div class="grid g2">
        <div class="card"><h2>Solicitudes por estado</h2>@for (r of x.solicitudesPorEstado; track r.estado) { <div class="bar"><span class="l">{{ lbl(r.estado) }}</span><i [style.width.%]="pct(r.total, x.solicitudesPorEstado, 'total')"></i><span class="n">{{ r.total }}</span></div> } @empty { <p class="muted">Sin datos</p> }</div>
        <div class="card"><h2>Solicitudes por mes</h2>@for (r of x.solicitudesPorMes; track r.mes) { <div class="bar"><span class="l">{{ r.mes }}</span><i [style.width.%]="pct(r.total, x.solicitudesPorMes, 'total')"></i><span class="n">{{ r.total }}</span></div> } @empty { <p class="muted">Sin datos</p> }</div>
        <div class="card"><h2>Servicios más solicitados</h2>@for (r of x.serviciosMasSolicitados; track r.servicio) { <div class="bar"><span class="l">{{ r.servicio }}</span><i [style.width.%]="pct(r.total, x.serviciosMasSolicitados, 'total')"></i><span class="n">{{ r.total }}</span></div> } @empty { <p class="muted">Sin datos</p> }</div>
        <div class="card"><h2>Cotizaciones</h2>@for (r of x.cotizacionesPorEstado; track r.estado) { <div class="row" style="padding:3px 0"><span class="badge" [class]="'badge b-' + r.estado">{{ r.estado }}</span><span>{{ r.total }}</span><span class="spacer"></span><b>{{ money(r.valor) }}</b></div> } @empty { <p class="muted">Sin datos</p> }
          <h3 style="margin-top:12px">Aprobadas por mes</h3>@for (r of x.ingresosAprobadosPorMes; track r.mes) { <div class="bar"><span class="l">{{ r.mes }}</span><i [style.width.%]="pct(r.valor, x.ingresosAprobadosPorMes, 'valor')"></i><span class="n">{{ money(r.valor) }}</span></div> }</div>
        <div class="card"><h2>Órdenes de servicio</h2>@for (r of x.ordenesPorEstado; track r.estado) { <div class="bar"><span class="l">{{ lbl(r.estado) }}</span><i [style.width.%]="pct(r.total, x.ordenesPorEstado, 'total')"></i><span class="n">{{ r.total }}</span></div> } @empty { <p class="muted">Sin datos</p> }
          @if (x.ordenesPorTecnico) { <h3 style="margin-top:12px">Por técnico</h3>@for (r of x.ordenesPorTecnico; track r.tecnico) { <div class="bar"><span class="l">{{ r.tecnico }}</span><i [style.width.%]="pct(r.total, x.ordenesPorTecnico, 'total')"></i><span class="n">{{ r.total }}</span></div> } }</div>
        <div class="card"><h2>Próximos mantenimientos (30 días)</h2>
          @for (m of x.mantenimientosProximos; track m.id) { <div class="row" style="padding:5px 0;border-top:1px solid var(--gray-100)"><div><b>{{ m.titulo }}</b><div class="muted small">{{ m.empresa_nombre }} · {{ m.tipo }}</div></div><span class="spacer"></span><span>{{ date(m.fecha_programada) }}</span></div> } @empty { <p class="muted">Sin mantenimientos próximos</p> }
          <a routerLink="/mantenimientos">Ver todos →</a></div>
      </div>
    }`,
})
export class Dashboard implements OnInit {
  api = inject(Api); auth = inject(Auth); ui = inject(Ui);
  d = signal<any>(null); empresas = signal<any[]>([]); servicios = signal<any[]>([]);
  f: any = { desde: '', hasta: '', empresa_id: '', estado: '', servicio_id: '' };
  estados = ESTADOS_SOL; lbl = label; money = fmtMoney; date = fmtDate;
  sum = (a: any[]) => (a || []).reduce((s, r) => s + Number(r.total), 0);
  pct = (v: number, arr: any[], k: string) => { const m = Math.max(...arr.map((r) => Number(r[k])), 1); return Math.max(2, (Number(v) / m) * 100); };
  async ngOnInit() {
    try {
      this.servicios.set((await this.api.get('/servicios', { size: 200 })).data);
      if (this.auth.isStaff()) this.empresas.set((await this.api.get('/empresas', { size: 200 })).data);
    } catch { /* filtros opcionales */ }
    await this.load();
  }
  async load() { try { this.d.set(await this.api.get('/reportes/dashboard', this.f)); } catch (e) { this.ui.err(errMsg(e)); } }
  clear() { this.f = { desde: '', hasta: '', empresa_id: '', estado: '', servicio_id: '' }; this.load(); }
}
