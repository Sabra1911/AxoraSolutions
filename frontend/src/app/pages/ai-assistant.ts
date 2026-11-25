import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { errMsg } from '../core/fmt';

interface ChatMessage { rol: 'user' | 'assistant'; texto: string; }
interface ContextCounts { solicitudes?: number; cotizaciones?: number; servicios?: number; }

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <h1>Asistente IA</h1>
      <p class="muted">Gemini puede ayudar a clasificar solicitudes, sugerir diagnósticos y consultar información autorizada.</p>
      <p class="small"><b>Privacidad:</b> se ocultarán correos, teléfonos y secuencias numéricas identificables. No escribas nombres, direcciones ni otros datos personales. Las sugerencias requieren revisión humana.</p>
      @if (statusError()) { <p class="error">{{ statusError() }}</p> }
      @if (configured() === false) {
        <p class="error">La IA aún no está configurada. Añade GEMINI_API_KEY al archivo backend/.env y reinicia el backend.</p>
      }
    </div>

    @if (auth.can('solicitudes:create')) {
      <form class="card" (ngSubmit)="classify()" #classificationForm="ngForm">
        <h2>Clasificar solicitud</h2>
        <div class="grid g2">
          <div class="field"><label>Categoría actual</label><select name="classCategory" [(ngModel)]="classificationInput.categoria">
            <option value="SOPORTE_EQUIPOS">Soporte de equipos</option><option value="REDES">Redes</option><option value="CCTV">CCTV</option><option value="OTRO">Otro</option>
          </select></div>
          <div class="field"><label>Tipo de equipo (opcional)</label><input name="classEquipment" [(ngModel)]="classificationInput.equipo_tipo" maxlength="40"></div>
        </div>
        <div class="field"><label>Asunto</label><input name="classSubject" [(ngModel)]="classificationInput.asunto" required maxlength="200"></div>
        <div class="field"><label>Descripción</label><textarea name="classDescription" [(ngModel)]="classificationInput.descripcion" required maxlength="4000" rows="3"></textarea></div>
        @if (classifyError()) { <p class="error">{{ classifyError() }}</p> }
        <button class="primary" [disabled]="!configured() || classificationForm.invalid || classifying()">{{ classifying() ? 'Analizando…' : 'Sugerir categoría y prioridad' }}</button>
        @if (classification(); as result) {
          <div class="card">
            <b>{{ result.categoria.replace('_', ' ') }} · Prioridad {{ result.prioridad }}</b>
            <p>{{ result.explicacion }}</p>
          </div>
        }
      </form>
    }

    @if (auth.can('ordenes:execute')) {
      <form class="card" (ngSubmit)="diagnose()" #diagnosisForm="ngForm">
        <h2>Apoyo de diagnóstico</h2>
        <div class="grid g2">
          <div class="field"><label>Categoría</label><select name="diagnosisCategory" [(ngModel)]="diagnosisInput.categoria">
            <option value="SOPORTE_EQUIPOS">Soporte de equipos</option><option value="REDES">Redes</option><option value="CCTV">CCTV</option><option value="OTRO">Otro</option>
          </select></div>
          <div class="field"><label>Tipo de equipo (opcional)</label><input name="diagnosisEquipment" [(ngModel)]="diagnosisInput.equipo_tipo" maxlength="40"></div>
        </div>
        <div class="field"><label>Asunto</label><input name="diagnosisSubject" [(ngModel)]="diagnosisInput.asunto" required maxlength="200"></div>
        <div class="field"><label>Descripción del problema</label><textarea name="diagnosisDescription" [(ngModel)]="diagnosisInput.descripcion" required maxlength="4000" rows="3"></textarea></div>
        @if (diagnosisError()) { <p class="error">{{ diagnosisError() }}</p> }
        <button class="primary" [disabled]="!configured() || diagnosisForm.invalid || diagnosing()">{{ diagnosing() ? 'Preparando sugerencia…' : 'Sugerir diagnóstico' }}</button>
        @if (diagnosis(); as result) {
          <div class="card">
            <h3>Hipótesis</h3><p>{{ result.diagnostico }}</p>
            <h3>Verificaciones sugeridas</h3>
            <ol>@for (step of result.pasos; track $index) { <li>{{ step }}</li> }</ol>
            <h3>Respuesta para el cliente</h3><p>{{ result.respuesta_cliente }}</p>
            <p class="small muted">Valida la hipótesis antes de intervenir.</p>
          </div>
        }
      </form>
    }

    <section class="card">
      <h2>Consultar información</h2>
      <div class="card" style="max-height:360px;overflow:auto">
        @for (message of messages(); track $index) {
          <p><b>{{ message.rol === 'user' ? 'Tú' : 'Asistente' }}:</b> {{ message.texto }}</p>
        } @empty { <p class="muted">Pregunta por solicitudes, cotizaciones o servicios que tengas permiso para consultar.</p> }
      </div>
      <form (ngSubmit)="ask()" #chatForm="ngForm">
        <div class="field"><label>Tu pregunta</label><textarea name="question" [(ngModel)]="question" required maxlength="2000" rows="2"></textarea></div>
        @if (chatError()) { <p class="error">{{ chatError() }}</p> }
        @if (contextCounts(); as counts) { <p class="small muted">Contexto consultado: {{ counts.solicitudes || 0 }} solicitudes, {{ counts.cotizaciones || 0 }} cotizaciones y {{ counts.servicios || 0 }} servicios autorizados.</p> }
        <button class="primary" [disabled]="!configured() || chatForm.invalid || chatting()">{{ chatting() ? 'Consultando…' : 'Enviar pregunta' }}</button>
      </form>
    </section>
  `,
})
export class AiAssistant implements OnInit {
  api = inject(Api);
  auth = inject(Auth);

  configured = signal<boolean | null>(null);
  statusError = signal('');
  classificationInput = { categoria: 'SOPORTE_EQUIPOS', asunto: '', descripcion: '', equipo_tipo: '' };
  diagnosisInput = { categoria: 'SOPORTE_EQUIPOS', asunto: '', descripcion: '', equipo_tipo: '' };
  classification = signal<any>(null);
  diagnosis = signal<any>(null);
  classifying = signal(false);
  diagnosing = signal(false);
  classifyError = signal('');
  diagnosisError = signal('');
  question = '';
  messages = signal<ChatMessage[]>([]);
  contextCounts = signal<ContextCounts | null>(null);
  chatting = signal(false);
  chatError = signal('');

  async ngOnInit() {
    try {
      const state = await this.api.get<{ configurada: boolean }>('/ia/estado');
      this.configured.set(state.configurada);
    } catch (error) {
      this.statusError.set(errMsg(error));
    }
  }

  async classify() {
    this.classifying.set(true);
    this.classifyError.set('');
    this.classification.set(null);
    try {
      this.classification.set(await this.api.post('/ia/clasificar', this.classificationInput));
    } catch (error) {
      this.classifyError.set(errMsg(error));
    } finally {
      this.classifying.set(false);
    }
  }

  async diagnose() {
    this.diagnosing.set(true);
    this.diagnosisError.set('');
    this.diagnosis.set(null);
    try {
      this.diagnosis.set(await this.api.post('/ia/diagnostico', this.diagnosisInput));
    } catch (error) {
      this.diagnosisError.set(errMsg(error));
    } finally {
      this.diagnosing.set(false);
    }
  }

  async ask() {
    const pregunta = this.question.trim();
    if (!pregunta) return;
    this.chatting.set(true);
    this.chatError.set('');
    try {
      const historial = this.messages().slice(-8);
      const result = await this.api.post<{ respuesta: string; contexto: ContextCounts }>('/ia/chat', { pregunta, historial });
      this.messages.update((items) => [...items, { rol: 'user', texto: pregunta }, { rol: 'assistant', texto: result.respuesta }]);
      this.contextCounts.set(result.contexto);
      this.question = '';
    } catch (error) {
      this.chatError.set(errMsg(error));
    } finally {
      this.chatting.set(false);
    }
  }
}
