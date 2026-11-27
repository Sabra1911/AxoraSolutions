import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { fmtDate, fmtMoney } from '../core/fmt';

const LINES: Record<string, { title: string; text: string }> = {
  SOPORTE_EQUIPOS: { title: 'Tecnología y equipos', text: 'Mantenimiento y reparación de computadores, portátiles e impresoras, soporte técnico y configuración.' },
  REDES: { title: 'Redes y conectividad', text: 'Instalación de redes, configuración de conectividad y cableado estructurado para tu negocio.' },
  CCTV: { title: 'Seguridad y videovigilancia', text: 'Instalación y mantenimiento de cámaras de seguridad y sistemas de videovigilancia.' },
  ADECUACIONES: { title: 'Instalaciones complementarias', text: 'Cielos rasos en PVC, paneles decorativos e iluminación, ejecutados por personal competente.' },
};
const ORDER = ['SOPORTE_EQUIPOS', 'REDES', 'CCTV', 'ADECUACIONES'];

/** Página pública. Los servicios y la promoción vienen del backend (/api/publico); no se muestran precios inventados. */
@Component({
  selector: 'app-landing', standalone: true, imports: [RouterLink],
  template: `
    <header class="nav"><div class="wrap navrow">
      <a href="#inicio" class="logo" aria-label="AXORA SOLUTIONS"><img src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="150" height="64"></a>
      <nav aria-label="Principal"><a href="#servicios">Servicios</a><a href="#como">Cómo funciona</a><a href="#empresas">Empresas</a><a href="#aliados">Aliados</a></nav>
      <a routerLink="/registro" class="btn ghost">Crear cuenta</a>
      <a routerLink="/login" class="btn ghost">Iniciar sesión</a>
    </div></header>

    <section id="inicio" class="hero"><div class="wrap herogrid">
      <div>
        <span class="pill">Plataforma tecnológica para personas y MIPYMES</span>
        <h1>Tecnología que evoluciona contigo.</h1>
        <p>Soporte de equipos, redes, cámaras de seguridad e instalaciones en un solo aliado. Cuéntanos tu necesidad, adjunta una foto y recibe una cotización revisada por un profesional.</p>
        <div class="cta"><a routerLink="/login" class="btn primary">Solicitar cotización</a><a href="#servicios" class="btn ghost light">Ver servicios</a></div>
      </div>
      <div class="mascot"><img src="brand/axora-mascota.png" alt="AXORA, la mascota de AXORA SOLUTIONS" width="320" height="320"></div>
    </div></section>

    <section id="servicios" class="sec"><div class="wrap">
      <h2>Servicios para cada necesidad</h2><p class="lead">Un solo proveedor para resolver varias necesidades. El precio se define tras la evaluación de cada caso.</p>
      <div class="cards">
        @for (g of groups(); track g.key) {
          <article class="svc"><h3>{{ g.title }}</h3><p>{{ g.text }}</p>
            @if (g.items.length) { <ul>@for (i of g.items; track i) { <li>{{ i }}</li> }</ul> }
            <a routerLink="/login" class="more">Solicitar cotización →</a></article>
        }
      </div>
    </div></section>

    <section id="como" class="sec alt"><div class="wrap">
      <h2>Cómo funciona</h2>
      <ol class="steps">
        <li><b>1. Cuéntanos qué necesitas</b><span>Describe el problema o el espacio y adjunta fotografías.</span></li>
        <li><b>2. Revisión profesional</b><span>Un técnico revisa tu solicitud y te pide más información si hace falta.</span></li>
        <li><b>3. Recibe tu cotización</b><span>Con valores, materiales y vigencia. Tú decides si la aceptas.</span></li>
        <li><b>4. Seguimiento del servicio</b><span>Consulta el estado, las notificaciones y el historial desde tu panel.</span></li>
      </ol>
      <p class="ai">AXORA puede ayudarte a describir mejor tu necesidad y analizar tus fotos de forma orientativa. <b>La IA no reemplaza la revisión técnica</b>: cada propuesta y cotización la valida un profesional.</p>
    </div></section>

    <section id="empresas" class="sec"><div class="wrap two">
      <div><h2>Para empresas y emprendedores</h2><p class="lead">Lleva el control de tus equipos, solicitudes, cotizaciones y mantenimientos preventivos en un solo lugar.</p></div>
      <ul class="checks"><li>Inventario de equipos por sede</li><li>Cotizaciones descargables en PDF</li><li>Órdenes de servicio y mantenimientos programados</li><li>Historial completo por equipo y por servicio</li></ul>
    </div></section>

    <section id="aliados" class="sec ally"><div class="wrap">
      <h2>Beneficio de primeros aliados AXORA</h2>
      <p class="lead">Gracias por acompañar el crecimiento de AXORA SOLUTIONS. Como parte de nuestros primeros aliados, queremos ofrecerte un beneficio especial en tus primeros servicios.</p>
      @if (promo(); as p) {
        <div class="promo"><b>{{ p.nombre }}</b><span class="big">{{ p.tipo_descuento === 'PORCENTAJE' ? (+p.valor_descuento + '%') : money(p.valor_descuento) }} de descuento</span>
          <span>Vigente hasta {{ d(p.fecha_fin) }} · Exclusivo para aliados autorizados</span></div>
      } @else { <p class="muted-l">El beneficio se habilita para aliados autorizados por AXORA. Escríbenos para conocer su disponibilidad.</p> }
      <a routerLink="/login" class="btn primary">Ingresar a mi cuenta</a>
    </div></section>

    <footer><div class="wrap foot"><img src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="120" height="51"><div><b>AXORA SOLUTIONS</b><br>Tecnología que evoluciona contigo.</div>
      <div class="small">© AXORA SOLUTIONS. Plataforma de servicios tecnológicos.</div></div></footer>
  `,
  styles: [`
    :host { display:block; color:var(--ink); background:#fff; }
    .wrap { max-width:1100px; margin:0 auto; padding:0 20px; }
    .nav { position:sticky; top:0; z-index:20; background:rgba(255,255,255,.96); border-bottom:1px solid var(--line); backdrop-filter:blur(6px); }
    .navrow { display:flex; align-items:center; gap:22px; padding-top:8px; padding-bottom:8px; } .logo img { height:44px; width:auto; display:block; }
    nav { display:flex; gap:20px; flex:1; justify-content:center; } nav a { color:var(--ink); font-size:14px; font-weight:500; }
    .btn { display:inline-block; padding:11px 20px; border-radius:10px; font-weight:600; font-size:14px; text-decoration:none; border:1px solid transparent; }
    .btn.primary { background:var(--brand-600); color:#fff; } .btn.primary:hover { background:var(--brand-700); text-decoration:none; }
    .btn.ghost { border-color:var(--brand-600); color:var(--brand-600); } .btn.ghost.light { background:transparent; border-color:rgba(255,255,255,.75); color:#fff; } .btn.ghost.light:hover { background:rgba(255,255,255,.12); text-decoration:none; }
    .hero { background:linear-gradient(135deg,var(--brand-900),var(--brand-600)); color:#fff; padding:64px 0; }
    .herogrid { display:grid; grid-template-columns:1.2fr .8fr; gap:32px; align-items:center; }
    .pill { display:inline-block; background:rgba(255,255,255,.14); border-radius:999px; padding:5px 13px; font-size:13px; }
    .hero h1 { color:#fff; font-family:'Sora',Inter,system-ui,sans-serif; font-size:clamp(30px,5vw,48px); line-height:1.1; margin:16px 0; letter-spacing:-.02em; }
    .hero p { font-size:17px; max-width:520px; color:#ece4f5; } .cta { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    .hero .btn.primary { background:var(--accent-600); color:#fff; } .mascot { text-align:center; } .mascot img { width:min(300px,70%); height:auto; background:#fff; border-radius:50%; padding:14px; }
    .sec { padding:60px 0; } .sec.alt { background:var(--surface-alt); } h2 { font-family:'Sora',Inter,system-ui,sans-serif; font-size:clamp(22px,3.4vw,30px); color:var(--brand-900); margin:0 0 8px; }
    .lead { color:#5b5868; max-width:680px; margin:0 0 26px; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
    .svc { border:1px solid var(--line); border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:8px; background:#fff; } .svc h3 { margin:0; color:var(--brand-700); font-size:17px; }
    .svc p { margin:0; color:#5b5868; font-size:14px; } .svc ul { margin:4px 0; padding-left:18px; font-size:13px; color:#3f3b56; } .more { margin-top:auto; font-weight:600; font-size:14px; }
    .steps { list-style:none; padding:0; margin:20px 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
    .steps li { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:6px; } .steps b { color:var(--brand-700); } .steps span { font-size:14px; color:#5b5868; }
    .ai { background:var(--accent-100); border-radius:12px; padding:12px 16px; font-size:14px; }
    .two { display:grid; grid-template-columns:1fr 1fr; gap:30px; align-items:center; } .checks { margin:0; padding:0; list-style:none; display:grid; gap:10px; }
    .checks li { padding-left:28px; position:relative; } .checks li::before { content:'✓'; position:absolute; left:0; color:var(--accent-700); font-weight:700; }
    .ally { background:var(--brand-900); color:#fff; } .ally h2 { color:#fff; } .ally .lead { color:#d9d2ee; } .muted-l { color:#d9d2ee; }
    .promo { display:flex; flex-direction:column; gap:4px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.25); border-radius:14px; padding:16px 20px; margin:0 0 20px; max-width:460px; }
    .promo .big { font-size:26px; font-weight:800; color:#fff; font-family:'Sora',Inter,system-ui,sans-serif; }
    .ally .btn.primary { background:var(--accent-600); }
    footer { background:var(--brand-950); color:#d9d2ee; padding:28px 0; } .foot { display:flex; gap:24px; align-items:center; flex-wrap:wrap; } .foot img { background:#fff; border-radius:8px; padding:6px; } .foot .small { margin-left:auto; font-size:12px; }
    @media (max-width:820px) { .herogrid, .two { grid-template-columns:1fr; } nav { display:none; } .navrow { justify-content:space-between; } .mascot { order:-1; } .hero { padding:36px 0; } }
  `],
})
export class Landing implements OnInit {
  api = inject(Api); d = fmtDate; money = fmtMoney;
  promo = signal<any>(null);
  groups = signal(ORDER.map((k) => ({ key: k, ...LINES[k], items: [] as string[] })));
  async ngOnInit() {
    try {
      const rows: any[] = await this.api.get('/publico/servicios');
      this.groups.set(ORDER.map((k) => ({ key: k, ...LINES[k], items: rows.filter((r) => r.linea === k).slice(0, 5).map((r) => r.nombre) })));
    } catch { /* si la API no responde se muestran las categorías sin detalle */ }
    try { this.promo.set((await this.api.get('/publico/promocion')).promocion); } catch { /* sin promoción visible */ }
  }
}
