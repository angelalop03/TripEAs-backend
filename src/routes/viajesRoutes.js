// src/routes/viajesRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { crearViaje, misViajes, unirseAViaje, subirPortada, obtenerViaje, actualizarViaje } = require('../controllers/viajesController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB para portadas
});

router.post('/crear', crearViaje);
router.get('/mis-viajes', misViajes);
router.post('/unirse', unirseAViaje);
router.post('/subir-portada', upload.single('archivo'), subirPortada);
// :id_viaje va después de las rutas literales (mis-viajes, crear, unirse,
// subir-portada) para que Express no las confunda con un id.
router.get('/:id_viaje', obtenerViaje);
router.put('/:id_viaje', actualizarViaje);

module.exports = router;
