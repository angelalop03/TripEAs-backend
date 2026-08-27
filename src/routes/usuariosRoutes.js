// src/routes/usuariosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { obtenerPerfil, actualizarPerfil, subirFotoPerfil } = require('../controllers/usuariosController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB para fotos de perfil
});

router.get('/perfil', obtenerPerfil);
router.put('/perfil', actualizarPerfil);
router.post('/subir-foto-perfil', upload.single('archivo'), subirFotoPerfil);

module.exports = router;
