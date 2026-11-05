require('dotenv').config();
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.static('public'));

// Ruta de prueba: precio actual de una acción
app.get('/api/precio/:simbolo', async (req, res) => {
  const simbolo = req.params.simbolo.toUpperCase();
  const url = `https://api.twelvedata.com/quote?symbol=${simbolo}&apikey=${process.env.TWELVE_API_KEY}`;

  const respuesta = await fetch(url);
  const datos = await respuesta.json();

  if (datos.status === 'error') {
    return res.status(400).json({ error: datos.message });
  }
  res.json({ simbolo, nombre: datos.name, precio: datos.close, fecha: datos.datetime });
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));