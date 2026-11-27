import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';

const clean = (p?: Record<string, any>) => {
  const o: Record<string, string> = {};
  Object.entries(p || {}).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') o[k] = String(v); });
  return o;
};

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  get<T = any>(url: string, params?: Record<string, any>) { return firstValueFrom(this.http.get<T>('/api' + url, { params: clean(params) })); }
  post<T = any>(url: string, body: any = {}) { return firstValueFrom(this.http.post<T>('/api' + url, body)); }
  put<T = any>(url: string, body: any = {}) { return firstValueFrom(this.http.put<T>('/api' + url, body)); }
  patch<T = any>(url: string, body: any = {}) { return firstValueFrom(this.http.patch<T>('/api' + url, body)); }
  delete<T = any>(url: string) { return firstValueFrom(this.http.delete<T>('/api' + url)); }
  /** Descarga binaria. Si el servidor responde un error JSON, se lee el Blob para que errMsg() muestre el mensaje real. */
  async blob(url: string): Promise<Blob> {
    try { return await firstValueFrom(this.http.get('/api' + url, { responseType: 'blob' })); }
    catch (e: any) {
      if (e?.error instanceof Blob) {
        let body: any = null;
        try { body = JSON.parse(await e.error.text()); } catch { /* respuesta no JSON */ }
        if (body) throw Object.assign(Object.create(Object.getPrototypeOf(e)), e, { error: body });
      }
      throw e;
    }
  }
  upload<T = any>(url: string, files: File[], params?: Record<string, any>) {
    const fd = new FormData();
    files.forEach((f) => fd.append('archivos', f));
    return firstValueFrom(this.http.post<T>('/api' + url, fd, { params: clean(params) }));
  }
  uploadPhoto<T = any>(url: string, file: File, onProgress: (percent: number) => void, fields?: Record<string, any>) {
    const fd = new FormData();
    fd.append('fotografia', file);
    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') fd.append(key, String(value));
    });
    return firstValueFrom(this.http.post<T>('/api' + url, fd, { observe: 'events', reportProgress: true }).pipe(
      tap((event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      }),
      filter((event): event is HttpResponse<T> => event instanceof HttpResponse),
      map((event) => {
        if (event.body === null) throw new Error('El servidor no devolvió la propuesta.');
        return event.body;
      }),
    ));
  }
  /** Descarga/abre un archivo protegido (se envía el JWT, por eso no se usa un enlace directo). */
  async download(url: string, filename: string, open = false) {
    const b = await this.blob(url);
    const href = URL.createObjectURL(b);
    if (open) { window.open(href, '_blank'); } else { const a = document.createElement('a'); a.href = href; a.download = filename; a.click(); }
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  }
}
