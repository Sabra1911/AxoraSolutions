import { Component, Input } from '@angular/core';

/** AXORA como acompañante discreto: mensajes de ayuda, estados vacíos, cargas y confirmaciones. */
@Component({
  selector: 'app-axora-hint', standalone: true,
  template: `
    <div class="hint" [class.working]="working" [attr.role]="working ? 'status' : null">
      <img src="brand/axora-mascota.png" alt="" width="44" height="44">
      <div><b>{{ title }}</b>@if (text) { <span>{{ text }}</span> }<ng-content /></div>
    </div>`,
  styles: [`
    .hint { display:flex; gap:12px; align-items:center; background:var(--brand-50); border:1px solid var(--line); border-radius:14px; padding:10px 14px; }
    .hint img { flex:none; width:44px; height:44px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; }
    .hint div { display:flex; flex-direction:column; gap:2px; font-size:14px; } .hint b { color:var(--brand-700); } .hint span { color:#5b5868; font-size:13px; }
    .working img { animation:float 1.6s ease-in-out infinite; } @keyframes float { 50% { transform:translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .working img { animation:none; } }
  `],
})
export class AxoraHint { @Input() title = ''; @Input() text = ''; @Input() working = false; }
