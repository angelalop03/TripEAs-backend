// src/routes/viajesRoutes.js
const express = require('express');
const router = express.Router();
const { crearViaje, misViajes, unirseAViaje } = require('../controllers/viajesController');

router.post('/crear', crearViaje);
router.get('/mis-viajes', misViajes);
router.post('/unirse', unirseAViaje);

module.exports = router;