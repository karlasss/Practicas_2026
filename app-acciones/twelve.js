require('dotenv').config();
const db = require('./db');

// Consulta el precio en Twelve Data y lo guarda en MySQL
async function actualizarPrecio(simbolo) {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(simbolo)}&apikey=${process.env.TWELVE_API_KEY}`;
  const datos = await (await fetch(url)).json();
  if (datos.status === 'error') throw new Error(datos.message);

  // Información de cierre del día
  const cotizacion = {
    apertura: Number(datos.open),
    maximo: Number(datos.high),
    minimo: Number(datos.low),
    cierre: Number(datos.close),
    cierreAnterior: Number(datos.previous_close),
    cambio: Number(datos.change),
    cambioPct: Number(datos.percent_change),
    volumen: Number(datos.volume),
    bolsa: datos.exchange,
    fecha: datos.datetime,
    mercadoAbierto: datos.is_market_open,
  };

  await db.query(
    `INSERT INTO empresas (simbolo, nombre, ultima_cotizacion) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), ultima_cotizacion = VALUES(ultima_cotizacion)`,
    [simbolo, datos.name, JSON.stringify(cotizacion)]
  );
  await db.query(
    `INSERT INTO precios_diarios (simbolo, fecha, precio_cierre, volumen, actualizado) VALUES (?, ?, ?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE precio_cierre = VALUES(precio_cierre), volumen = VALUES(volumen), actualizado = CURDATE()`,
    [simbolo, datos.datetime, datos.close, datos.volume]
  );
  return { nombre: datos.name, fecha: datos.datetime, precio: Number(datos.close), origen: 'Twelve Data' };
}

// Descarga hasta 5 años de precios diarios en una sola consulta (1 crédito)
async function cargarHistorial(simbolo) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(simbolo)}&interval=1day&outputsize=1300&apikey=${process.env.TWELVE_API_KEY}`;
  const datos = await (await fetch(url)).json();
  if (datos.status === 'error') throw new Error(datos.message);

  await db.query('INSERT IGNORE INTO empresas (simbolo, nombre) VALUES (?, ?)', [simbolo, simbolo]);

  const filas = datos.values.map((dia) => [simbolo, dia.datetime, dia.close, dia.volume]);
  await db.query(
    `INSERT INTO precios_diarios (simbolo, fecha, precio_cierre, volumen) VALUES ?
     ON DUPLICATE KEY UPDATE precio_cierre = VALUES(precio_cierre), volumen = VALUES(volumen)`,
    [filas]
  );
  await db.query('UPDATE empresas SET historial_cargado = TRUE WHERE simbolo = ?', [simbolo]);
}

module.exports = { actualizarPrecio, cargarHistorial };