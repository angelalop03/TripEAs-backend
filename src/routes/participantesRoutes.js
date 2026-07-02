// src/routes/participantesRoutes.js
const express = require('express');
const router = express.Router();
const {
  anadirFantasma,
  reclamarIdentidad,
  listarParticipantes,
} = require('../controllers/participantesController');

router.post('/anadir-fantasma', anadirFantasma);
router.post('/reclamar-identidad', reclamarIdentidad);
router.get('/:id_viaje', listarParticipantes);

module.exports = router;