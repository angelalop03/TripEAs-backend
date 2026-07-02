// src/routes/ruletaRoutes.js
const express = require('express');
const router = express.Router();
const { crearRuleta, girarRuleta, obtenerRuletas } = require('../controllers/ruletaController');

router.post('/crear', crearRuleta);
router.post('/:id_ruleta/girar', girarRuleta);
router.get('/:id_viaje', obtenerRuletas);

module.exports = router;