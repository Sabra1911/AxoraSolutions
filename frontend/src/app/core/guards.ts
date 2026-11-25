import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from './auth';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.user()) return router.createUrlTree(['/login']);
  const perms: string[] | undefined = route.data['perms'];
  if (perms && !auth.canAny(perms)) return router.createUrlTree([auth.home()]);
  return true;
};
export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.user() ? inject(Router).createUrlTree([auth.home()]) : true;
};
