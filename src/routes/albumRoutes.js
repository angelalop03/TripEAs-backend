// src/routes/albumRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { subirArchivo, obtenerAlbum, eliminarArchivo } = require('../controllers/albumController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // límite 50MB para vídeos
});

router.post('/subir', upload.single('archivo'), subirArchivo);
router.get('/:id_viaje', obtenerAlbum);
router.delete('/:id_archivo', eliminarArchivo);

module.exports = router;