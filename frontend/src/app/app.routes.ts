import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards';
import { Shell } from './layout/shell';
import { Activate, Forgot, Login, Profile, Register, Reset } from './pages/auth-pages';
import * as P from './pages/catalogs';
import { Dashboard } from './pages/dashboard';
import { SolicitudNew } from './pages/solicitud-new';
import { SolicitudDetail } from './pages/solicitud-detail';
import { CotizacionEditor } from './pages/cotizacion-editor';
import { CotizacionDetail } from './pages/cotizacion-detail';
import { OrdenDetail } from './pages/orden-detail';
import { AiAssistant } from './pages/ai-assistant';
import { SpaceDesigner } from './pages/space-designer';
import { Landing } from './pages/landing';
import { ManualPage } from './pages/manual';
import { BeneficiosPage, PromocionesPage } from './pages/promociones';

const perms = (...p: string[]) => ({ perms: p });

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: Landing, canActivate: [guestGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'registro', component: Register, canActivate: [guestGuard] },
  { path: 'activar', component: Activate },
  { path: 'olvide', component: Forgot },
  { path: 'restablecer', component: Reset },
  {
    path: '', component: Shell, canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard, canActivate: [authGuard], data: perms('usuarios:read') },
      { path: 'inicio', component: Dashboard, canActivate: [authGuard], data: perms('solicitudes:create') },
      { path: 'empresas', component: P.EmpresasPage, canActivate: [authGuard], data: perms('usuarios:read') },
      { path: 'empresas/:id', component: P.EmpresaDetail, canActivate: [authGuard], data: perms('usuarios:read') },
      { path: 'usuarios', component: P.UsuariosPage, canActivate: [authGuard], data: perms('usuarios:read') },
      { path: 'servicios', component: P.ServiciosPage, canActivate: [authGuard], data: perms('usuarios:read') },
      { path: 'equipos', component: P.EquiposPage, canActivate: [authGuard], data: perms('equipos:read') },
      { path: 'solicitudes', component: P.SolicitudesPage, canActivate: [authGuard], data: perms('solicitudes:read') },
      { path: 'solicitudes/nueva', component: SolicitudNew, canActivate: [authGuard], data: perms('solicitudes:create') },
      { path: 'solicitudes/:id', component: SolicitudDetail, canActivate: [authGuard], data: perms('solicitudes:read') },
      { path: 'cotizaciones', component: P.CotizacionesPage, canActivate: [authGuard], data: perms('cotizaciones:read') },
      { path: 'cotizaciones/nueva', component: CotizacionEditor, canActivate: [authGuard], data: perms('cotizaciones:write') },
      { path: 'cotizaciones/:id/editar', component: CotizacionEditor, canActivate: [authGuard], data: perms('cotizaciones:write') },
      { path: 'cotizaciones/:id', component: CotizacionDetail, canActivate: [authGuard], data: perms('cotizaciones:read') },
      { path: 'ordenes', component: P.OrdenesPage, canActivate: [authGuard], data: perms('ordenes:read') },
      { path: 'ordenes/:id', component: OrdenDetail, canActivate: [authGuard], data: perms('ordenes:read') },
      { path: 'promociones', component: PromocionesPage, canActivate: [authGuard], data: perms('promociones:read') },
      { path: 'beneficios', component: BeneficiosPage, canActivate: [authGuard], data: perms('solicitudes:create') },
      { path: 'planes', component: P.PlanesPage, canActivate: [authGuard], data: perms('planes:read') },
      { path: 'contratos', component: P.ContratosPage, canActivate: [authGuard], data: perms('planes:read') },
      { path: 'mantenimientos', component: P.MantenimientosPage, canActivate: [authGuard], data: perms('mantenimientos:read') },
      { path: 'historial', component: P.HistorialPage, canActivate: [authGuard], data: perms('historial:read') },
      { path: 'ia', component: AiAssistant, canActivate: [authGuard], data: perms('solicitudes:create', 'ordenes:execute', 'servicios:read') },
      { path: 'disenador-espacios', component: SpaceDesigner, canActivate: [authGuard], data: perms('solicitudes:create', 'ordenes:execute') },
      { path: 'manual', component: ManualPage },
      { path: 'perfil', component: Profile },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
