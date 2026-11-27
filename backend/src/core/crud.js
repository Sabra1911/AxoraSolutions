/** Fábricas reutilizables: servicio CRUD (reglas) y rutas REST, para evitar duplicación en catálogos simples. */
const express = require('express');
const db = require('../config/db');
const { notFound } = require('./errors');
const { audit } = require('./audit');
const { requirePerm } = require('../middleware/auth');
const { asyncHandler, validate, ctxOf } = require('./http');
const { z } = require('./schemas');

function createCrudService({ repo, entity, label, beforeWrite }) {
  const svc = {
    list: (user, query) => repo.list(query, repo.scopeFor(user)),
    async get(user, id) {
      const row = await repo.findById(id, repo.scopeFor(user));
      if (!row) throw notFound(label);
      return row;
    },
    async create(ctx, data) {
      const clean = beforeWrite ? await beforeWrite(ctx.user, data, null) : data;
      const id = await db.withTransaction(async (conn) => {
        const newId = await repo.create(clean, conn);
        await audit(ctx, 'CREAR', entity, newId, null, conn);
        return newId;
      });
      return svc.get(ctx.user, id);
    },
    async update(ctx, id, data) {
      const current = await svc.get(ctx.user, id);
      const clean = beforeWrite ? await beforeWrite(ctx.user, data, current) : data;
      await db.withTransaction(async (conn) => {
        await repo.update(id, clean, repo.scopeFor(ctx.user), conn);
        await audit(ctx, 'ACTUALIZAR', entity, id, Object.keys(clean), conn);
      });
      return svc.get(ctx.user, id);
    },
    async setActive(ctx, id, activo) {
      await svc.get(ctx.user, id);
      await db.withTransaction(async (conn) => {
        await repo.setActive(id, activo, repo.scopeFor(ctx.user), conn);
        await audit(ctx, activo ? 'ACTIVAR' : 'DESACTIVAR', entity, id, null, conn);
      });
      return svc.get(ctx.user, id);
    },
  };
  return svc;
}

function createCrudRoutes({ service, read, write, createSchema, updateSchema }) {
  const r = express.Router();
  r.get('/', requirePerm(read), asyncHandler(async (req, res) => res.json(await service.list(req.user, req.query))));
  r.get('/:id', requirePerm(read), asyncHandler(async (req, res) => res.json(await service.get(req.user, Number(req.params.id)))));
  r.post('/', requirePerm(write), validate(createSchema), asyncHandler(async (req, res) => res.status(201).json(await service.create(ctxOf(req), req.valid))));
  r.put('/:id', requirePerm(write), validate(updateSchema), asyncHandler(async (req, res) => res.json(await service.update(ctxOf(req), Number(req.params.id), req.valid))));
  r.patch('/:id/activo', requirePerm(write), validate(z.object({ activo: z.boolean() })), asyncHandler(async (req, res) => res.json(await service.setActive(ctxOf(req), Number(req.params.id), req.valid.activo))));
  return r;
}

module.exports = { createCrudService, createCrudRoutes };
