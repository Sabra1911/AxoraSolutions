import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { errMsg } from '../core/fmt';

const STYLE = `
  .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:radial-gradient(circle at 15% 10%,rgba(10,169,184,.35),transparent 45%),linear-gradient(135deg,var(--brand-950),var(--brand-700)); padding:16px; }
  .box { background:#fff; border-radius:14px; padding:28px; width:100%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,.25); }
  .logo { display:block; width:210px; max-width:70%; height:auto; margin:0 auto 6px; }
  .welcome { display:flex; align-items:center; gap:10px; margin:2px 0 14px; } .welcome img { width:46px; height:46px; object-fit:contain; } .welcome p { margin:0; }
`;

@Component({
  selector: 'app-login', standalone: true, imports: [FormsModule, RouterLink], styles: [STYLE],
  template: `
    <div class="wrap"><form class="box" (ngSubmit)="go()" #f="ngForm">
      <img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS · Tu aliado tecnológico" width="210" height="90">
      <div class="welcome"><img src="brand/axora-mascota.png" alt="" width="46" height="46"><p class="muted">Bienvenido al portal de <b>AXORA SOLUTIONS</b>. Ingrese con su cuenta para continuar.</p></div>
      <div class="field"><label>Correo electrónico</label><input type="email" name="email" [(ngModel)]="email" required autocomplete="username"></div>
      <div class="field"><label>Contraseña</label><input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password"></div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      @if (unverified()) { <p class="small"><button type="button" class="link" (click)="resend()">Reenviar enlace de activación</button>@if (resent()) { <span class="muted"> · Enviado, revise su correo.</span> }</p> }
      <button class="primary" style="width:100%" [disabled]="f.invalid || busy()">{{ busy() ? 'Ingresando…' : 'Ingresar' }}</button>
      <p class="small" style="text-align:center;margin-top:14px"><a routerLink="/olvide">¿Olvidó su contraseña?</a> · <a routerLink="/registro">Crear cuenta</a></p>
    </form></div>`,
})
export class Login {
  auth = inject(Auth); router = inject(Router);
  api = inject(Api);
  email = ''; password = ''; error = signal(''); busy = signal(false); unverified = signal(false); resent = signal(false);
  async go() {
    this.busy.set(true); this.error.set(''); this.unverified.set(false); this.resent.set(false);
    try { await this.auth.login(this.email, this.password); this.router.navigateByUrl(this.auth.home()); }
    catch (e: any) { this.unverified.set(e?.error?.error?.code === 'EMAIL_NO_VERIFICADO'); this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
  async resend() { try { await this.api.post('/auth/reenviar-activacion', { email: this.email }); this.resent.set(true); } catch (e) { this.error.set(errMsg(e)); } }
}

@Component({
  selector: 'app-forgot', standalone: true, imports: [FormsModule, RouterLink], styles: [STYLE],
  template: `
    <div class="wrap"><form class="box" (ngSubmit)="go()" #f="ngForm">
      <img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="210" height="90"><h2>Recuperar contraseña</h2>
      @if (!sent()) {
        <p class="muted">Escriba su correo y le enviaremos un enlace para restablecerla.</p>
        <div class="field"><label>Correo electrónico</label><input type="email" name="email" [(ngModel)]="email" required></div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="primary" style="width:100%" [disabled]="f.invalid || busy()">Enviar enlace</button>
      } @else { <p>Si el correo está registrado, recibirá las instrucciones en unos minutos.</p> }
      <p class="small" style="text-align:center;margin-top:14px"><a routerLink="/login">Volver a ingresar</a></p>
    </form></div>`,
})
export class Forgot {
  api = inject(Api); email = ''; sent = signal(false); busy = signal(false); error = signal('');
  async go() { this.busy.set(true); try { await this.api.post('/auth/olvide-password', { email: this.email }); this.sent.set(true); } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); } }
}

@Component({
  selector: 'app-reset', standalone: true, imports: [FormsModule, RouterLink], styles: [STYLE],
  template: `
    <div class="wrap"><form class="box" (ngSubmit)="go()" #f="ngForm">
      <img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="210" height="90"><h2>Nueva contraseña</h2>
      @if (!done()) {
        <div class="field"><label>Nueva contraseña</label><input type="password" name="p" [(ngModel)]="pw" required minlength="10" autocomplete="new-password"><span class="muted small">Mínimo 10 caracteres, con letras y números.</span></div>
        <div class="field"><label>Confirmar</label><input type="password" name="p2" [(ngModel)]="pw2" required autocomplete="new-password"></div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="primary" style="width:100%" [disabled]="f.invalid || pw !== pw2 || busy()">Restablecer</button>
        @if (pw2 && pw !== pw2) { <p class="error">Las contraseñas no coinciden</p> }
      } @else { <p>Contraseña actualizada. Ya puede ingresar.</p> }
      <p class="small" style="text-align:center;margin-top:14px"><a routerLink="/login">Ir a ingresar</a></p>
    </form></div>`,
})
export class Reset {
  api = inject(Api); route = inject(ActivatedRoute);
  pw = ''; pw2 = ''; done = signal(false); busy = signal(false); error = signal('');
  async go() {
    this.busy.set(true); this.error.set('');
    try { await this.api.post('/auth/restablecer-password', { token: this.route.snapshot.queryParamMap.get('token') || '', nueva: this.pw }); this.done.set(true); }
    catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-profile', standalone: true, imports: [FormsModule],
  template: `
    <div class="card" style="max-width:520px">
      <h1>Mi perfil</h1>
      <dl class="kv"><dt>Nombre</dt><dd>{{ auth.user()?.nombre }}</dd><dt>Correo</dt><dd>{{ auth.user()?.email }}</dd><dt>Roles</dt><dd>{{ auth.user()?.roles?.join(', ') }}</dd>
        @if (auth.user()?.empresaNombre) { <dt>Empresa</dt><dd>{{ auth.user()?.empresaNombre }}</dd> }</dl>
    </div>
    <form class="card" style="max-width:520px" (ngSubmit)="go()" #f="ngForm">
      <h2>Cambiar contraseña</h2>
      <div class="field"><label>Contraseña actual</label><input type="password" name="a" [(ngModel)]="actual" required autocomplete="current-password"></div>
      <div class="field"><label>Nueva contraseña</label><input type="password" name="n" [(ngModel)]="nueva" required minlength="10" autocomplete="new-password"></div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <button class="primary" [disabled]="f.invalid || busy()">Actualizar contraseña</button>
      <p class="muted small">Al cambiarla se cerrarán todas sus sesiones.</p>
    </form>`,
})
export class Profile {
  api = inject(Api); auth = inject(Auth);
  actual = ''; nueva = ''; error = signal(''); busy = signal(false);
  async go() {
    this.busy.set(true); this.error.set('');
    try { await this.api.post('/auth/cambiar-password', { actual: this.actual, nueva: this.nueva }); this.auth.goLogin(); }
    catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}


@Component({
  selector: 'app-register', standalone: true, imports: [FormsModule, RouterLink],
  styles: [STYLE + ' .box.wide{max-width:480px} .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px} @media(max-width:520px){.row2{grid-template-columns:1fr}} .check{display:flex;gap:8px;align-items:flex-start;font-size:.85rem;margin:8px 0} .check input{width:auto;margin-top:3px}'],
  template: `
    <div class="wrap">@if (sent()) {
      <div class="box wide"><img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="210" height="90">
        <h2>Revise su correo</h2>
        <p>Le enviamos un enlace a <b>{{ d.email }}</b> para autorizar su ingreso. Ábralo para activar la cuenta (vence en 48 horas).</p>
        <p class="small muted">Si no lo ve, revise la carpeta de spam.</p>
        <p class="small" style="text-align:center;margin-top:14px"><a routerLink="/login">Ir a ingresar</a></p></div>
    } @else {<form class="box wide" (ngSubmit)="go()" #f="ngForm">
      <img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="210" height="90">
      <h2 style="margin:6px 0">Crear mi cuenta</h2>
      <p class="muted">Regístrese para solicitar servicios, cotizar y canjear su bono de cortesía.</p>
      <div class="field"><label>Soy</label>
        <select name="tipo" [(ngModel)]="d.tipo"><option value="EMPRESA">Una empresa</option><option value="PERSONA">Una persona natural</option></select></div>
      <div class="row2">
        <div class="field"><label>{{ d.tipo === 'EMPRESA' ? 'NIT' : 'Documento' }}</label><input name="nit" [(ngModel)]="d.nit" required minlength="5" maxlength="20"></div>
        @if (d.tipo === 'EMPRESA') { <div class="field"><label>Razón social</label><input name="rs" [(ngModel)]="d.razon_social" required maxlength="200"></div> }
        @else { <div class="field"><label>Ciudad</label><input name="ciudad2" [(ngModel)]="d.ciudad" required></div> }
      </div>
      <div class="row2">
        <div class="field"><label>Su nombre</label><input name="nombre" [(ngModel)]="d.nombre" required minlength="3" autocomplete="name"></div>
        <div class="field"><label>Teléfono</label><input name="tel" [(ngModel)]="d.telefono" autocomplete="tel"></div>
      </div>
      <div class="field"><label>Correo electrónico</label><input type="email" name="email" [(ngModel)]="d.email" required autocomplete="username"></div>
      <div class="field"><label>Contraseña (mínimo 10 caracteres, con letras y números)</label><input type="password" name="password" [(ngModel)]="d.password" required minlength="10" autocomplete="new-password"></div>
      <label class="check"><input type="checkbox" name="ok" [(ngModel)]="d.acepta_datos"> Autorizo el tratamiento de mis datos personales para la prestación del servicio.</label>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <button class="primary" style="width:100%" [disabled]="f.invalid || !d.acepta_datos || busy()">{{ busy() ? 'Creando cuenta…' : 'Crear cuenta' }}</button>
      <p class="small" style="text-align:center;margin-top:14px">¿Ya tiene cuenta? <a routerLink="/login">Ingresar</a></p>
    </form>}</div>`,
})
export class Register {
  auth = inject(Auth); router = inject(Router);
  d: any = { tipo: 'EMPRESA', nit: '', razon_social: '', nombre: '', telefono: '', email: '', password: '', ciudad: 'Cúcuta', acepta_datos: false };
  error = signal(''); busy = signal(false); sent = signal(false);
  async go() {
    this.busy.set(true); this.error.set('');
    try {
      const body = { ...this.d, telefono: this.d.telefono || undefined, razon_social: this.d.tipo === 'EMPRESA' ? this.d.razon_social : undefined };
      await this.auth.register(body); this.sent.set(true);
    } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}


@Component({
  selector: 'app-activate', standalone: true, imports: [FormsModule, RouterLink], styles: [STYLE],
  template: `
    <div class="wrap"><form class="box" (ngSubmit)="go()" #f="ngForm">
      <img class="logo" src="brand/axora-logo.png" alt="AXORA SOLUTIONS" width="210" height="90">
      <h2>Activar mi cuenta</h2>
      @if (done()) {
        <p>¡Listo! Su correo quedó verificado y su cuenta autorizada.</p>
        <a routerLink="/login" class="btn primary" style="display:block;text-align:center">Ingresar</a>
      } @else {
        @if (needPassword) {
          <p class="muted">Cree la contraseña con la que ingresará (mínimo 10 caracteres, con letras y números).</p>
          <div class="field"><label>Nueva contraseña</label><input type="password" name="password" [(ngModel)]="password" required minlength="10" autocomplete="new-password"></div>
        } @else { <p class="muted">Confirme su correo para autorizar su ingreso.</p> }
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="primary" style="width:100%" [disabled]="busy() || (needPassword && f.invalid)">{{ busy() ? 'Activando…' : 'Activar cuenta' }}</button>
      }
    </form></div>`,
})
export class Activate {
  api = inject(Api); route = inject(ActivatedRoute);
  token = this.route.snapshot.queryParamMap.get('token') || ''; needPassword = this.route.snapshot.queryParamMap.get('clave') === '1';
  password = ''; error = signal(''); busy = signal(false); done = signal(false);
  async go() {
    this.busy.set(true); this.error.set('');
    try { await this.api.post('/auth/activar', { token: this.token, ...(this.needPassword ? { password: this.password } : {}) }); this.done.set(true); }
    catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}
