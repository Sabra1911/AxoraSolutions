import { AxoraHint } from './axora-hint';
import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDate, fmtDateTime, fmtMoney, label, toDateInput } from '../core/fmt';

export interface Opt { value: any; label: string; }
export interface Field {
  key: string; label: string; type?: 'text' | 'number' | 'date' | 'email' | 'password' | 'select' | 'textarea' | 'multiselect' | 'checkbox';
  required?: boolean; options?: Opt[]; optionsUrl?: string; optionValue?: string; optionLabel?: string; optionParams?: Record<string, any>;
  dependsOn?: string; hideOnEdit?: boolean; hideOnCreate?: boolean; disabledOnEdit?: boolean; hint?: string;
}
export interface Column { key: string; label: string; sort?: boolean; type?: 'text' | 'date' | 'datetime' | 'money' | 'badge' | 'bool'; fn?: (row: any) => string; }
export interface RowAction { label: string; show?: (row: any) => boolean; danger?: boolean; run: (row: any, ctx: { api: Api; ui: Ui }) => Promise<any>; }
export interface CrudConfig {
  title: string; url: string; columns: Column[]; fields?: Field[]; filters?: Field[]; writePerm?: string; toggleActive?: boolean;
  fixedParams?: Record<string, any>; defaults?: Record<string, any>; rowLink?: (row: any) => string; createRoute?: string; createLabel?: string;
  dateRange?: boolean; help?: string; rowActions?: RowAction[]; loadRow?: boolean; noSearch?: boolean; noEdit?: boolean; toPayload?: (v: any, editing: boolean) => any; fromRow?: (r: any) => any; subtitle?: string;
}

@Component({
  selector: 'app-crud-page', standalone: true, imports: [AxoraHint, FormsModule],
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <div><h1>{{ config.title }}</h1>@if (config.subtitle) { <span class="muted">{{ config.subtitle }}</span> }
          @if (config.help) { <p class="pagehelp">{{ config.help }}</p> }</div>
        <span class="spacer"></span>
        @if (canWrite() && config.fields) { <button class="primary" (click)="openForm(null)">+ {{ config.createLabel || 'Nuevo' }}</button> }
        @if (canWrite() && config.createRoute) { <button class="primary" (click)="router.navigateByUrl(config.createRoute)">+ {{ config.createLabel || 'Nuevo' }}</button> }
      </div>
      <div class="filters" role="search">
        @if (!config.noSearch) {
          <div class="searchbox">
            <input type="search" placeholder="Buscar…" aria-label="Buscar" [(ngModel)]="q" (ngModelChange)="onSearch()" (keyup.enter)="searchNow()">
            @if (q) { <button type="button" class="clearq" aria-label="Borrar búsqueda" (click)="q = ''; searchNow()">×</button> }
          </div>
        }
        @for (f of config.filters || []; track f.key) {
          <div class="filter-control">
            <label class="flabel" [attr.for]="'f-' + f.key">{{ f.label }}</label>
            <select [id]="'f-' + f.key" [class.active]="fvals[f.key] !== '' && fvals[f.key] != null" [(ngModel)]="fvals[f.key]" (ngModelChange)="reload(1)">
              <option [ngValue]="''">Todos</option>
              @for (o of opts()[f.key] || []; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
            </select>
            @if (optionErrors()[f.key]) {
              <span class="field-error">{{ optionErrors()[f.key] }}</span>
              <button type="button" class="link retry" (click)="refreshOptions(f)">Reintentar</button>
            }
          </div>
        }
        @if (config.dateRange) {
          <div class="filter-control"><label class="flabel" for="f-desde">Desde</label><input id="f-desde" type="date" [class.active]="!!desde" [(ngModel)]="desde" (ngModelChange)="reload(1)"></div>
          <div class="filter-control"><label class="flabel" for="f-hasta">Hasta</label><input id="f-hasta" type="date" [class.active]="!!hasta" [(ngModel)]="hasta" (ngModelChange)="reload(1)"></div>
        }
        @if (hasFilters()) {
          <button type="button" class="clearall" (click)="clearFilters()">{{ activeCount() ? 'Limpiar filtros (' + activeCount() + ')' : 'Quitar orden' }}</button>
        }
      </div>
      @if (loading()) { <p class="muted">Cargando…</p> }
      <div class="table-wrap">
        <table>
          <thead><tr>@for (c of config.columns; track c.key) {
            @if (isSortable(c)) { <th class="sortable" [attr.aria-sort]="ariaSort(c)"><button type="button" class="sortbtn" (click)="sortBy(c)" [attr.title]="'Ordenar por ' + c.label">{{ c.label }} <span class="arrow">{{ sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span></button></th> }
            @else { <th>{{ c.label }}</th> }
          }<th></th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr [class.click]="!!config.rowLink" (click)="open(r)">
                @for (c of config.columns; track c.key) {
                  <td [attr.data-label]="c.label">
                    @if (c.type === 'badge') { <span class="badge" [class]="'badge b-' + r[c.key]">{{ lbl(r[c.key]) }}</span> }
                    @else if (c.type === 'bool') { <span class="badge" [class]="'badge b-' + (r[c.key] ? 'ACTIVO' : 'INACTIVO')">{{ r[c.key] ? 'Activo' : 'Inactivo' }}</span> }
                    @else { {{ cell(r, c) }} }
                  </td>
                }
                <td class="right" style="white-space:nowrap" (click)="$event.stopPropagation()">
                  @for (a of config.rowActions || []; track a.label) {
                    @if (!a.show || a.show(r)) { <button class="link" [class.danger]="a.danger" style="border:none" (click)="runAction(a, r)">{{ a.label }}</button> }
                  }
                  @if (canWrite() && config.fields && !config.noEdit) { <button class="link" (click)="openForm(r)">Editar</button> }
                  @if (canWrite() && toggle()) { <button class="link" [class.danger]="r.activo" (click)="setActive(r)">{{ r.activo ? 'Desactivar' : 'Activar' }}</button> }
                </td>
              </tr>
            } @empty { @if (!loading()) { <tr><td [attr.colspan]="config.columns.length + 1" class="muted"><app-axora-hint title="Aún no hay registros" text="Cuando agregues o recibas información, aparecerá aquí." /></td></tr> } }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted small">{{ rangeText() }}</span><span class="spacer"></span>
        @if (pages() > 1) {
          <nav class="pages" aria-label="Paginación">
            <button aria-label="Primera página" [disabled]="page() <= 1" (click)="reload(1)">«</button>
            <button aria-label="Página anterior" [disabled]="page() <= 1" (click)="reload(page() - 1)">‹</button>
            @for (n of pageWindow(); track n) {
              <button [class.cur]="n === page()" [attr.aria-current]="n === page() ? 'page' : null" (click)="reload(n)">{{ n }}</button>
            }
            <button aria-label="Página siguiente" [disabled]="page() >= pages()" (click)="reload(page() + 1)">›</button>
            <button aria-label="Última página" [disabled]="page() >= pages()" (click)="reload(pages())">»</button>
          </nav>
        }
      </div>
    </div>

    @if (formOpen()) {
      <div class="overlay" (mousedown)="$event.target === $event.currentTarget && formOpen.set(false)">
        <form class="modal" (ngSubmit)="save()" #f="ngForm">
          <h2>{{ editing() ? 'Editar' : (config.createLabel || 'Nuevo') }} · {{ config.title }}</h2>
          <div class="grid g2">
            @for (fd of visibleFields(); track fd.key) {
              <div class="field" [style.grid-column]="fd.type === 'textarea' || fd.type === 'multiselect' ? '1 / -1' : null">
                @if (fd.type !== 'checkbox') { <label [class.req]="fd.required">{{ fd.label }}</label> }
                @switch (fd.type) {
                  @case ('select') {
                    <select [name]="fd.key" [(ngModel)]="form[fd.key]" (ngModelChange)="onChange(fd.key)" [required]="!!fd.required" [disabled]="!!fd.disabledOnEdit && editing()">
                      <option [ngValue]="null">— Seleccione —</option>
                      @for (o of opts()[fd.key] || []; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                    </select>
                  }
                  @case ('multiselect') {
                    <div class="row">@for (o of opts()[fd.key] || []; track o.value) {
                      <label style="font-weight:400"><input type="checkbox" style="width:auto" [checked]="(form[fd.key] || []).includes(o.value)" (change)="toggleMulti(fd.key, o.value)"> {{ o.label }}</label> }</div>
                  }
                  @case ('textarea') { <textarea rows="3" [name]="fd.key" [(ngModel)]="form[fd.key]" [required]="!!fd.required"></textarea> }
                  @case ('checkbox') { <label style="font-weight:400"><input type="checkbox" style="width:auto" [name]="fd.key" [(ngModel)]="form[fd.key]"> {{ fd.label }}</label> }
                  @default { <input [type]="fd.type || 'text'" [name]="fd.key" [(ngModel)]="form[fd.key]" [required]="!!fd.required" [step]="fd.type === 'number' ? 'any' : null" [attr.autocomplete]="fd.type === 'password' ? 'new-password' : null"> }
                }
                @if (fd.hint) { <span class="muted small">{{ fd.hint }}</span> }
                @if (optionErrors()[fd.key]) {
                  <span class="field-error">{{ optionErrors()[fd.key] }}</span>
                  <button type="button" class="link retry" (click)="refreshOptions(fd)">Reintentar carga</button>
                }
              </div>
            }
          </div>
          @if (formError()) { <p class="error">{{ formError() }}</p> }
          <div class="row" style="justify-content:flex-end;margin-top:12px">
            <button type="button" (click)="formOpen.set(false)">Cancelar</button>
            <button class="primary" type="submit" [disabled]="f.invalid || saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .overlay { position:fixed; inset:0; background:rgba(15,23,42,.48); backdrop-filter:blur(3px); z-index:1000; display:flex; align-items:flex-start; justify-content:center; padding:30px 16px; overflow:auto; }
    .modal { background:#fff; border:1px solid var(--gray-100); border-radius:16px; padding:24px; width:100%; max-width:720px; box-shadow:0 20px 60px rgba(15,23,42,.2); }
    .filters { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px 12px; margin-bottom:14px; padding:12px; background:var(--surface-alt,#f5f4f8); border-radius:12px; }
    @media (max-width:640px) {
      .overlay { padding:0; align-items:stretch; }
      .modal { max-width:100%; min-height:100dvh; border-radius:0; padding:16px; }
      .modal .grid, .modal .g2 { grid-template-columns:1fr !important; }
      .modal .field { grid-column:1 / -1 !important; }
      .filters { padding:10px; } .searchbox { max-width:none; flex-basis:100%; }
      .filter-control { flex:1 1 140px; } .filter-control select, .filter-control input { min-width:0; max-width:none; width:100%; }
      .clearall { flex:1 1 100%; }
      .table-wrap { border:0; overflow:visible; }
      table, thead, tbody, tr, td { display:block; width:100%; }
      thead { position:absolute; left:-9999px; }
      tr { background:#fff; border:1px solid var(--line,#e4def0); border-radius:12px; margin-bottom:10px; padding:6px 12px; }
      td { display:flex; justify-content:space-between; gap:12px; padding:7px 0 !important; border:0 !important; text-align:right; }
      td::before { content:attr(data-label); font-weight:600; color:#6b6478; text-align:left; flex:none; max-width:45%; }
      td:last-child { justify-content:flex-end; flex-wrap:wrap; }
      td:last-child::before { content:none; }
      .pager { justify-content:center; } .pages { flex-wrap:wrap; justify-content:center; }
    }
    .pagehelp { margin:4px 0 0; color:#555; font-size:.92rem; max-width:760px; }
    th.sortable { padding:0; } .sortbtn { all:unset; cursor:pointer; display:flex; gap:6px; align-items:center; padding:10px 12px; font-weight:inherit; width:100%; box-sizing:border-box; } .sortbtn:hover { background:var(--surface-alt,#f5f4f8); } .sortbtn .arrow { font-size:.7rem; opacity:.55; }
    .searchbox { position:relative; min-width:220px; max-width:280px; flex:1 1 220px; }
    .searchbox input { width:100%; padding-right:30px; }
    .clearq { position:absolute; right:4px; top:50%; transform:translateY(-50%); border:none; background:transparent; font-size:20px; line-height:1; color:#6b6478; padding:2px 8px; cursor:pointer; }
    .filter-control { display:grid; gap:3px; }
    .flabel { font-size:12px; font-weight:600; color:#6b6478; }
    .filter-control select { min-width:140px; max-width:210px; }
    .filter-control select.active { border-color:var(--brand-600,#592c91); box-shadow:0 0 0 2px rgba(89,44,145,.15); }
    .clearall { align-self:flex-end; background:#fff; color:var(--brand-600,#592c91); border:1px solid var(--brand-600,#592c91); }
    .pager { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
    .pages { display:flex; gap:4px; }
    .pages button { min-width:36px; padding:6px 8px; }
    .pages button.cur { background:var(--brand-600,#592c91); color:#fff; border-color:var(--brand-600,#592c91); }
    .field-error { display:block; color:var(--red); font-size:12px; max-width:240px; }
    .retry { justify-self:start; }
  `],
})
export class CrudPage implements OnChanges {
  @Input({ required: true }) config!: CrudConfig;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  rows = signal<any[]>([]); total = signal(0); page = signal(1); loading = signal(false);
  q = ''; fvals: Record<string, any> = {}; size = 10; desde = ''; hasta = ''; sortKey = ''; sortDir: 'asc' | 'desc' = 'asc';
  private searchTimer: any = null;
  hasFilters = () => !!this.q.trim() || this.activeCount() > 0 || !!this.sortKey;
  activeCount = () => Object.values(this.fvals).filter((v) => v !== '' && v !== null && v !== undefined).length + (this.q.trim() ? 1 : 0) + (this.desde ? 1 : 0) + (this.hasta ? 1 : 0);
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.reload(1), 350); }
  searchNow() { clearTimeout(this.searchTimer); this.reload(1); }
  /** Una columna es ordenable si es un dato directo (no calculado ni unido de otra tabla). */
  isSortable(c: Column) { return c.sort ?? (!c.fn && !/_nombre$|^roles$/.test(c.key)); }
  ariaSort(c: Column) { return this.sortKey === c.key ? (this.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'; }
  sortBy(c: Column) {
    if (this.sortKey === c.key) { if (this.sortDir === 'asc') this.sortDir = 'desc'; else { this.sortKey = ''; this.sortDir = 'asc'; } }
    else { this.sortKey = c.key; this.sortDir = 'asc'; }
    this.reload(1);
  }
  clearFilters() {
    clearTimeout(this.searchTimer);
    this.q = ''; this.fvals = {}; this.desde = ''; this.hasta = ''; this.sortKey = ''; this.sortDir = 'asc';
    (this.config.filters || []).forEach((f) => { this.fvals[f.key] = ''; });
    this.reload(1);
  }
  rangeText = () => {
    const t = this.total();
    if (!t) return this.hasFilters() ? 'Sin resultados con esos filtros' : '0 registros';
    const a = (this.page() - 1) * this.size + 1;
    return `Mostrando ${a}–${Math.min(this.page() * this.size, t)} de ${t}`;
  };
  pageWindow = () => {
    const p = this.page(), n = this.pages(); const start = Math.max(1, Math.min(p - 2, n - 4)); const end = Math.min(n, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  formOpen = signal(false); editing = signal<any>(null); saving = signal(false); formError = signal(''); form: Record<string, any> = {};
  opts = signal<Record<string, Opt[]>>({});
  optionErrors = signal<Record<string, string>>({});
  pages = () => Math.max(1, Math.ceil(this.total() / this.size));
  canWrite = () => !this.config.writePerm || this.auth.can(this.config.writePerm);
  toggle = () => this.config.toggleActive !== false && this.config.columns.some((c) => c.key === 'activo');
  visibleFields = () => (this.config.fields || []).filter((f) => (this.editing() ? !f.hideOnEdit : !f.hideOnCreate));
  lbl = label;

  ngOnChanges(ch: SimpleChanges) {
    if (ch['config']) {
      clearTimeout(this.searchTimer); this.q = ''; this.fvals = {};
      (this.config.filters || []).forEach((f) => { this.fvals[f.key] = ''; });
      this.loadOptions(); this.reload(1);
    }
  }

  cell(r: any, c: Column) {
    if (c.fn) return c.fn(r);
    const v = r[c.key];
    if (c.type === 'date') return fmtDate(v);
    if (c.type === 'datetime') return fmtDateTime(v);
    if (c.type === 'money') return fmtMoney(v);
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }

  private async loadOne(f: Field, extra: Record<string, any> = {}) {
    this.optionErrors.update((errors) => { const next = { ...errors }; delete next[f.key]; return next; });
    if (f.options) { this.opts.update((o) => ({ ...o, [f.key]: f.options! })); return; }
    if (!f.optionsUrl) return;
    try {
      const r = await this.api.get(f.optionsUrl, { size: 200, ...(f.optionParams || {}), ...extra });
      const vk = f.optionValue || 'id', lk = f.optionLabel || 'nombre';
      this.opts.update((o) => ({ ...o, [f.key]: (r.data || []).map((x: any) => ({ value: x[vk], label: x[lk] })) }));
    } catch (e) {
      this.optionErrors.update((errors) => ({ ...errors, [f.key]: errMsg(e) }));
    }
  }
  loadOptions() {
    this.opts.set({});
    this.optionErrors.set({});
    [...(this.config.fields || []), ...(this.config.filters || [])].filter((f) => !f.dependsOn).forEach((f) => this.loadOne(f));
  }
  refreshOptions(f: Field) {
    const parentKey = f.dependsOn;
    const parentValue = parentKey ? this.form[parentKey] : null;
    if (parentKey && !parentValue) return;
    return this.loadOne(f, parentKey ? { [parentKey]: parentValue } : {});
  }

  async reload(page: number): Promise<void> {
    this.page.set(page); this.loading.set(true);
    try {
      const params: Record<string, any> = { page, size: this.size, q: this.q, ...this.fvals, ...(this.config.fixedParams || {}) };
      if (this.desde) params['desde'] = this.desde;
      if (this.hasta) params['hasta'] = this.hasta;
      if (this.sortKey) { params['sort'] = this.sortKey; params['dir'] = this.sortDir; }
      const r = await this.api.get(this.config.url, params);
      // si la página quedó vacía (p. ej. tras filtrar o borrar), volver a la última válida
      if (!r.data.length && r.total > 0 && page > 1) { this.loading.set(false); return this.reload(Math.max(1, Math.ceil(r.total / this.size))); }
      this.rows.set(r.data); this.total.set(r.total);
    } catch (e) { this.ui.err(errMsg(e)); } finally { this.loading.set(false); }
  }

  open(r: any) { if (this.config.rowLink) this.router.navigateByUrl(this.config.rowLink(r)); }

  async openForm(row: any | null) {
    if (row && this.config.loadRow) { try { row = await this.api.get(`${this.config.url}/${row.id}`); } catch (e) { this.ui.err(errMsg(e)); return; } }
    this.formError.set(''); this.editing.set(row);
    const base: Record<string, any> = {};
    (this.config.fields || []).forEach((f) => { base[f.key] = f.type === 'multiselect' ? [] : f.type === 'checkbox' ? false : null; });
    this.form = row ? { ...base, ...(this.config.fromRow ? this.config.fromRow(row) : this.defaultFromRow(row)) } : { ...base, ...(this.config.defaults || {}) };
    // listas dependientes (p. ej. sedes de la empresa elegida)
    (this.config.fields || []).filter((f) => f.dependsOn).forEach((f) => this.loadDependent(f));
    this.formOpen.set(true);
  }
  private defaultFromRow(row: any) {
    const o: Record<string, any> = {};
    (this.config.fields || []).forEach((f) => { const v = row[f.key]; o[f.key] = f.type === 'date' ? toDateInput(v) : v; });
    return o;
  }
  private loadDependent(f: Field) {
    const parent = this.form[f.dependsOn!];
    if (parent) this.loadOne(f, { [f.dependsOn!]: parent });
    else {
      this.optionErrors.update((errors) => { const next = { ...errors }; delete next[f.key]; return next; });
      this.opts.update((o) => ({ ...o, [f.key]: [] }));
    }
  }
  onChange(key: string) {
    (this.config.fields || []).filter((f) => f.dependsOn === key).forEach((f) => { this.form[f.key] = null; this.loadDependent(f); });
  }
  toggleMulti(key: string, val: any) {
    const cur: any[] = this.form[key] || [];
    this.form[key] = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
  }

  async save() {
    this.saving.set(true); this.formError.set('');
    try {
      const editing = !!this.editing();
      let payload: Record<string, any> = {};
      for (const f of this.visibleFields()) {
        let v = this.form[f.key];
        if (v === '' || v === undefined) v = null;
        if (f.type === 'number' && v !== null) v = Number(v);
        payload[f.key] = v;
      }
      if (this.config.toPayload) payload = this.config.toPayload(payload, editing);
      if (editing) await this.api.put(`${this.config.url}/${this.editing().id}`, payload);
      else await this.api.post(this.config.url, { ...payload, ...(this.config.fixedParams || {}) });
      this.formOpen.set(false); this.ui.ok('Guardado correctamente');
      this.reload(this.page());
    } catch (e) { this.formError.set(errMsg(e)); } finally { this.saving.set(false); }
  }

  async setActive(r: any) {
    if (!(await this.ui.confirm(`¿${r.activo ? 'Desactivar' : 'Activar'} este registro?`))) return;
    try { await this.api.patch(`${this.config.url}/${r.id}/activo`, { activo: !r.activo }); this.ui.ok('Actualizado'); this.reload(this.page()); }
    catch (e) { this.ui.err(errMsg(e)); }
  }
  async runAction(a: RowAction, r: any) {
    try { await a.run(r, { api: this.api, ui: this.ui }); this.reload(this.page()); } catch (e) { this.ui.err(errMsg(e)); }
  }
}
