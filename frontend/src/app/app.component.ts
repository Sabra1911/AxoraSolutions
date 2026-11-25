import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Ui } from './core/ui';

@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet, FormsModule],
  template: `
    <router-outlet />
    <div class="toasts">
      @for (t of ui.toasts(); track t.id) { <div class="toast" [class.err]="t.kind==='err'">{{ t.text }}</div> }
    </div>
    @if (ui.dialog(); as d) {
      <div class="overlay" (click)="close(null)">
        <div class="modal small-modal" (click)="$event.stopPropagation()">
          <h2>{{ d.title }}</h2>
          @if (d.kind === 'prompt') {
            <label [class.req]="d.required">{{ d.label }}</label>
            <textarea rows="3" [(ngModel)]="text" autofocus></textarea>
          }
          <div class="row" style="justify-content:flex-end;margin-top:14px">
            <button (click)="close(null)">Cancelar</button>
            <button class="primary" [disabled]="d.kind==='prompt' && d.required && !text.trim()" (click)="accept()">Aceptar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .toasts { position:fixed; right:16px; top:16px; z-index:2000; display:flex; flex-direction:column; gap:8px; }
    .toast { background:var(--brand-900); color:#fff; padding:11px 16px; border-radius:10px; border-left:4px solid var(--accent-600); max-width:380px; box-shadow:0 4px 12px rgba(0,0,0,.2); }
    .toast.err { background:var(--red); }
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:1500; display:flex; align-items:center; justify-content:center; padding:16px; }
    .modal { background:#fff; border-radius:12px; padding:20px; width:100%; max-width:440px; }
  `],
})
export class AppComponent {
  ui = inject(Ui);
  text = '';
  close(v: any) { const d = this.ui.dialog(); this.ui.dialog.set(null); this.text = ''; d?.resolve(d.kind === 'confirm' ? false : v); }
  accept() { const d = this.ui.dialog(); const t = this.text.trim(); this.ui.dialog.set(null); this.text = ''; d?.resolve(d.kind === 'confirm' ? true : t); }
}
