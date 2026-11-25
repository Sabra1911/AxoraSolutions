import { NgComponentOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBell, LucideBuilding, LucideCalendarClock, LucideCirclePlus, LucideClipboardList,
  LucideFileCheck2, LucideFileText, LucideHouse, LucideInbox, LucideLaptop,
  LucideLayoutDashboard, LucideLogOut, LucideMenu, LucidePanelLeftClose, LucidePanelLeftOpen, LucidePackage, LucideReceipt,
  LucideSparkles, LucideUsers, LucideWrench, type LucideIcon,
} from '@lucide/angular';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { errMsg, fmtDateTime } from '../core/fmt';

interface Item { label: string; path: string; icon: LucideIcon; }
interface Notification { id: number; titulo: string; mensaje: string; creado_en: string; leida: boolean; enlace?: string | null; }

@Component({
  selector: 'app-shell', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, NgComponentOutlet],
  template: `
    <div class="layout">
      @if (menu()) { <button class="scrim" aria-label="Cerrar menú" (click)="menu.set(false)"></button> }
      <aside class="side" [class.open]="menu()" [class.compact]="collapsed()">
        <a class="brand" routerLink="/" aria-label="AXORA SOLUTIONS"><img src="brand/axora-logo.png" alt="AXORA SOLUTIONS · Tu aliado tecnológico" width="200" height="86"></a>
        <nav>
          @for (i of items(); track i.path) {
            <a [routerLink]="i.path" routerLinkActive="active" (click)="menu.set(false)" [attr.title]="collapsed() ? i.label : null" [attr.aria-label]="i.label">
              <ng-container [ngComponentOutlet]="i.icon" [ngComponentOutletInputs]="iconInputs"></ng-container>
              <span>{{ i.label }}</span>
            </a>
          }
        </nav>
        <button class="collapse" (click)="toggleCollapsed()" [attr.aria-label]="collapsed() ? 'Expandir menú' : 'Contraer menú'" [attr.title]="collapsed() ? 'Expandir menú' : 'Contraer menú'">
          <ng-container [ngComponentOutlet]="collapsed() ? icons.Open : icons.Close" [ngComponentOutletInputs]="iconInputs"></ng-container>
          <span>Contraer menú</span>
        </button>
      </aside>
      <div class="main">
        <header class="top">
          <button class="burger icon-button" aria-label="Abrir menú" (click)="menu.set(!menu())">
            <ng-container [ngComponentOutlet]="icons.Menu" [ngComponentOutletInputs]="iconInputs"></ng-container>
          </button>
          <img class="top-mark" src="brand/axora-mascota.png" alt="" width="30" height="30"><span class="crumb">{{ auth.user()?.empresaNombre || 'Panel de ' + roleLabel() }}</span>
          <span class="spacer"></span>
          <div class="bellbox">
            <button class="icon-button" (click)="toggleBell()" aria-label="Notificaciones">
              <ng-container [ngComponentOutlet]="icons.Bell" [ngComponentOutletInputs]="iconInputs"></ng-container>
              @if (unread() > 0) { <i class="dot">{{ unread() }}</i> }
            </button>
            @if (bell()) {
              <div class="drop">
                <div class="row" style="padding:8px 12px"><b>Notificaciones</b><span class="spacer"></span><button class="link" (click)="readAll()">Marcar todas</button></div>
                @for (n of notes(); track n.id) {
                  <div class="note" [class.unread]="!n.leida" (click)="goNote(n)"><b>{{ n.titulo }}</b><div class="muted small">{{ n.mensaje }}</div><div class="muted small">{{ fmt(n.creado_en) }}</div></div>
                } @empty { <p class="muted" style="padding:12px">Sin notificaciones</p> }
              </div>
            }
          </div>
          <a routerLink="/perfil" class="who"><i class="avatar">{{ initials() }}</i><span>{{ auth.user()?.nombre }}</span></a>
          <button class="logout" (click)="auth.logout()">
            <ng-container [ngComponentOutlet]="icons.LogOut" [ngComponentOutletInputs]="iconInputs"></ng-container>
            <span>Salir</span>
          </button>
        </header>
        <main class="content"><router-outlet /></main>
      </div>
    </div>
  `,
  styles: [`
    .layout { display:flex; min-height:100vh; }
    .side { width:256px; background:linear-gradient(180deg,var(--brand-950),#241052); color:#fff; flex-shrink:0; padding:16px 12px; position:sticky; top:0; height:100vh; overflow:auto; }
    .brand { display:block; background:#fff; border-radius:12px; padding:10px 12px; margin:0 0 18px; box-shadow:0 2px 10px rgba(0,0,0,.25); }
    .brand img { display:block; width:100%; height:auto; }
    .side { transition:width .2s ease, padding .2s ease; display:flex; flex-direction:column; }
    .side nav { flex:1; }
    .collapse { margin-top:10px; width:100%; justify-content:flex-start; background:rgba(255,255,255,.08); border-color:transparent; color:#d9d2ee; font-size:13px; }
    .collapse:hover:not(:disabled) { background:rgba(255,255,255,.16); color:#fff; }
    .collapse svg { width:18px; height:18px; flex:none; }
    @media (min-width:861px) {
      .side.compact { width:72px; padding:16px 10px; }
      .side.compact .brand { padding:8px 4px; }
      .side.compact .brand img { width:100%; height:34px; object-fit:cover; object-position:left center; border-radius:6px; }
      .side.compact nav a { justify-content:center; padding:11px 0; border-left:0; }
      .side.compact nav a span, .side.compact .collapse span { display:none; }
      .side.compact nav a.active { box-shadow:inset 3px 0 0 var(--accent-600); }
      .side.compact .collapse { justify-content:center; padding:8px 0; }
    }
    @media (max-width:860px) { .collapse { display:none; } }
    nav a { display:flex; gap:11px; align-items:center; color:#d9d2ee; padding:10px 12px; border-radius:9px; margin-bottom:3px; font-size:13px; border-left:3px solid transparent; }
    nav a svg { width:18px; height:18px; flex:none; }
    nav a:hover { background:rgba(255,255,255,.08); text-decoration:none; color:#fff; }
    nav a.active { background:rgba(255,255,255,.12); color:#fff; font-weight:600; border-left-color:var(--accent-600); }
    .main { flex:1; min-width:0; display:flex; flex-direction:column; }
    .top { background:#fff; display:flex; gap:12px; align-items:center; padding:10px 24px; border-bottom:1px solid var(--line); position:sticky; top:0; z-index:50; }
    .top-mark { width:30px; height:30px; object-fit:contain; } .crumb { font-weight:600; color:var(--brand-900); }
    .content { padding:24px; max-width:1440px; width:100%; margin:0 auto; }
    .burger { display:none; } .who { display:flex; align-items:center; gap:8px; font-weight:600; color:var(--gray-700); }
    .avatar { width:30px; height:30px; border-radius:50%; background:var(--brand-700); color:#fff; font-style:normal; font-size:12px; display:grid; place-items:center; }
    .icon-button { min-width:38px; width:38px; height:38px; padding:8px; display:inline-flex; align-items:center; justify-content:center; position:relative; }
    .icon-button svg,.logout svg { width:18px; height:18px; flex:none; }
    .logout { display:flex; gap:7px; align-items:center; }
    .bellbox { position:relative; } .dot { position:absolute; top:-5px; right:-4px; background:var(--red); color:#fff; border-radius:999px; font-size:10px; min-width:17px; text-align:center; padding:1px 5px; font-style:normal; }
    .drop { position:absolute; right:0; top:42px; width:340px; max-height:420px; overflow:auto; background:#fff; border-radius:12px; box-shadow:0 10px 30px rgba(42,15,92,.25); }
    .note { padding:10px 12px; border-top:1px solid var(--gray-100); cursor:pointer; } .note.unread { background:var(--brand-50); border-left:3px solid var(--accent-600); } .note:hover { background:var(--brand-100); }
    .scrim { display:none; }
    @media (max-width:860px) {
      .side { position:fixed; inset:0 auto 0 0; z-index:101; height:100dvh; overflow:auto; transform:translateX(-100%); transition:transform .2s ease; }
      .side.open { transform:none; }
      .scrim { display:block; position:fixed; inset:0; z-index:100; border:0; border-radius:0; background:rgba(26,11,58,.5); }
      .burger { display:inline-flex; } .content { padding:16px; } .top { padding:10px 14px; } .who span { display:none; }
      .drop { width:min(340px,calc(100vw - 24px)); right:-54px; }
    }
  `],
})
export class Shell implements OnInit, OnDestroy {
  auth = inject(Auth); api = inject(Api); router = inject(Router); ui = inject(Ui);
  /** Menú compacto (solo iconos) en escritorio. La preferencia se recuerda en este navegador. */
  collapsed = signal(this.readCollapsed());
  menu = signal(false); bell = signal(false); unread = signal(0); notes = signal<Notification[]>([]);
  fmt = fmtDateTime;
  readonly iconInputs = { size: 18 };
  readonly icons = { Bell: LucideBell, Menu: LucideMenu, LogOut: LucideLogOut, Close: LucidePanelLeftClose, Open: LucidePanelLeftOpen };
  private timer: any;

  initials = () => (this.auth.user()?.nombre || '?').split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('');
  private readCollapsed(): boolean { try { return localStorage.getItem('axora.menu.collapsed') === '1'; } catch { return false; } }
  toggleCollapsed() {
    const next = !this.collapsed(); this.collapsed.set(next);
    try { localStorage.setItem('axora.menu.collapsed', next ? '1' : '0'); } catch { /* almacenamiento no disponible */ }
  }
  roleLabel = () => (this.auth.isStaff() ? 'administración' : this.auth.isClient() ? 'cliente' : 'técnico');
  items = (): Item[] => {
    if (this.auth.isStaff()) return [
      { label: 'Dashboard', path: '/dashboard', icon: LucideLayoutDashboard }, { label: 'Empresas', path: '/empresas', icon: LucideBuilding }, { label: 'Usuarios', path: '/usuarios', icon: LucideUsers },
      { label: 'Servicios', path: '/servicios', icon: LucideWrench }, { label: 'Equipos', path: '/equipos', icon: LucideLaptop }, { label: 'Solicitudes', path: '/solicitudes', icon: LucideInbox },
      { label: 'Cotizaciones', path: '/cotizaciones', icon: LucideReceipt }, { label: 'Órdenes de servicio', path: '/ordenes', icon: LucideClipboardList }, { label: 'Planes', path: '/planes', icon: LucidePackage },
      { label: 'Contratos', path: '/contratos', icon: LucideFileCheck2 }, { label: 'Mantenimientos', path: '/mantenimientos', icon: LucideCalendarClock }, { label: 'Historial', path: '/historial', icon: LucideFileText },
      { label: 'Diseñador de espacios', path: '/disenador-espacios', icon: LucideHouse }, { label: 'Asistente IA', path: '/ia', icon: LucideSparkles },
    ];
    if (this.auth.isClient()) return [
      { label: 'Inicio', path: '/inicio', icon: LucideHouse }, { label: 'Nueva solicitud', path: '/solicitudes/nueva', icon: LucideCirclePlus }, { label: 'Seguimiento', path: '/solicitudes', icon: LucideInbox },
      { label: 'Cotizaciones', path: '/cotizaciones', icon: LucideReceipt }, { label: 'Servicios realizados', path: '/ordenes', icon: LucideClipboardList }, { label: 'Equipos', path: '/equipos', icon: LucideLaptop },
      { label: 'Historial', path: '/historial', icon: LucideFileText }, { label: 'Mantenimientos', path: '/mantenimientos', icon: LucideCalendarClock },
      { label: 'Diseñador de espacios', path: '/disenador-espacios', icon: LucideHouse }, { label: 'Asistente IA', path: '/ia', icon: LucideSparkles },
    ];
    return [{ label: 'Órdenes asignadas', path: '/ordenes', icon: LucideClipboardList }, { label: 'Mantenimientos', path: '/mantenimientos', icon: LucideCalendarClock }, { label: 'Asistente IA', path: '/ia', icon: LucideSparkles }];
  };

  ngOnInit() { this.poll(); this.timer = setInterval(() => this.poll(), 60000); }
  ngOnDestroy() { clearInterval(this.timer); }
  async poll() { try { const r = await this.api.get('/notificaciones', { size: 15 }); this.notes.set(r.data); this.unread.set(r.noLeidas); } catch { /* sin conexión */ } }
  toggleBell() { this.bell.set(!this.bell()); if (this.bell()) this.poll(); }
  async readAll() {
    try { await this.api.post('/notificaciones/leer-todas'); await this.poll(); }
    catch (e) { this.ui.err(errMsg(e)); }
  }
  async goNote(n: Notification) {
    try {
      if (!n.leida) { await this.api.post(`/notificaciones/${n.id}/leer`); await this.poll(); }
      this.bell.set(false);
      if (n.enlace) this.router.navigateByUrl(n.enlace);
    } catch (e) { this.ui.err(errMsg(e)); }
  }
}
