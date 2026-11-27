import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { Auth } from './auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const isAuthCall = req.url.includes('/api/auth/') && !req.url.includes('/cambiar-password');
  const withToken = (r: HttpRequest<any>) => (auth.token && !isAuthCall ? r.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } }) : r);
  return next(withToken(req)).pipe(
    catchError((err) => {
      if (err.status === 401 && !isAuthCall) {
        return from(auth.refresh()).pipe(
          switchMap((ok) => { if (ok) return next(withToken(req)); auth.goLogin(); return throwError(() => err); }),
        );
      }
      return throwError(() => err);
    }),
  );
};
