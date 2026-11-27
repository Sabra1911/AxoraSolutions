const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    },
  },
}));

// CORS controlado: solo orígenes configurados (las peticiones sin Origin, p. ej. mismo origen, pasan)
app.use(cors({
  origin(origin, cb) { cb(null, !origin || env.corsOrigins.includes(origin)); },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use('/api', notFoundHandler);

// En producción el backend sirve el frontend compilado (mismo origen → cookie de refresco SameSite=Strict)
const dist = path.resolve(__dirname, '../../frontend/dist/ms-en-linea/browser');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);
module.exports = app;
