// src/routes/listasRoutes.js
const express = require('express');
const router = express.Router();
const { crearLista, obtenerListas, anadirItem, completarItem } = require('../controllers/listasController');

router.post('/crear', crearLista);
router.get('/:id_viaje', obtenerListas);
router.post('/items/anadir', anadirItem);
router.patch('/items/:id_item/completar', completarItem);

module.exports = router;