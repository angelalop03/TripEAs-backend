// src/routes/gastosRoutes.js
const express = require('express');
const router = express.Router();
const { registrarGasto, obtenerGastos, obtenerLiquidacion } = require('../controllers/gastosController');

router.post('/registrar', registrarGasto);
router.get('/:id_viaje', obtenerGastos);
router.get('/:id_viaje/liquidacion', obtenerLiquidacion);

module.exports = router;