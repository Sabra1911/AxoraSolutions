const router = require('express').Router();
const { authenticate } = require('./middleware/auth');

router.use('/auth', require('./modules/auth/routes'));

// Todo lo demás exige JWT válido; los permisos se verifican por ruta
router.use('/publico', require('./modules/promociones/module').publicRouter);
router.use('/adjuntos', require('./modules/adjuntos/module').router);
router.use('/notificaciones', require('./modules/notificaciones/module').router);
router.use(authenticate);
router.use('/ia', require('./modules/ia/module').router);
router.use('/empresas', require('./modules/empresas/routes'));
router.use('/usuarios', require('./modules/usuarios/module').router);
router.use('/servicios', require('./modules/servicios/module').router);
router.use('/equipos', require('./modules/equipos/module').router);
router.use('/solicitudes', require('./modules/solicitudes/module').router);
router.use('/promociones', require('./modules/promociones/module').router);
router.use('/cotizaciones', require('./modules/cotizaciones/module').router);
router.use('/ordenes', require('./modules/ordenes/module').router);
router.use('/planes', require('./modules/planes/module').planesRouter);
router.use('/contratos', require('./modules/planes/module').contratosRouter);
router.use('/mantenimientos', require('./modules/mantenimientos/module').router);
router.use('/historial', require('./modules/historial/module').router);
router.use('/reportes', require('./modules/reportes/module').router);

module.exports = router;
