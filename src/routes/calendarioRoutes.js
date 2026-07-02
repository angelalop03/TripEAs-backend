// src/routes/calendarioRoutes.js
const express = require('express');
const router = express.Router();
const { crearEvento, obtenerEventos, editarEvento, eliminarEvento } = require('../controllers/calendarioController');

router.post('/crear', crearEvento);
router.get('/:id_viaje', obtenerEventos);
router.put('/:id_evento', editarEvento);
router.delete('/:id_evento', eliminarEvento);

module.exports = router;