import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { MENU_HELP } from '../core/menu-help';

type Role = 'CLIENTE' | 'ADMIN' | 'TECNICO';
interface Topic { id: string; title: string; summary: string; steps: string[]; tip?: string; link?: string; linkLabel?: string; }

const TOPICS: Record<Role, Topic[]> = {
  CLIENTE: [
    { id: 'c-registro', title: 'Crear mi cuenta e ingresar', summary: 'Regístrese una sola vez con su empresa o como persona natural.',
      steps: ['En la página principal pulse «Crear cuenta».', 'Elija si es empresa o persona, escriba NIT/documento, su nombre, correo y una contraseña de mínimo 10 caracteres.', 'Acepte el tratamiento de datos y pulse «Crear cuenta»: le llegará un correo con un enlace.', 'Abra el enlace para activar su cuenta (vence en 48 horas); sin activarla no podrá ingresar.', 'La próxima vez use «Iniciar sesión». Si olvida la clave use «¿Olvidó su contraseña?».'],
      tip: 'Use el correo que dio a su invitación si recibió un bono de cortesía.' },
    { id: 'c-solicitud', title: 'Pedir un servicio (nueva solicitud)', summary: 'Cuéntenos qué necesita; nosotros preparamos la cotización.',
      steps: ['Abra «Nueva solicitud» en el menú.', 'Elija los servicios del catálogo (soporte, redes, cámaras) y la sede.', 'Describa el problema y, si desea, adjunte fotos.', 'Envíe. En «Seguimiento» verá el estado: recibida, en revisión, cotizada.'],
      link: '/solicitudes/nueva', linkLabel: 'Ir a Nueva solicitud' },
    { id: 'c-consulta', title: 'Solo consultar, sin cotización', summary: 'Pregunte lo que quiera sin compromiso.',
      steps: ['En «Nueva solicitud» elija «Solo consultar (sin cotización ni compromiso)».', 'Escriba su pregunta y envíe: no se genera cotización ni visita.', 'Cuando el equipo responda verá la respuesta en «Seguimiento».', 'Si luego quiere el servicio, haga una nueva solicitud de servicio.'], link: '/solicitudes/nueva', linkLabel: 'Hacer una consulta' },
    { id: 'c-cotizacion', title: 'Revisar y aprobar una cotización', summary: 'Aquí decide si acepta el precio antes de que se haga el trabajo.',
      steps: ['Entre a «Cotizaciones» y abra la que está en estado ENVIADA.', 'Revise servicios, cantidades, IVA y total en pesos colombianos (COP).', 'Si tiene un código de bono, escríbalo en «Aplicar código» y verá el descuento.', 'Pulse Aprobar o Rechazar. Si tiene dudas pulse «Solo consultar»: envía su pregunta y la cotización sigue pendiente. También puede descargar el PDF.'],
      tip: 'Un bono de un solo uso se reserva al aplicarlo y se libera si la cotización es rechazada.', link: '/cotizaciones', linkLabel: 'Ir a Cotizaciones' },
    { id: 'c-bono', title: 'Canjear mi bono de cortesía', summary: 'El bono regala un mantenimiento preventivo de computador.',
      steps: ['Inicie sesión (o cree su cuenta).', 'Abra «Beneficios» y escriba su código AXO-… para reclamarlo.', 'Cree una solicitud que incluya «Mantenimiento de computadores».', 'Cuando reciba la cotización, aplique el mismo código: el servicio queda con descuento hasta su valor.'],
      tip: 'Cada bono sirve para un solo uso y tiene fecha de vencimiento.', link: '/beneficios', linkLabel: 'Ir a Beneficios' },
    { id: 'c-seguimiento', title: 'Seguir mis servicios y equipos', summary: 'Consulte órdenes, historial, equipos y mantenimientos programados.',
      steps: ['«Servicios realizados» muestra las órdenes, su estado y evidencias.', '«Equipos» lista sus computadores, impresoras y cámaras.', '«Mantenimientos» muestra las visitas preventivas programadas por su plan.', '«Historial» reúne todo lo ocurrido por equipo.'], link: '/ordenes', linkLabel: 'Ir a Servicios realizados' },
    { id: 'c-disenador', title: 'Diseñador de espacios y Asistente IA', summary: 'Ideas de distribución de red/cámaras y respuestas rápidas.',
      steps: ['En «Diseñador de espacios» describa su local o suba una foto del lugar.', 'Revise la propuesta (modo IA o manual) y conviértala en solicitud.', 'El botón flotante AXORA responde dudas sobre la plataforma.'],
      tip: 'Las sugerencias de IA son orientativas; el técnico confirma en sitio.', link: '/disenador-espacios', linkLabel: 'Abrir el Diseñador' },
  ],
  ADMIN: [
    { id: 'a-dash', title: 'Dashboard y operación diaria', summary: 'Visión de solicitudes, cotizaciones y órdenes pendientes.',
      steps: ['Empiece cada día por el Dashboard: pendientes por atender.', 'Atienda primero las solicitudes nuevas.', 'Siga el flujo: Solicitud → Cotización → Orden de servicio → Historial.'], link: '/dashboard', linkLabel: 'Ir al Dashboard' },
    { id: 'a-listas', title: 'Buscar y filtrar listados', summary: 'Todas las listas comparten buscador, filtros y paginación de 10.',
      steps: ['Escriba en el buscador: se filtra solo tras una breve pausa.', 'Use las listas «Todos…» para filtrar por estado, empresa o plan; los filtros activos se resaltan.', 'Pulse «Limpiar filtros (N)» para volver a ver todo.', 'Use los números de página o «‹ ›» para avanzar; abajo ve «Mostrando a–b de N».'], link: '/contratos', linkLabel: 'Probar en Contratos' },
    { id: 'a-empresas', title: 'Empresas y usuarios', summary: 'Alta de clientes, sedes y cuentas.',
      steps: ['«Empresas»: cree o edite empresas, sedes y contactos. Las que se registran solas aparecen aquí.', '«Usuarios»: cree cuentas y asigne rol (CLIENTE, TECNICO, ADMIN). Deje la contraseña vacía para enviar una invitación por correo; la persona crea su clave al activar. Use «Reenviar invitación» si no le llegó.', 'Desactive en lugar de borrar para conservar el historial.'], link: '/empresas', linkLabel: 'Ir a Empresas' },
    { id: 'a-cotizar', title: 'Cotizar y generar el PDF', summary: 'Convierta una solicitud en una cotización formal.',
      steps: ['Abra la solicitud y pulse «Crear cotización».', 'Agregue servicios y ajuste cantidades y precios.', 'Envíela al cliente; podrá descargar el PDF en COP.', 'Al aprobarla se genera la orden de servicio para el técnico.'], link: '/cotizaciones', linkLabel: 'Ir a Cotizaciones' },
    { id: 'a-planes', title: 'Planes y contratos', summary: 'Varios planes por varios servicios y empresas con plan activo.',
      steps: ['«Planes»: defina precio mensual, visitas al mes y los servicios incluidos.', '«Contratos»: asigne un plan a una empresa con fechas y estado (VIGENTE, SUSPENDIDO, VENCIDO, CANCELADO).', 'Filtre por empresa, plan o estado.', 'Un contrato vigente alimenta los mantenimientos preventivos programados.'],
      tip: 'No se permite un segundo contrato VIGENTE del mismo plan para la misma empresa.', link: '/planes', linkLabel: 'Ir a Planes' },
    { id: 'a-promos', title: 'Promociones y bonos de cortesía', summary: 'Cree códigos y autorice beneficiarios.',
      steps: ['«Promociones» → Nueva: nombre, código, tipo (porcentaje o valor), vigencia y cupo.', 'Restrinja a servicios concretos si el descuento no es para todo.', 'Agregue beneficiarios: cada uno recibe un código individual AXO-… de un solo uso.', 'Los bonos de cortesía se generan con el comando «npm run bonos:cortesia» y aparecen aquí.', 'Copie la invitación y envíela por un canal privado.'], link: '/promociones', linkLabel: 'Ir a Promociones' },
    { id: 'a-mant', title: 'Mantenimientos y técnicos', summary: 'Programe visitas preventivas y asígnelas.',
      steps: ['«Mantenimientos» → Nuevo: equipo, fecha, frecuencia y técnico.', 'El técnico lo ve en su lista y registra el resultado.', 'Revise vencidos desde el Dashboard.'], link: '/mantenimientos', linkLabel: 'Ir a Mantenimientos' },
  ],
  TECNICO: [
    { id: 't-ordenes', title: 'Mis órdenes asignadas', summary: 'Todo el trabajo de campo está en «Órdenes asignadas».',
      steps: ['Abra una orden para ver cliente, sede, servicios y notas.', 'Cambie el estado: En camino → En ejecución → Finalizada.', 'Registre lo hecho y adjunte fotos de evidencia.', 'Al finalizar queda en el historial del equipo.'], link: '/ordenes', linkLabel: 'Ir a mis órdenes' },
    { id: 't-mant', title: 'Mantenimientos preventivos', summary: 'Visitas programadas por plan.',
      steps: ['Abra «Mantenimientos» y elija uno PROGRAMADO.', 'Pulse «Iniciar» al llegar y complete el resultado al terminar.', 'Si el equipo necesita más trabajo, indíquelo para que administración cotice.'], link: '/mantenimientos', linkLabel: 'Ir a Mantenimientos' },
    { id: 't-ia', title: 'Propuestas de espacios y Asistente IA', summary: 'Apoyo para planear redes y cámaras.',
      steps: ['En «Propuestas de espacios» revise y ajuste lo propuesto por IA o manual.', 'Suba fotos del sitio para mejorar la propuesta.', 'Use el Asistente IA para consultar procedimientos.'], link: '/disenador-espacios', linkLabel: 'Abrir propuestas' },
  ],
};
const FAQ: { q: string; a: string }[] = [
  { q: '¿Olvidé mi contraseña?', a: 'En la pantalla de ingreso use «¿Olvidó su contraseña?» y siga el enlace que llegará a su correo.' },
  { q: '¿No me llega el correo de activación?', a: 'Revise spam. En la pantalla de ingreso use «Reenviar enlace de activación». Si usted es administrador, en Usuarios use «Reenviar invitación».' },
  { q: '¿Mi cuenta se bloqueó?', a: 'Tras varios intentos fallidos se bloquea unos minutos. Espere e intente de nuevo.' },
  { q: '¿Mi código de bono no funciona?', a: 'Verifique que lo escribió completo (AXO-…), que no esté vencido ni usado y que la cotización incluya el servicio del bono.' },
  { q: '¿Cómo cambio mi contraseña?', a: 'Entre a su perfil (nombre arriba a la derecha) y use «Cambiar contraseña».' },
];

@Component({
  selector: 'app-manual', standalone: true, imports: [FormsModule, RouterLink],
  styles: [`
    .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0} .tabs button{border-radius:999px} .tabs button.on{background:var(--brand-600);color:#fff;border-color:var(--brand-600)}
    .bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap} .bar input{max-width:360px;flex:1}
    .prog{height:8px;background:var(--surface-alt);border-radius:99px;overflow:hidden;min-width:140px;flex:0 0 160px} .prog i{display:block;height:100%;background:var(--brand-600)}
    .topic{border:1px solid var(--border,#e4def0);border-radius:12px;margin:10px 0;background:#fff} .topic>button.head{all:unset;display:flex;gap:10px;align-items:center;width:100%;padding:14px 16px;cursor:pointer;box-sizing:border-box}
    .topic .t{font-weight:700;color:var(--ink)} .topic .s{font-size:.88rem;color:#666} .topic .chev{margin-left:auto;transition:transform .2s} .topic.open .chev{transform:rotate(90deg)}
    .body{padding:0 16px 16px} .step{display:flex;gap:10px;align-items:flex-start;padding:6px 0} .step input{width:auto;margin-top:4px} .step.done span{text-decoration:line-through;color:#888}
    .tip{background:var(--surface-alt);border-left:4px solid #0AA9B8;padding:8px 12px;border-radius:6px;font-size:.9rem;margin:8px 0} .ok{color:#067987;font-weight:700}
    .faq{margin-top:22px} .faq details{border-bottom:1px solid #eee;padding:8px 0} .faq summary{cursor:pointer;font-weight:600}
  `],
  template: `
    <h1>Manual de usuario</h1>
    <p class="muted">Guía paso a paso de AXORA SOLUTIONS. Marque cada paso al completarlo para seguir su avance.</p>
    <div class="tabs" role="tablist" aria-label="Perfil">
      @for (r of roles; track r.k) { <button role="tab" [class.on]="role() === r.k" [attr.aria-selected]="role() === r.k" (click)="pick(r.k)">{{ r.label }}</button> }
    </div>
    <div class="bar">
      <input type="search" placeholder="Buscar en el manual… (ej. cotización, bono, filtros)" [ngModel]="q()" (ngModelChange)="q.set($event)" aria-label="Buscar en el manual">
      <div class="prog" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="percent()"></i></div>
      <span class="small">{{ doneCount() }}/{{ totalSteps() }} pasos · {{ percent() }}%</span>
      @if (doneCount() > 0) { <button class="ghost" (click)="reset()">Reiniciar avance</button> }
    </div>
    @for (t of visible(); track t.id) {
      <section class="topic" [class.open]="openId() === t.id">
        <button class="head" (click)="toggle(t.id)" [attr.aria-expanded]="openId() === t.id">
          <div><div class="t">{{ t.title }} @if (topicDone(t)) { <span class="ok">✓</span> }</div><div class="s">{{ t.summary }}</div></div><span class="chev">›</span>
        </button>
        @if (openId() === t.id) {
          <div class="body">
            @for (st of t.steps; track $index) {
              <label class="step" [class.done]="isDone(t.id, $index)"><input type="checkbox" [checked]="isDone(t.id, $index)" (change)="check(t.id, $index)"><span>{{ st }}</span></label>
            }
            @if (t.tip) { <div class="tip"><b>Consejo:</b> {{ t.tip }}</div> }
            @if (t.link) { <a [routerLink]="t.link" class="btn primary">{{ t.linkLabel }} →</a> }
          </div>
        }
      </section>
    } @empty { <p class="muted" style="margin-top:16px">No encontramos resultados para «{{ q() }}». Pruebe con otra palabra.</p> }
    <div class="faq"><h2>¿Para qué sirve cada sección del menú?</h2>
      @for (m of guide(); track m.path) { <details><summary>{{ m.label }}</summary><p>{{ m.para }}</p></details> }
    </div>
    <div class="faq"><h2>Preguntas frecuentes</h2>
      @for (f of faqs(); track f.q) { <details><summary>{{ f.q }}</summary><p>{{ f.a }}</p></details> }
    </div>`,
})
export class ManualPage {
  private auth = inject(Auth);
  roles = [{ k: 'CLIENTE' as Role, label: 'Soy cliente' }, { k: 'ADMIN' as Role, label: 'Administración' }, { k: 'TECNICO' as Role, label: 'Técnico' }];
  role = signal<Role>(this.auth.isStaff() ? 'ADMIN' : this.auth.isClient() ? 'CLIENTE' : 'TECNICO');
  q = signal(''); openId = signal<string | null>(null);
  private done = signal<Record<string, boolean>>(this.load());

  private norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  visible = computed(() => {
    const q = this.norm(this.q().trim());
    return TOPICS[this.role()].filter((t) => !q || this.norm([t.title, t.summary, t.tip ?? '', ...t.steps].join(' ')).includes(q));
  });
  faqs = computed(() => { const q = this.norm(this.q().trim()); return FAQ.filter((f) => !q || this.norm(f.q + f.a).includes(q)); });
  guide = computed(() => { const q = this.norm(this.q().trim()); const r = this.role(); return MENU_HELP[r].filter((m) => !q || this.norm(m.label + m.para).includes(q)); });
  totalSteps = computed(() => TOPICS[this.role()].reduce((n, t) => n + t.steps.length, 0));
  doneCount = computed(() => TOPICS[this.role()].reduce((n, t) => n + t.steps.filter((_, i) => this.done()[`${t.id}:${i}`]).length, 0));
  percent = computed(() => (this.totalSteps() ? Math.round((this.doneCount() / this.totalSteps()) * 100) : 0));

  pick(r: Role) { this.role.set(r); this.openId.set(null); }
  toggle(id: string) { this.openId.set(this.openId() === id ? null : id); }
  isDone = (id: string, i: number) => !!this.done()[`${id}:${i}`];
  topicDone = (t: Topic) => t.steps.every((_, i) => this.isDone(t.id, i));
  check(id: string, i: number) { const d = { ...this.done(), [`${id}:${i}`]: !this.isDone(id, i) }; this.done.set(d); this.save(d); }
  reset() { this.done.set({}); this.save({}); }
  private load(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem('axora.manual') || '{}'); } catch { return {}; } }
  private save(d: Record<string, boolean>) { try { localStorage.setItem('axora.manual', JSON.stringify(d)); } catch { /* sin almacenamiento */ } }
}
