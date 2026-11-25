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
export interface Column { key: string; label: string; type?: 'text' | 'date' | 'datetime' | 'money' | 'badge' | 'bool'; fn?: (row: any) => string; }
export interface RowAction { label: string; show?: (row: any) => boolean; danger?: boolean; run: (row: any, ctx: { api: Api; ui: Ui }) => Promise<any>; }
export interface CrudConfig {
  title: string; url: string; columns: Column[]; fields?: Field[]; filters?: Field[]; writePerm?: string; toggleActive?: boolean;
  fixedParams?: Record<string, any>; defaults?: Record<string, any>; rowLink?: (row: any) => string; createRoute?: string; createLabel?: string;
  rowActions?: RowAction[]; loadRow?: boolean; noSearch?: boolean; noEdit?: boolean; toPayload?: (v: any, editing: boolean) => any; fromRow?: (r: any) => any; subtitle?: string;
}

@Component({
  selector: 'app-crud-page', standalone: true, imports: [FormsModule],
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <div><h1>{{ config.title }}</h1>@if (config.subtitle) { <span class="muted">{{ config.subtitle }}</span> }</div>
        <span class="spacer"></span>
        @if (canWrite() && config.fields) { <button class="primary" (click)="openForm(null)">+ {{ config.createLabel || 'Nuevo' }}</button> }
        @if (canWrite() && config.createRoute) { <button class="primary" (click)="router.navigateByUrl(config.createRoute)">+ {{ config.createLabel || 'Nuevo' }}</button> }
      </div>
      <div class="row" style="margin-bottom:12px">
        @if (!config.noSearch) { <input style="max-width:260px" placeholder="Buscar…" [(ngModel)]="q" (keyup.enter)="reload(1)"> }
        @for (f of config.filters || []; track f.key) {
          <div class="filter-control">
            <select style="max-width:190px" [(ngModel)]="fvals[f.key]" (ngModelChange)="reload(1)">
              <option [ngValue]="''">{{ f.label }}: todos</option>
              @for (o of opts()[f.key] || []; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
            </select>
            @if (optionErrors()[f.key]) {
              <span class="field-error">{{ optionErrors()[f.key] }}</span>
              <button type="button" class="link retry" (click)="refreshOptions(f)">Reintentar</button>
            }
          </div>
        }
        <button (click)="reload(1)">Buscar</button>
      </div>
      @if (loading()) { <p class="muted">Cargando…</p> }
      <div class="table-wrap">
        <table>
          <thead><tr>@for (c of config.columns; track c.key) { <th>{{ c.label }}</th> }<th></th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr [class.click]="!!config.rowLink" (click)="open(r)">
                @for (c of config.columns; track c.key) {
                  <td>
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
            } @empty { @if (!loading()) { <tr><td [attr.colspan]="config.columns.length + 1" class="muted">Sin registros</td></tr> } }
          </tbody>
        </table>
      </div>
      <div class="row" style="margin-top:10px">
        <span class="muted small">{{ total() }} registros</span><span class="spacer"></span>
        <button aria-label="Página anterior" [disabled]="page() <= 1" (click)="reload(page() - 1)">‹</button>
        <span class="small">Página {{ page() }} de {{ pages() }}</span>
        <button aria-label="Página siguiente" [disabled]="page() >= pages()" (click)="reload(page() + 1)">›</button>
      </div>
    </div>

    @if (formOpen()) {
      <div class="overlay" (click)="formOpen.set(false)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="save()" #f="ngForm">
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
    .filter-control { display:grid; gap:3px; }
    .field-error { display:block; color:var(--red); font-size:12px; max-width:240px; }
    .retry { justify-self:start; }
  `],
})
export class CrudPage implements OnChanges {
  @Input({ required: true }) config!: CrudConfig;
  api = inject(Api); auth = inject(Auth); ui = inject(Ui); router = inject(Router);
  rows = signal<any[]>([]); total = signal(0); page = signal(1); loading = signal(false);
  q = ''; fvals: Record<string, any> = {}; size = 15;
  formOpen = signal(false); editing = signal<any>(null); saving = signal(false); formError = signal(''); form: Record<string, any> = {};
  opts = signal<Record<string, Opt[]>>({});
  optionErrors = signal<Record<string, string>>({});
  pages = () => Math.max(1, Math.ceil(this.total() / this.size));
  canWrite = () => !this.config.writePerm || this.auth.can(this.config.writePerm);
  toggle = () => this.config.toggleActive !== false && this.config.columns.some((c) => c.key === 'activo');
  visibleFields = () => (this.config.fields || []).filter((f) => (this.editing() ? !f.hideOnEdit : !f.hideOnCreate));
  lbl = label;

  ngOnChanges(ch: SimpleChanges) {
    if (ch['config']) { this.q = ''; this.fvals = {}; this.loadOptions(); this.reload(1); }
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

  async reload(page: number) {
    this.page.set(page); this.loading.set(true);
    try {
      const params: Record<string, any> = { page, size: this.size, q: this.q, ...this.fvals, ...(this.config.fixedParams || {}) };
      const r = await this.api.get(this.config.url, params);
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
