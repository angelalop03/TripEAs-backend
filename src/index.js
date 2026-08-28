// src/index.js
// Punto de entrada del servidor Express — arranca la app de app.js.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor TripEas escuchando en http://localhost:${PORT}`);
});
