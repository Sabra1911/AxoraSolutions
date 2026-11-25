import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'ok' | 'err'; text: string; }
export interface Dialog { kind: 'confirm' | 'prompt'; title: string; label?: string; required?: boolean; resolve: (v: any) => void; }

@Injectable({ providedIn: 'root' })
export class Ui {
  toasts = signal<Toast[]>([]);
  dialog = signal<Dialog | null>(null);
  private n = 0;
  toast(text: string, kind: 'ok' | 'err' = 'ok') {
    const id = ++this.n;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 3500);
  }
  ok(t: string) { this.toast(t, 'ok'); }
  err(t: string) { this.toast(t, 'err'); }
  confirm(title: string): Promise<boolean> { return new Promise((resolve) => this.dialog.set({ kind: 'confirm', title, resolve })); }
  prompt(title: string, label = 'Motivo', required = true): Promise<string | null> { return new Promise((resolve) => this.dialog.set({ kind: 'prompt', title, label, required, resolve })); }
}
