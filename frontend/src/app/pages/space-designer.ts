import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { errMsg, fmtDateTime, fmtMoney } from '../core/fmt';

interface CatalogService { id: number; codigo: string; linea: string; nombre: string; descripcion: string; precio_base: number; unidad: string; }
interface DesignOption { clave: string; nombre: string; pregunta: string; especificacionesAyuda: string; catalogo: { id: number; codigo: string; nombre: string; precio_base: number; unidad: string } | null; }
interface Catalog { opciones: DesignOption[]; servicios: CatalogService[]; }
interface SelectedService { clave: string; servicio_id?: number | null; especificaciones: string; }
interface ProposalService { clave: string; nombre: string; servicio_id: number | null; codigo: string | null; especificaciones: string; }
interface Proposal {
  id: number;
  estado: string;
  fotografia_nombre: string;
  servicios: ProposalService[] | null;
  observaciones_cliente: string | null;
  analisis: any;
  solicitud_id: number | null;
  versiones: any[];
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-space-designer',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="card intro">
      <div>
        <p class="eyebrow">AXORA SOLUTIONS</p>
        <h1>Diseñador de espacios</h1>
        <p class="muted">Convierte una fotografía de tu espacio en una propuesta y solicita una cotización. Con IA para ver el resultado, o en modo manual si prefieres describirlo tú o la IA no está disponible.</p>
      </div>
      <span class="badge">IA + modo manual</span>
    </header>

    @if (configured() === false) {
      <div class="notice warning"><b>La IA no está configurada.</b> Puedes continuar en <b>modo manual</b>: eliges los servicios, describes la adecuación y solicitas la cotización sin imagen generada. Para analizar o generar imágenes, el administrador debe configurar la clave del proveedor de IA en el backend.</div>
    }

    <div class="layout">
      <aside class="card saved">
        <div class="row"><h2>Mis propuestas</h2><button type="button" class="link spacer" (click)="newProposal()">+ Nueva</button></div>
        @if (listError()) { <p class="error">{{ listError() }}</p> }
        @for (item of proposals(); track item.id) {
          <button type="button" class="saved-item" [class.active]="proposal()?.id === item.id" (click)="openProposal(item.id)">
            <span><b>Propuesta #{{ item.id }}</b><small>{{ fmt(item.creado_en) }}</small></span>
            <span class="badge">{{ item.manual && item.estado === 'ANALIZADA' ? 'Manual' : labelState(item.estado) }}</span>
          </button>
        } @empty {
          <p class="muted small">Aún no tienes propuestas guardadas.</p>
        }
      </aside>

      <main>
        @if (!proposal()) {
          <section class="card">
            <div class="steps"><span class="active">1 · Fotografía</span><span>2 · Servicios</span><span>3 · Propuesta</span></div>
            <h2>Sube una fotografía real del espacio</h2>
            <p class="muted">JPG, PNG o WEBP, máximo 5 MB. Se guarda de forma privada en el servidor y no se envía a Gemini hasta que autorices el análisis.</p>
            @if (auth.isStaff()) {
              <div class="field"><label class="req">Empresa</label><select name="company" [(ngModel)]="companyId" required><option [ngValue]="null">— Selecciona una empresa —</option>@for (company of companies(); track company.id) { <option [ngValue]="company.id">{{ company.razon_social }}</option> }</select></div>
            }
            <div class="dropzone" [class.dragging]="dragging()" (dragover)="dragOver($event)" (dragleave)="dragging.set(false)" (drop)="drop($event)">
              @if (photoUrl()) {
                <img class="photo-preview" [src]="photoUrl()" alt="Vista previa de la fotografía seleccionada">
              } @else {
                <div class="upload-mark" aria-hidden="true">↑</div>
                <b>Arrastra una fotografía aquí</b>
                <span class="muted">o selecciónala desde tu dispositivo</span>
              }
              <input #photoInput class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" (change)="pick($event)">
              <button type="button" (click)="photoInput.click()">Seleccionar fotografía</button>
            </div>
            @if (photo()) {
              <div class="row file-row"><span>{{ photo()?.name }} · {{ sizeLabel(photo()!.size) }}</span><button type="button" class="link" (click)="removePhoto()">Quitar</button></div>
            }
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            @if (busy() === 'upload') {
              <div class="progress"><div [style.width.%]="uploadProgress()"></div></div>
              <p class="small muted">Guardando fotografía de forma segura… {{ uploadProgress() }}%</p>
            }
            <div class="row actions"><button class="primary" type="button" [disabled]="!photo() || (auth.isStaff() && !companyId) || !!busy()" (click)="upload()">{{ busy() === 'upload' ? 'Guardando…' : 'Continuar con esta fotografía' }}</button></div>
          </section>
        } @else {
          <div class="card">
            <div class="steps">
              <button type="button" [class.active]="stage() === 'photo'" (click)="stage.set('photo')">1 · Fotografía</button>
              <button type="button" [class.active]="stage() === 'services'" (click)="stage.set('services')">2 · Servicios</button>
              <button type="button" [class.active]="stage() === 'result'" (click)="stage.set('result')">3 · Propuesta</button>
            </div>
            <div class="row">
              <div><h2>Propuesta #{{ proposal()?.id }}</h2><p class="muted small">Fotografía: {{ proposal()?.fotografia_nombre }}</p></div>
              <span class="spacer"></span><span class="badge">{{ labelState(proposal()?.estado) }}</span>
            </div>
          </div>

          @if (stage() === 'photo') {
            <section class="card">
              <h2>Fotografía guardada</h2>
              @if (originalUrl()) { <img class="saved-photo" [src]="originalUrl()" alt="Fotografía original del espacio"> }
              <p class="muted small">La fotografía se mantiene privada y solo es accesible para usuarios autorizados de tu empresa.</p>
              @if (!proposal()?.solicitud_id) {
                <button type="button" class="danger" [disabled]="!!busy()" (click)="deleteProposal()">Eliminar propuesta y elegir otra fotografía</button>
              }
              <div class="row actions"><button type="button" class="primary" (click)="stage.set('services')">Continuar a servicios</button></div>
            </section>
          }

          @if (stage() === 'services') {
            <section class="card">
              <h2>¿Qué adecuaciones necesitas?</h2>
              <p class="muted">Marca qué quieres que la IA agregue a la fotografía: panel decorativo, cámara, techo PVC, puntos eléctricos y otros servicios. La IA aplicará solo lo que selecciones. Los precios base son referencias en COP; las adecuaciones requieren validar medidas y materiales para cotizar.</p>
              <div class="service-grid">
                @for (option of catalog()?.opciones || []; track option.clave) {
                  <article class="service-card" [class.selected]="selected[option.clave]">
                    <label class="choice"><input type="checkbox" [checked]="!!selected[option.clave]" (change)="toggleOption(option, $event)"><span><b>{{ option.pregunta }}</b><small>{{ option.nombre }}</small>
                      @if (option.catalogo) { <small>Catálogo: {{ option.catalogo.codigo }} · {{ fmtMoney(option.catalogo.precio_base) }} / {{ option.catalogo.unidad }}</small> }
                      @else { <small>Revisión y cotización manual</small> }
                    </span></label>
                    @if (selected[option.clave]) {
                      <div class="field"><label [for]="'spec-' + option.clave">Especificaciones</label><textarea [id]="'spec-' + option.clave" [name]="'spec-' + option.clave" [(ngModel)]="selected[option.clave].especificaciones" [placeholder]="option.especificacionesAyuda" maxlength="400" rows="2"></textarea></div>
                    }
                  </article>
                }
              </div>
              @if (catalogExtras().length) {
                <h3 class="section-title">Otros servicios disponibles en el catálogo</h3>
                <div class="service-grid">
                  @for (item of catalogExtras(); track item.id) {
                    <article class="service-card" [class.selected]="selected['CATALOGO_' + item.id]">
                      <label class="choice"><input type="checkbox" [checked]="!!selected['CATALOGO_' + item.id]" (change)="toggleCatalog(item, $event)"><span><b>{{ item.nombre }}</b><small>{{ item.codigo }} · {{ item.linea }}</small><small>{{ fmtMoney(item.precio_base) }} / {{ item.unidad }}</small><small>{{ item.descripcion }}</small></span></label>
                      @if (selected['CATALOGO_' + item.id]) {
                        <div class="field"><label [for]="'spec-catalog-' + item.id">Especificaciones</label><textarea [id]="'spec-catalog-' + item.id" [name]="'spec-catalog-' + item.id" [(ngModel)]="selected['CATALOGO_' + item.id].especificaciones" maxlength="400" rows="2"></textarea></div>
                      }
                    </article>
                  }
                </div>
              }
              <div class="field"><label for="customer-notes">Observaciones del espacio (opcional)</label><textarea id="customer-notes" name="customer-notes" [(ngModel)]="observaciones" maxlength="1000" rows="3" placeholder="Indica qué deseas conservar o algún requisito relevante. No incluyas información personal."></textarea></div>
              <label class="consent"><input type="checkbox" [(ngModel)]="consent" name="gemini-consent"><span>Autorizo enviar esta fotografía y las especificaciones seleccionadas a Google Gemini para analizar el espacio. Evitaré incluir personas, documentos u otros datos personales visibles.</span></label>
              <div class="manual-box">
                <h3>Continuar sin IA (modo manual)</h3>
                <p class="muted small">No se envía nada a ningún proveedor de IA. Tu propuesta se guarda con los servicios marcados y lo que escribas aquí; el equipo la revisa al cotizar. No genera imagen.</p>
                <div class="field"><label for="manual-desc" class="req">Describe la adecuación</label><textarea id="manual-desc" name="manual-desc" [(ngModel)]="manualDescripcion" maxlength="500" rows="3" placeholder="Ej.: Techo PVC blanco en la sala con luces LED empotradas y panel decorativo en la pared principal."></textarea><small class="muted">{{ manualDescripcion.length }}/500 · mínimo 10 caracteres</small></div>
                <div class="field"><label for="manual-mat">Materiales o acabados deseados (opcional, uno por línea, máx. 6)</label><textarea id="manual-mat" name="manual-mat" [(ngModel)]="manualMateriales" rows="2" placeholder="PVC blanco mate&#10;Perfilería de aluminio"></textarea></div>
              </div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p>
                <p class="notice warning" role="status">¿La IA no respondió? Puedes continuar con <b>Guardar propuesta manual</b>: no depende de la IA.</p> }
              @if (info()) { <p class="notice success" role="status">{{ info() }}</p> }
              @if (busy() === 'analysis') { <p class="working" role="status">Analizando la fotografía con Gemini…</p> }
              <div class="row actions">
                <button type="button" (click)="stage.set('photo')">Volver a fotografía</button>
                <button type="button" [disabled]="!selectedCount() || manualDescripcion.trim().length < 10 || !!busy()" (click)="saveManual()">{{ busy() === 'manual' ? 'Guardando…' : 'Guardar propuesta manual (sin IA)' }}</button>
                <button class="primary" type="button" [disabled]="!selectedCount() || !consent || configured() !== true || !!busy()" (click)="analyze()">{{ busy() === 'analysis' ? 'Analizando…' : 'Analizar espacio y servicios' }}</button>
              </div>
            </section>
          }

          @if (stage() === 'result') {
            <section class="card">
              <div class="row"><h2>Propuesta de renovación</h2><span class="spacer"></span><span class="badge">{{ isManual() ? 'Propuesta manual' : 'Vista conceptual' }}</span></div>
              @if (proposal()?.analisis; as analysis) {
                <div class="analysis">
                  <h3>Descripción del espacio</h3><p>{{ analysis.descripcion_espacio }}</p>
                  @if (analysis.elementos_visibles?.length) { <p class="small"><b>Elementos visibles:</b> {{ analysis.elementos_visibles.join(' · ') }}</p> }
                  <h3>Adecuaciones solicitadas</h3><p>{{ analysis.adecuaciones }}</p>
                  @if (proposal()?.estado === 'ANALIZADA' && proposal()?.versiones?.length) {
                    <p class="notice warning">Los cambios actuales aún no tienen una imagen generada. La versión que se muestra abajo corresponde a una generación anterior.</p>
                  }
                </div>
                @if (activeVersion(); as version) {
                  @if (appliedServices(version).length) {
                    <h3>Servicios aplicados</h3>
                    <ul>@for (item of appliedServices(version); track item.clave) { <li><b>{{ item.nombre }}</b>{{ item.especificaciones ? ' · ' + item.especificaciones : '' }}</li> }</ul>
                  }
                  <div class="row version-row">
                    <span>Versiones guardadas:</span>
                    @for (item of proposal()?.versiones || []; track item.id) {
                      <button type="button" [class.version-active]="activeVersionId() === item.id" (click)="showVersion(item)">{{ item.numero }} · {{ fmt(item.creado_en) }}</button>
                    }
                  </div>
                  @if (originalUrl() && generatedUrl()) {
                    <div class="compare">
                      <img class="compare-base" [src]="originalUrl()" alt="Antes: fotografía original">
                      <img class="compare-after" [src]="generatedUrl()" [style.clip-path]="'inset(0 0 0 ' + split + '%)'" alt="Después: propuesta conceptual generada por IA">
                      <span class="compare-label left">Antes</span><span class="compare-label right">Después</span>
                    </div>
                    <div class="field slider"><label for="compare-slider">Desliza para comparar</label><input id="compare-slider" name="compare-slider" type="range" min="0" max="100" [(ngModel)]="split"></div>
                  } @else {
                    <div class="empty-result"><b>La imagen todavía no se ha generado.</b><span>El análisis está listo; genera una propuesta cuando la IA esté configurada.</span></div>
                  }
                } @else {
                  @if (proposal()?.servicios?.length) {
                    <h3>Servicios seleccionados</h3>
                    <ul>@for (item of proposal()?.servicios || []; track item.clave) { <li><b>{{ item.nombre }}</b>{{ item.especificaciones ? ' · ' + item.especificaciones : '' }}</li> }</ul>
                  }
                  @if (isManual()) {
                    <div class="empty-result"><b>Propuesta manual guardada.</b><span>No incluye imagen generada por IA. Puedes solicitar la cotización: el equipo revisará tu descripción y la fotografía original.</span></div>
                  } @else {
                    <div class="empty-result"><b>El análisis está listo.</b><span>La propuesta visual solo se mostrará cuando el proveedor de IA devuelva una imagen válida.</span></div>
                  }
                }
                @if (materials(activeVersion(), analysis).length) { <h3>Materiales sugeridos</h3><ul>@for (item of materials(activeVersion(), analysis); track $index) { <li>{{ item }}</li> }</ul> }
                @if (observations(activeVersion(), analysis).length) { <h3>Requiere inspección técnica</h3><ul>@for (item of observations(activeVersion(), analysis); track $index) { <li>{{ item }}</li> }</ul> }
                @if (recommendations(activeVersion(), analysis).length) {
                  <h3>Servicios complementarios del catálogo</h3>
                  <div class="recommendations">
                    @for (item of recommendations(activeVersion(), analysis); track item.codigo_servicio) {
                      <div><b>{{ catalogName(item.codigo_servicio) }}</b><p>{{ item.motivo }}</p>
                        @if (!hasCatalogCode(item.codigo_servicio)) { <button type="button" class="link" (click)="addRecommendation(item.codigo_servicio)">Agregar a servicios</button> }
                      </div>
                    }
                  </div>
                }
              } @else {
                <p class="muted">Selecciona tus servicios y analiza la fotografía para generar una propuesta.</p>
              }
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              @if (info()) { <p class="notice success" role="status">{{ info() }}</p> }
              @if (busy() === 'generation') { <p class="working" role="status">La IA está editando la fotografía original. Esto puede tardar un momento…</p> }
              <p class="disclaimer">La imagen es una propuesta conceptual. No representa planos técnicos, medidas verificadas, condiciones estructurales ni una cotización definitiva.</p>
              @if (proposal()?.analisis) {
                <label class="consent"><input type="checkbox" [(ngModel)]="consent" name="gemini-consent-result"><span>{{ isManual() ? 'Opcional: si la IA está disponible y quieres intentar ver una imagen, autorizo' : 'Autorizo' }} enviar la fotografía original y las especificaciones actuales al proveedor de IA configurado para generar esta versión.</span></label>
              }
              <div class="row actions">
                <button type="button" (click)="editServices()" [disabled]="!!busy()">Cambiar servicios o especificaciones</button>
                @if (proposal()?.analisis) {
                  <button class="primary" type="button" [disabled]="configured() !== true || !consent || !!busy()" (click)="generate()">{{ busy() === 'generation' ? 'Generando…' : (proposal()?.versiones?.length ? 'Generar nueva versión' : 'Generar propuesta visual') }}</button>
                }
                @if (proposal()?.estado === 'LISTA' || (proposal()?.estado === 'ANALIZADA' && isManual())) {
                  <button type="button" class="quote" [disabled]="!!busy()" (click)="requestQuote()">{{ proposal()?.estado === 'LISTA' ? 'Solicitar cotización con la última versión' : 'Solicitar cotización de esta propuesta manual' }}</button>
                }
              </div>
            </section>
          }
          @if (error() && stage() !== 'photo' && stage() !== 'services' && stage() !== 'result') { <p class="error">{{ error() }}</p> }
        }
      </main>
    </div>
  `,
  styleUrl: './space-designer.css',
})
export class SpaceDesigner implements OnInit, OnDestroy {
  private api = inject(Api);
  auth = inject(Auth);
  private router = inject(Router);

  proposals = signal<any[]>([]);
  companies = signal<any[]>([]);
  catalog = signal<Catalog | null>(null);
  proposal = signal<Proposal | null>(null);
  configured = signal<boolean | null>(null);
  stage = signal<'photo' | 'services' | 'result'>('photo');
  photo = signal<File | null>(null);
  photoUrl = signal('');
  originalUrl = signal('');
  generatedUrl = signal('');
  activeVersionId = signal<number | null>(null);
  dragging = signal(false);
  busy = signal('');
  uploadProgress = signal(0);
  error = signal('');
  info = signal('');
  listError = signal('');
  split = 50;
  consent = false;
  observaciones = '';
  manualDescripcion = '';
  manualMateriales = '';
  companyId: number | null = null;
  selected: Record<string, SelectedService> = {};
  fmt = fmtDateTime;
  fmtMoney = fmtMoney;

  async ngOnInit() {
    try {
      const [catalog, state] = await Promise.all([
        this.api.get<Catalog>('/ia/espacios/catalogo'),
        this.api.get<{ configurada: boolean }>('/ia/estado'),
      ]);
      this.catalog.set(catalog);
      this.configured.set(state.configurada);
      if (this.auth.isStaff()) this.companies.set((await this.api.get<any>('/empresas', { size: 200, activo: 'true' })).data);
      await this.refreshList();
    } catch (error) {
      this.listError.set(errMsg(error));
    }
  }

  ngOnDestroy() { this.releaseImages(); }

  newProposal() {
    this.releaseImages();
    this.photo.set(null);
    this.photoUrl.set('');
    this.originalUrl.set('');
    this.generatedUrl.set('');
    this.proposal.set(null);
    this.stage.set('photo');
    this.selected = {};
    this.observaciones = '';
    this.manualDescripcion = '';
    this.manualMateriales = '';
    this.consent = false;
    this.error.set('');
    this.info.set('');
    this.split = 50;
  }

  async refreshList() {
    try {
      this.proposals.set(await this.api.get<any[]>('/ia/espacios'));
      this.listError.set('');
    } catch (error) {
      this.listError.set(errMsg(error));
    }
  }

  dragOver(event: DragEvent) { event.preventDefault(); this.dragging.set(true); }
  drop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setPhoto(file);
  }
  pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setPhoto(file);
    input.value = '';
  }
  setPhoto(file: File) {
    this.error.set('');
    if (!IMAGE_TYPES.has(file.type)) { this.error.set('El archivo debe ser JPG, PNG o WEBP.'); return; }
    if (file.size > MAX_FILE_BYTES) { this.error.set('La fotografía no puede superar 5 MB.'); return; }
    if (this.photoUrl()) URL.revokeObjectURL(this.photoUrl());
    this.photo.set(file);
    this.photoUrl.set(URL.createObjectURL(file));
  }
  removePhoto() {
    if (this.photoUrl()) URL.revokeObjectURL(this.photoUrl());
    this.photo.set(null);
    this.photoUrl.set('');
    this.error.set('');
  }
  sizeLabel(bytes: number) { return `${(bytes / 1024).toFixed(0)} KB`; }

  async upload() {
    const file = this.photo();
    if (!file) return;
    this.busy.set('upload');
    this.error.set('');
    this.uploadProgress.set(0);
    try {
      const proposal = await this.api.uploadPhoto<Proposal>(
        '/ia/espacios',
        file,
        (value) => this.uploadProgress.set(value),
        this.auth.isStaff() ? { empresa_id: this.companyId } : undefined,
      );
      this.proposal.set(proposal);
      this.stage.set('services');
      this.selected = {};
      this.consent = false;
      this.observaciones = '';
      this.manualDescripcion = '';
      this.manualMateriales = '';
      await this.refreshList();
      await this.loadImages(proposal.id, null);
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  toggleOption(option: DesignOption, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (this.selectedCount() >= 6) {
        (event.target as HTMLInputElement).checked = false;
        this.error.set('Puedes seleccionar hasta seis servicios por propuesta.');
        return;
      }
      this.selected[option.clave] = { clave: option.clave, especificaciones: '' };
    } else delete this.selected[option.clave];
    this.error.set('');
  }
  toggleCatalog(item: CatalogService, event: Event) {
    const key = `CATALOGO_${item.id}`;
    if ((event.target as HTMLInputElement).checked) {
      if (this.selectedCount() >= 6) {
        (event.target as HTMLInputElement).checked = false;
        this.error.set('Puedes seleccionar hasta seis servicios por propuesta.');
        return;
      }
      this.selected[key] = { clave: 'CATALOGO', servicio_id: item.id, especificaciones: '' };
    } else delete this.selected[key];
    this.error.set('');
  }
  catalogExtras() {
    const mapped = new Set((this.catalog()?.opciones || []).map((option) => option.catalogo?.id).filter(Boolean));
    return (this.catalog()?.servicios || []).filter((item) => !mapped.has(item.id));
  }
  selectedCount() { return Object.keys(this.selected).length; }
  payloadServices() { return Object.values(this.selected); }

  async analyze() {
    const proposal = this.proposal();
    if (!proposal || !this.consent || !this.selectedCount()) return;
    this.busy.set('analysis');
    this.error.set('');
    this.info.set('');
    try {
      const updated = await this.api.post<Proposal>(`/ia/espacios/${proposal.id}/analizar`, {
        confirmar_envio: true,
        servicios: this.payloadServices(),
        observaciones: this.observaciones,
      });
      this.proposal.set(updated);
      this.restoreSelection(updated.servicios || []);
      this.observaciones = updated.observaciones_cliente || '';
      this.activeVersionId.set(updated.versiones[0]?.id ?? null);
      this.stage.set('result');
      await this.refreshList();
      if (updated.versiones[0]) await this.loadImages(updated.id, updated.versiones[0].id);
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  /** ¿La propuesta abierta fue elaborada a mano (sin análisis de IA)? */
  isManual() { return this.proposal()?.analisis?.modo === 'MANUAL'; }

  private restoreManual(detail: Proposal) {
    if (detail.analisis?.modo === 'MANUAL') {
      this.manualDescripcion = detail.analisis.adecuaciones || '';
      this.manualMateriales = (detail.analisis.materiales_sugeridos || []).join('\n');
    }
  }

  /** Modo manual: guarda servicios y descripción sin llamar a la IA. Sirve cuando la IA no está configurada o falla. */
  async saveManual() {
    const proposal = this.proposal();
    if (!proposal || !this.selectedCount() || this.manualDescripcion.trim().length < 10) return;
    this.busy.set('manual');
    this.error.set('');
    this.info.set('');
    try {
      const materiales = this.manualMateriales.split('\n').map((item) => item.trim()).filter(Boolean);
      const updated = await this.api.post<Proposal>(`/ia/espacios/${proposal.id}/manual`, {
        servicios: this.payloadServices(),
        descripcion: this.manualDescripcion.trim(),
        observaciones: this.observaciones,
        materiales,
      });
      this.proposal.set(updated);
      this.restoreSelection(updated.servicios || []);
      this.observaciones = updated.observaciones_cliente || '';
      this.restoreManual(updated);
      this.activeVersionId.set(updated.versiones[0]?.id ?? null);
      this.stage.set('result');
      this.info.set('Propuesta manual guardada. Puedes solicitar la cotización.');
      await this.refreshList();
      await this.loadImages(updated.id, updated.versiones[0]?.id ?? null);
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  async generate() {
    const proposal = this.proposal();
    if (!proposal || !this.consent) return;
    this.busy.set('generation');
    this.error.set('');
    this.info.set('');
    try {
      await this.api.post(`/ia/espacios/${proposal.id}/versiones`, { confirmar_envio: true });
      await this.openProposal(proposal.id);
      this.stage.set('result');
      await this.refreshList();
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  async openProposal(id: number) {
    this.error.set('');
    this.info.set('');
    try {
      const detail = await this.api.get<Proposal>(`/ia/espacios/${id}`);
      this.proposal.set(detail);
      this.restoreSelection(detail.servicios || []);
      this.observaciones = detail.observaciones_cliente || '';
      this.restoreManual(detail);
      this.consent = false;
      const latest = detail.versiones?.[0];
      this.activeVersionId.set(latest?.id ?? null);
      this.stage.set(detail.analisis ? 'result' : detail.estado === 'BORRADOR' ? 'services' : 'photo');
      await this.loadImages(id, latest?.id ?? null);
    } catch (error) {
      this.error.set(errMsg(error));
    }
  }

  restoreSelection(items: SelectedService[]) {
    this.selected = {};
    for (const item of items) {
      const key = item.clave.startsWith('CATALOGO_') ? item.clave : item.clave;
      this.selected[key] = { clave: item.clave.startsWith('CATALOGO_') ? 'CATALOGO' : item.clave, servicio_id: item.servicio_id || undefined, especificaciones: item.especificaciones || '' };
    }
  }

  async showVersion(version: any) {
    const proposal = this.proposal();
    if (!proposal) return;
    this.activeVersionId.set(version.id);
    this.error.set('');
    try { await this.loadImages(proposal.id, version.id); }
    catch (error) { this.error.set(errMsg(error)); }
  }

  activeVersion() {
    const versions = this.proposal()?.versiones || [];
    return versions.find((item) => item.id === this.activeVersionId()) || versions[0] || null;
  }
  appliedServices(version: any) { return version?.servicios || this.proposal()?.servicios || []; }
  materials(version: any, analysis: any) { return version?.materiales || analysis.materiales_sugeridos || []; }
  observations(version: any, analysis: any) { return version?.observaciones || analysis.observaciones || []; }
  recommendations(version: any, analysis: any) { return version?.recomendaciones || analysis.recomendaciones || []; }

  async loadImages(id: number, versionId: number | null) {
    const [original, generated] = await Promise.all([
      this.api.blob(`/ia/espacios/${id}/fotografia`),
      versionId ? this.api.blob(`/ia/espacios/${id}/versiones/${versionId}/imagen`) : Promise.resolve(null),
    ]);
    this.setObjectUrl(this.originalUrl, original);
    this.setObjectUrl(this.generatedUrl, generated);
  }

  private setObjectUrl(target: ReturnType<typeof signal<string>>, blob: Blob | null) {
    if (target()) URL.revokeObjectURL(target());
    target.set(blob ? URL.createObjectURL(blob) : '');
  }
  private releaseImages() {
    for (const image of [this.photoUrl(), this.originalUrl(), this.generatedUrl()]) if (image) URL.revokeObjectURL(image);
  }

  editServices() { this.stage.set('services'); this.error.set(''); }

  catalogName(code: string) {
    return this.catalog()?.servicios.find((item) => item.codigo === code)?.nombre || code;
  }
  hasCatalogCode(code: string) {
    const row = this.catalog()?.servicios.find((item) => item.codigo === code);
    return !!row && !!this.selected[`CATALOGO_${row.id}`];
  }
  addRecommendation(code: string) {
    const row = this.catalog()?.servicios.find((item) => item.codigo === code);
    if (!row) return;
    const key = `CATALOGO_${row.id}`;
    if (!this.selected[key]) {
      if (this.selectedCount() >= 6) { this.error.set('Puedes seleccionar hasta seis servicios por propuesta.'); this.stage.set('services'); return; }
      this.selected[key] = { clave: 'CATALOGO', servicio_id: row.id, especificaciones: '' };
    }
    this.stage.set('services');
    this.error.set('');
    this.info.set('Añadiste un servicio recomendado. Analiza nuevamente para incluirlo en una nueva versión.');
  }

  async requestQuote() {
    const proposal = this.proposal();
    if (!proposal) return;
    this.busy.set('quote');
    this.error.set('');
    try {
      const result = await this.api.post<{ solicitud_id: number }>(`/ia/espacios/${proposal.id}/cotizacion`);
      await this.refreshList();
      await this.router.navigateByUrl(`/solicitudes/${result.solicitud_id}`);
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  async deleteProposal() {
    const proposal = this.proposal();
    if (!proposal) return;
    this.busy.set('delete');
    this.error.set('');
    try {
      await this.api.delete(`/ia/espacios/${proposal.id}`);
      this.proposal.set(null);
      this.stage.set('photo');
      this.removePhoto();
      this.releaseImages();
      await this.refreshList();
    } catch (error) {
      this.error.set(errMsg(error));
    } finally { this.busy.set(''); }
  }

  labelState(state?: string) {
    return ({ BORRADOR: 'Borrador', ANALIZADA: 'Analizada', LISTA: 'Lista', SOLICITUD_CREADA: 'Cotización solicitada' } as Record<string, string>)[state || ''] || state || '';
  }
}
