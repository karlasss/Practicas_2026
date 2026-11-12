require('dotenv').config();
const db = require('./db');

const BASE = 'https://finnhub.io/api/v1';

async function consultarFinnhub(ruta) {
  const respuesta = await fetch(`${BASE}${ruta}&token=${process.env.FINNHUB_API_KEY}`);
  if (!respuesta.ok) throw new Error(`Finnhub respondió con error ${respuesta.status}`);
  return respuesta.json();
}

// Descarga los fundamentales de Finnhub y los guarda en MySQL
async function actualizarFundamentales(simbolo) {
  const perfil = await consultarFinnhub(`/stock/profile2?symbol=${encodeURIComponent(simbolo)}`);
  const { metric: m = {} } = await consultarFinnhub(`/stock/metric?symbol=${encodeURIComponent(simbolo)}&metric=all`);

  const datos = {
    industria: perfil.finnhubIndustry ?? null,
    pais: perfil.country ?? null,
    web: perfil.weburl ?? null,
    logo: perfil.logo ?? null,
    capitalizacion: m.marketCapitalization ?? perfil.marketCapitalization ?? null, // en millones de USD
    pe: m.peTTM ?? m.peBasicExclExtraTTM ?? null,
    eps: m.epsTTM ?? m.epsBasicExclExtraItemsTTM ?? null,
    dividendo: m.dividendYieldIndicatedAnnual ?? null,
    beta: m.beta ?? null,
    max52: m['52WeekHigh'] ?? null,
    min52: m['52WeekLow'] ?? null,
    rendimiento52: m['52WeekPriceReturnDaily'] ?? null,
    crecimientoIngresos: m.revenueGrowthTTMYoy ?? null,
    margenNeto: m.netProfitMarginTTM ?? null,
    roe: m.roeTTM ?? null,
    deudaCapital: m['totalDebt/totalEquityQuarterly'] ?? null,
  };

  await db.query(
    `INSERT INTO fundamentales (simbolo, datos, actualizado) VALUES (?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE datos = VALUES(datos), actualizado = CURDATE()`,
    [simbolo, JSON.stringify(datos)]
  );
  return datos;
}

// Usa los datos guardados si tienen menos de 7 días; si no, los actualiza
async function obtenerFundamentales(simbolo) {
  const [filas] = await db.query(
    'SELECT datos FROM fundamentales WHERE simbolo = ? AND actualizado >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)',
    [simbolo]
  );
  if (filas.length > 0) {
    const datos = filas[0].datos;
    return typeof datos === 'string' ? JSON.parse(datos) : datos;
  }
  return actualizarFundamentales(simbolo);
}

module.exports = { obtenerFundamentales, actualizarFundamentales };