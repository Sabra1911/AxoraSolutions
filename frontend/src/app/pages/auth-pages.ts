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
      <button class="primary" style="width:100%" [disabled]="f.invalid || busy()">{{ busy() ? 'Ingresando…' : 'Ingresar' }}</button>
      <p class="small" style="text-align:center;margin-top:14px"><a routerLink="/olvide">¿Olvidó su contraseña?</a></p>
    </form></div>`,
})
export class Login {
  auth = inject(Auth); router = inject(Router);
  email = ''; password = ''; error = signal(''); busy = signal(false);
  async go() {
    this.busy.set(true); this.error.set('');
    try { await this.auth.login(this.email, this.password); this.router.navigateByUrl(this.auth.home()); }
    catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
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
