require('dotenv').config();
const express = require('express');
const db = require('./db');
const { obtenerTipoCambio } = require('./banguat');
const { actualizarPrecio, cargarHistorial } = require('./twelve');
const { iniciarTareaDiaria } = require('./tarea');
const { obtenerFundamentales } = require('./finnhub');
const { calificar, PERFILES } = require('./decision');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ¿Está abierta la bolsa de Nueva York ahora? (lunes a viernes, 9:30 a.m. a 4:00 p.m. hora de Nueva York)
    function bolsaAbiertaAhora() {
      const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const dia = ny.getDay();
      const minutos = ny.getHours() * 60 + ny.getMinutes();
      return dia >= 1 && dia <= 5 && minutos >= 570 && minutos < 960;
    }

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

/// Precio: primero busca en MySQL; si no se consultó hoy, lo pide a Twelve Data
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
  return actualizarPrecio(simbolo);
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

// Días de cada periodo
const DIAS = { '1M': 30, '6M': 182, '1A': 365, '5A': 1825 };

// ================= Datos de un día (cada 5 minutos) =================
// Se guardan en memoria para no gastar créditos en cada clic
const cacheIntradia = new Map();
const MINUTOS_CACHE = 10;

// ¿Los datos guardados de esta empresa todavía sirven?
function intradiaVigente(simbolo) {
  const guardado = cacheIntradia.get(simbolo);
  if (!guardado) return false;
  // Si se guardaron con la bolsa cerrada y sigue cerrada, el día no ha cambiado
  if (guardado.cerrada && !bolsaAbiertaAhora()) return true;
  // Si la bolsa está abierta, sirven solo por unos minutos
  return Date.now() - guardado.hora < MINUTOS_CACHE * 60 * 1000;
}

async function datosDeUnDia(simbolo) {
  if (intradiaVigente(simbolo)) return cacheIntradia.get(simbolo).datos;

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(simbolo)}&interval=5min&outputsize=90&timezone=America/Guatemala&apikey=${process.env.TWELVE_API_KEY}`;
  const respuesta = await (await fetch(url)).json();
  if (respuesta.status === 'error') throw new Error(respuesta.message);

  // Twelve Data manda del más reciente al más antiguo: nos quedamos solo con el último día de bolsa
  const ultimoDia = respuesta.values[0].datetime.slice(0, 10);
  const datos = respuesta.values
    .filter((v) => v.datetime.startsWith(ultimoDia))
    .reverse()
    .map((v) => ({ fecha: v.datetime.slice(0, 16), precio: Number(v.close), volumen: Number(v.volume) || 0 }));

  cacheIntradia.set(simbolo, { datos, hora: Date.now(), cerrada: !bolsaAbiertaAhora() });
  return datos;
}

// Ruta de comparación: historial de hasta 10 acciones
app.get('/api/historial', async (req, res) => {
  try {
    const simbolos = [...new Set(
      (req.query.simbolos || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )].slice(0, 10);
    if (simbolos.length === 0) return res.status(400).json({ error: 'Escribe al menos un símbolo' });

    const unDia = req.query.periodo === '1D';
    const dias = DIAS[req.query.periodo] || 182;
    const acciones = [];
    const errores = [];
    let descargas = 0;

    for (const simbolo of simbolos) {
      try {
        let datos;

        if (unDia) {
          // 1 día: datos cada 5 minutos (1 crédito por empresa si no están en memoria)
          if (!intradiaVigente(simbolo)) {
            if (descargas > 0 && descargas % 7 === 0) {
              console.log('Esperando 1 minuto por el límite de Twelve Data...');
              await esperar(61000);
            }
            descargas++;
          }
          datos = await datosDeUnDia(simbolo);
        } else {
          // Otros periodos: historial diario guardado en MySQL
          const [empresa] = await db.query('SELECT historial_cargado FROM empresas WHERE simbolo = ?', [simbolo]);
          if (empresa.length === 0 || !empresa[0].historial_cargado) {
            if (descargas > 0 && descargas % 7 === 0) {
              console.log('Esperando 1 minuto por el límite de Twelve Data...');
              await esperar(61000);
            }
            await cargarHistorial(simbolo);
            descargas++;
          }
          const [filas] = await db.query(
            `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, precio_cierre AS precio, volumen
             FROM precios_diarios
             WHERE simbolo = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             ORDER BY fecha`,
            [simbolo, dias]
          );
          datos = filas.map((f) => ({ fecha: f.fecha, precio: Number(f.precio), volumen: Number(f.volumen) || 0 }));
        }

        // Nombre: de empresas si ya la consultamos, si no del catálogo
        const [nombre] = await db.query(
          `SELECT COALESCE(
             (SELECT nombre FROM empresas WHERE simbolo = ? AND nombre <> simbolo),
             (SELECT nombre FROM catalogo WHERE simbolo = ? LIMIT 1),
             ?) AS nombre`,
          [simbolo, simbolo, simbolo]
        );
        acciones.push({ simbolo, nombre: nombre[0].nombre, datos });
      } catch (error) {
        errores.push(`${simbolo}: ${error.message}`);
      }
    }

    if (acciones.length === 0) return res.status(400).json({ error: errores.join(' · ') });
    const tipoCambio = await tipoCambioDeHoy();
    res.json({ tipoCambio, acciones, errores });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Sugerencias mientras escribes (salen del catálogo en MySQL, no gastan créditos)
app.get('/api/sugerencias', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const [filas] = await db.query(
      `SELECT simbolo, nombre, bolsa FROM catalogo
       WHERE simbolo LIKE ? OR nombre LIKE ?
       ORDER BY (simbolo = ?) DESC, (simbolo LIKE ?) DESC, LENGTH(nombre)
       LIMIT 8`,
      [`${q}%`, `%${q}%`, q, `${q}%`]
    );
    res.json(filas);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Lee la información de cierre guardada de una empresa
async function leerCotizacion(simbolo) {
  const [filas] = await db.query('SELECT ultima_cotizacion FROM empresas WHERE simbolo = ?', [simbolo]);
  const valor = filas[0]?.ultima_cotizacion ?? null;
  return typeof valor === 'string' ? JSON.parse(valor) : valor;
}

// Ficha completa: precio, cierre del día y fundamentales
app.get('/api/ficha/:simbolo', async (req, res) => {
  try {
    const simbolo = req.params.simbolo.trim().toUpperCase();
    let accion = await precioDeAccion(simbolo);
    let cotizacion = await leerCotizacion(simbolo);

    
    // Volvemos a pedir los datos si: no hay, son del formato viejo (sin fecha),
    // o se guardaron con la bolsa abierta y la bolsa ya cerró
    if (!cotizacion || !cotizacion.fecha || (cotizacion.mercadoAbierto && !bolsaAbiertaAhora())) {
      accion = await actualizarPrecio(simbolo);
      cotizacion = await leerCotizacion(simbolo);
    }

    // Si Finnhub falla, la ficha se muestra igual, solo sin fundamentales
    let fundamentales = null;
    try {
      fundamentales = await obtenerFundamentales(simbolo);
    } catch (error) {
      console.log(`Fundamentales de ${simbolo}:`, error.message);
    }

    const tasa = await tipoCambioDeHoy();
    res.json({
      simbolo, ...accion, cotizacion, fundamentales,
      tipoCambio: tasa,
      precioGTQ: Number((accion.precio * tasa).toFixed(2)),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Ayúdame a decidir: califica y ordena empresas según el perfil del usuario
app.get('/api/decidir', async (req, res) => {
  try {
    const simbolos = [...new Set(
      (req.query.simbolos || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )].slice(0, 10);
    if (simbolos.length === 0) return res.status(400).json({ error: 'Elige al menos una empresa' });

    const perfil = PERFILES[req.query.perfil] ? req.query.perfil : 'equilibrado';
    const resultados = [];
    const errores = [];

    for (const simbolo of simbolos) {
      try {
        const fundamentales = await obtenerFundamentales(simbolo);

        // Nombre: de empresas si ya la consultamos, si no del catálogo
        const [nombre] = await db.query(
          `SELECT COALESCE(
             (SELECT nombre FROM empresas WHERE simbolo = ? AND nombre <> simbolo),
             (SELECT nombre FROM catalogo WHERE simbolo = ? LIMIT 1),
             ?) AS nombre`,
          [simbolo, simbolo, simbolo]
        );

        // Último precio guardado (si la empresa ya se había consultado)
        const [precio] = await db.query(
          'SELECT precio_cierre FROM precios_diarios WHERE simbolo = ? ORDER BY fecha DESC LIMIT 1',
          [simbolo]
        );

        resultados.push({
          simbolo,
          nombre: nombre[0].nombre,
          precio: precio.length ? Number(precio[0].precio_cierre) : null,
          ...calificar(fundamentales, perfil),
        });
      } catch (error) {
        errores.push(`${simbolo}: ${error.message}`);
      }
    }

    // De mayor a menor puntaje; las que no tienen puntaje van al final
    resultados.sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));

    const tipoCambio = await tipoCambioDeHoy();
    res.json({ perfil: PERFILES[perfil].nombre, tipoCambio, resultados, errores });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Servidor en http://localhost:3000');
  iniciarTareaDiaria();
});