import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface User { id: number; nombre: string; email: string; empresaId: number | null; empresaNombre?: string | null; roles: string[]; permisos: string[]; }

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  user = signal<User | null>(null);
  token: string | null = null; // solo en memoria: no se guarda en localStorage
  private pending: Promise<boolean> | null = null;

  isStaff = computed(() => !!this.user()?.roles.some((r) => r === 'ADMIN' || r === 'SUPERADMIN'));
  isClient = computed(() => !!this.user()?.roles.includes('CLIENTE'));
  isTecnico = computed(() => !this.isStaff() && !!this.user()?.roles.includes('TECNICO'));

  can = (p: string) => !!this.user()?.permisos.includes(p);
  canAny = (ps: string[]) => ps.some((p) => this.can(p));
  home() { return this.isStaff() ? '/dashboard' : this.isClient() ? '/inicio' : '/ordenes'; }

  private set(r: any) { this.token = r.accessToken; this.user.set(r.user); }
  private clear() { this.token = null; this.user.set(null); }

  async login(email: string, password: string) {
    this.set(await firstValueFrom(this.http.post<any>('/api/auth/login', { email, password })));
  }
  /** Una sola renovación a la vez, aunque varias peticiones fallen por token vencido. */
  refresh(): Promise<boolean> {
    if (!this.pending) {
      this.pending = firstValueFrom(this.http.post<any>('/api/auth/refresh', {}))
        .then((r) => { this.set(r); return true; })
        .catch(() => { this.clear(); return false; })
        .finally(() => { this.pending = null; });
    }
    return this.pending;
  }
  goLogin() { this.clear(); this.router.navigate(['/login']); }
  async logout() {
    try { await firstValueFrom(this.http.post('/api/auth/logout', {})); } catch { /* sesión ya inválida */ }
    this.goLogin();
  }
}
