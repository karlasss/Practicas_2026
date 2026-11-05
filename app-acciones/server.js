require('dotenv').config();
const express = require('express');
const db = require('./db');
const { obtenerTipoCambio } = require('./banguat');

const app = express();
app.use(express.static('public'));

// Tipo de cambio: primero busca en MySQL; si no hay de hoy, lo pide a Banguat
async function tipoCambioDeHoy() {
  const [filas] = await db.query('SELECT usd_a_gtq FROM tipo_cambio WHERE fecha = CURDATE()');
  if (filas.length > 0) return Number(filas[0].usd_a_gtq);

  try {
    const tasa = await obtenerTipoCambio();
    await db.query('INSERT INTO tipo_cambio (fecha, usd_a_gtq) VALUES (CURDATE(), ?)', [tasa]);
    return tasa;
  } catch (error) {
    // Si Banguat no responde, usamos el último tipo de cambio guardado
    const [ultimo] = await db.query('SELECT usd_a_gtq FROM tipo_cambio ORDER BY fecha DESC LIMIT 1');
    if (ultimo.length > 0) return Number(ultimo[0].usd_a_gtq);
    throw error;
  }
}

// Precio: primero busca en MySQL; si no se consultó hoy, lo pide a Twelve Data
async function precioDeAccion(simbolo) {
  const [filas] = await db.query(
    `SELECT e.nombre, DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha, p.precio_cierre
     FROM precios_diarios p JOIN empresas e ON e.simbolo = p.simbolo
     WHERE p.simbolo = ? AND p.actualizado = CURDATE()
     ORDER BY p.fecha DESC LIMIT 1`,
    [simbolo]
  );
  if (filas.length > 0) {
    return { nombre: filas[0].nombre, fecha: filas[0].fecha, precio: Number(filas[0].precio_cierre), origen: 'base de datos' };
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(simbolo)}&apikey=${process.env.TWELVE_API_KEY}`;
  const datos = await (await fetch(url)).json();
  if (datos.status === 'error') throw new Error(datos.message);

  await db.query(
    'INSERT INTO empresas (simbolo, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
    [simbolo, datos.name]
  );
  await db.query(
    `INSERT INTO precios_diarios (simbolo, fecha, precio_cierre, actualizado) VALUES (?, ?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE precio_cierre = VALUES(precio_cierre), actualizado = CURDATE()`,
    [simbolo, datos.datetime, datos.close]
  );
  return { nombre: datos.name, fecha: datos.datetime, precio: Number(datos.close), origen: 'Twelve Data' };
}

// Ruta que usa la página: precio en dólares y en quetzales
app.get('/api/accion/:simbolo', async (req, res) => {
  try {
    const simbolo = req.params.simbolo.trim().toUpperCase();
    const accion = await precioDeAccion(simbolo);
    const tasa = await tipoCambioDeHoy();
    res.json({ simbolo, ...accion, tipoCambio: tasa, precioGTQ: Number((accion.precio * tasa).toFixed(2)) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));