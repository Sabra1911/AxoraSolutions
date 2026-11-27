import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { errMsg } from '../core/fmt';

interface Msg { rol: 'user' | 'assistant'; texto: string; }
const WELCOME = '¡Hola! Soy AXORA, tu asistente tecnológico. Puedo ayudarte a entender los servicios o a consultar tus solicitudes y cotizaciones. No doy precios ni diagnósticos definitivos: eso lo confirma un profesional.';

/** Asistente AXORA: ventana de chat flotante conectada al backend (POST /api/ia/chat). La clave de IA nunca sale del servidor. */
@Component({
  selector: 'app-axora-assistant', standalone: true, imports: [FormsModule],
  template: `
    @if (auth.user()) {
      @if (open()) {
        <section class="panel" role="dialog" aria-label="Asistente AXORA">
          <header><img src="brand/axora-mascota.png" alt="" width="36" height="36"><div><b>AXORA</b><small>Asistente tecnológico</small></div>
            <button type="button" class="x" aria-label="Cerrar asistente" (click)="open.set(false)">×</button></header>
          <div class="msgs" #box aria-live="polite">
            <p class="bot">{{ welcome }}</p>
            @for (m of messages(); track $index) { <p [class]="m.rol === 'user' ? 'me' : 'bot'">{{ m.texto }}</p> }
            @if (busy()) { <p class="bot typing" role="status" aria-label="AXORA está respondiendo"><i></i><i></i><i></i></p> }
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          </div>
          <form (ngSubmit)="send()">
            <input name="q" [(ngModel)]="question" placeholder="Escribe tu pregunta…" maxlength="2000" autocomplete="off" [disabled]="busy()" aria-label="Tu pregunta">
            <button class="primary" type="submit" [disabled]="busy() || !question.trim()">{{ busy() ? '…' : 'Enviar' }}</button>
          </form>
        </section>
      }
      <button type="button" class="fab" [attr.aria-expanded]="open()" aria-label="Abrir asistente AXORA" (click)="toggle()">
        <img src="brand/axora-mascota.png" alt="" width="44" height="44">
        @if (!open() && !seen()) { <span class="bubble">¿Necesitas ayuda?</span> }
      </button>
    }`,
  styles: [`
    :host { position:fixed; right:18px; bottom:18px; z-index:90; display:flex; flex-direction:column; align-items:flex-end; gap:10px; }
    .fab { position:relative; width:60px; height:60px; border-radius:50%; border:2px solid var(--brand-600); background:#fff; padding:6px; cursor:pointer; box-shadow:0 6px 18px rgba(53,27,87,.3); display:grid; place-items:center; }
    .fab img { width:100%; height:100%; object-fit:contain; } .fab:hover { transform:translateY(-2px); }
    .bubble { position:absolute; right:68px; top:50%; transform:translateY(-50%); background:var(--brand-900); color:#fff; font-size:12px; white-space:nowrap; padding:6px 10px; border-radius:10px; }
    .panel { width:min(370px, calc(100vw - 28px)); height:min(500px, calc(100dvh - 120px)); background:#fff; border:1px solid var(--line); border-radius:16px; box-shadow:0 14px 40px rgba(53,27,87,.28); display:flex; flex-direction:column; overflow:hidden; }
    header { display:flex; align-items:center; gap:10px; background:var(--brand-600); color:#fff; padding:10px 12px; } header img { background:#fff; border-radius:50%; padding:3px; object-fit:contain; }
    header div { display:flex; flex-direction:column; line-height:1.2; flex:1; } header small { opacity:.85; font-size:11px; }
    .x { background:transparent; border:0; color:#fff; font-size:24px; line-height:1; cursor:pointer; padding:0 6px; }
    .msgs { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:8px; background:var(--surface-alt); }
    .msgs p { margin:0; padding:8px 11px; border-radius:12px; max-width:86%; font-size:13.5px; white-space:pre-wrap; overflow-wrap:anywhere; }
    .bot { background:#fff; border:1px solid var(--line); align-self:flex-start; } .me { background:var(--brand-600); color:#fff; align-self:flex-end; }
    .err { background:#fdecea; color:#8a1f11; align-self:stretch; max-width:100% !important; }
    .typing { display:flex; gap:4px; } .typing i { width:7px; height:7px; border-radius:50%; background:var(--brand-600); opacity:.4; animation:b 1s infinite; } .typing i:nth-child(2) { animation-delay:.15s; } .typing i:nth-child(3) { animation-delay:.3s; }
    @keyframes b { 50% { opacity:1; transform:translateY(-3px); } } @media (prefers-reduced-motion: reduce) { .typing i { animation:none; } }
    form { display:flex; gap:8px; padding:10px; border-top:1px solid var(--line); background:#fff; } form input { flex:1; min-width:0; }
  `],
})
export class AxoraAssistantComponent {
  auth = inject(Auth); private api = inject(Api);
  @ViewChild('box') box?: ElementRef<HTMLElement>;
  welcome = WELCOME; open = signal(false); seen = signal(this.readSeen()); busy = signal(false); error = signal('');
  messages = signal<Msg[]>([]); question = '';

  private readSeen() { try { return sessionStorage.getItem('axora.assistant.seen') === '1'; } catch { return false; } }
  toggle() {
    this.open.update((v) => !v); this.seen.set(true);
    try { sessionStorage.setItem('axora.assistant.seen', '1'); } catch { /* sin almacenamiento */ }
  }
  @HostListener('document:keydown.escape') onEsc() { if (this.open()) this.open.set(false); }
  private scroll() { setTimeout(() => { const e = this.box?.nativeElement; if (e) e.scrollTop = e.scrollHeight; }); }

  async send() {
    const pregunta = this.question.trim();
    if (!pregunta || this.busy()) return;
    this.busy.set(true); this.error.set('');
    const historial = this.messages().slice(-8);
    this.messages.update((m) => [...m, { rol: 'user', texto: pregunta }]); this.question = ''; this.scroll();
    try {
      const r = await this.api.post<{ respuesta: string }>('/ia/chat', { pregunta, historial });
      this.messages.update((m) => [...m, { rol: 'assistant', texto: r.respuesta }]);
    } catch (e) {
      // Sin respuesta simulada: se informa el motivo real y la plataforma sigue funcionando.
      this.error.set(`${errMsg(e)}. Puedes seguir usando la plataforma o crear una solicitud para que un profesional te atienda.`);
    } finally { this.busy.set(false); this.scroll(); }
  }
}
