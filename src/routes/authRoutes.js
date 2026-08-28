// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { registro, login, cambiarPassword } = require('../controllers/authController');

router.post('/registro', registro);
router.post('/login', login);
router.put('/cambiar-password', cambiarPassword);

module.exports = router;