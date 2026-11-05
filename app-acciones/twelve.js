require('dotenv').config();
const db = require('./db');

// Consulta el precio en Twelve Data y lo guarda en MySQL
async function actualizarPrecio(simbolo) {
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

module.exports = { actualizarPrecio };