// src/app.js
// Construcción de la app de Express, separada de index.js (que solo la
// arranca con .listen()) para poder importarla en los tests de integración
// con supertest sin levantar un servidor real en un puerto.
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const viajesRoutes = require('./routes/viajesRoutes');
const participantesRoutes = require('./routes/participantesRoutes');
const gastosRoutes = require('./routes/gastosRoutes');
const calendarioRoutes = require('./routes/calendarioRoutes');
const listasRoutes = require('./routes/listasRoutes');
const ruletaRoutes = require('./routes/ruletaRoutes');
const documentosRoutes = require('./routes/documentosRoutes');
const albumRoutes = require('./routes/albumRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Ruta de prueba para comprobar que el servidor está vivo
app.get('/', (req, res) => {
  res.json({ message: 'TripEas API funcionando correctamente 🚀' });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/viajes', viajesRoutes);
app.use('/api/participantes', participantesRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/listas', listasRoutes);
app.use('/api/ruleta', ruletaRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/album', albumRoutes);

module.exports = app;
