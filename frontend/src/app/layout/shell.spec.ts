// Regression tests for: Angular 19 to 22 and Lucide navigation icons.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Ui } from '../core/ui';
import { Shell } from './shell';

describe('Shell navigation', () => {
  let fixture: ComponentFixture<Shell>;

  beforeEach(async () => {
    const auth = {
      user: signal({ id: 1, nombre: 'Demo', email: 'admin@demo.invalid', empresaId: null, roles: ['SUPERADMIN'], permisos: [] }),
      isStaff: () => true,
      isClient: () => false,
      isTecnico: () => false,
      logout: jasmine.createSpy('logout'),
    };
    const api = {
      get: jasmine.createSpy('get').and.resolveTo({ data: [], noLeidas: 0 }),
      post: jasmine.createSpy('post').and.resolveTo({}),
    };

    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: auth },
        { provide: Api, useValue: api },
        { provide: Ui, useValue: { err: jasmine.createSpy('err') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('renders key staff routes with a Lucide SVG icon for each link', () => {
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];

    expect(links.some((link) => link.textContent?.includes('Dashboard'))).toBeTrue();
    expect(links.some((link) => link.textContent?.includes('Diseñador de espacios'))).toBeTrue();
    expect(links.some((link) => link.textContent?.includes('Asistente IA'))).toBeTrue();
    expect(nav.querySelectorAll('svg').length).toBe(links.length);
  });
});
