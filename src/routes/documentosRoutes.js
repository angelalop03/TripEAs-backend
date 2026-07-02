// src/routes/documentosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { subirDocumento, obtenerDocumentos, eliminarDocumento } = require('../controllers/documentosController');

// Multer en memoria (no guarda en disco, pasa el buffer directamente a Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // límite 10MB por archivo
});

router.post('/subir', upload.single('archivo'), subirDocumento);
router.get('/:id_viaje', obtenerDocumentos);
router.delete('/:id_documento', eliminarDocumento);

module.exports = router;