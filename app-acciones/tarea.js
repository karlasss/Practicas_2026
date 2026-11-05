const cron = require('node-cron');
const db = require('./db');
const { obtenerTipoCambio } = require('./banguat');
const { actualizarPrecio } = require('./twelve');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Guarda el tipo de cambio del día
async function actualizarTipoCambio() {
  try {
    const tasa = await obtenerTipoCambio();
    await db.query(
      `INSERT INTO tipo_cambio (fecha, usd_a_gtq) VALUES (CURDATE(), ?)
       ON DUPLICATE KEY UPDATE usd_a_gtq = VALUES(usd_a_gtq)`,
      [tasa]
    );
    console.log(`Tipo de cambio guardado: Q${tasa}`);
  } catch (error) {
    console.log('No se pudo actualizar el tipo de cambio:', error.message);
  }
}

// 2. Actualiza el precio de cierre de cada empresa guardada
async function actualizarPrecios() {
  const [empresas] = await db.query('SELECT simbolo FROM empresas');
  console.log(`Actualizando ${empresas.length} acciones...`);

  for (let i = 0; i < empresas.length; i++) {
    // Cada 7 acciones espera 1 minuto para no pasar el límite de Twelve Data
    if (i > 0 && i % 7 === 0) {
      console.log('Esperando 1 minuto por el límite de Twelve Data...');
      await esperar(61000);
    }
    const simbolo = empresas[i].simbolo;
    try {
      const datos = await actualizarPrecio(simbolo);
      console.log(`${simbolo}: $${datos.precio} (${datos.fecha})`);
    } catch (error) {
      console.log(`${simbolo}: error - ${error.message}`);
    }
  }
}

// La tarea completa
async function ejecutarActualizacion() {
  console.log(`[${new Date().toLocaleString('es-GT')}] Iniciando actualización diaria`);
  await actualizarTipoCambio();

  const dia = new Date().getDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) {
    console.log('Fin de semana: la bolsa está cerrada, no se actualizan precios.');
  } else {
    await actualizarPrecios();
  }
  console.log('Actualización terminada');
}

// Programa la tarea todos los días a las 5:00 p.m., hora de Guatemala
function iniciarTareaDiaria() {
  cron.schedule('0 17 * * *', ejecutarActualizacion, { timezone: 'America/Guatemala' });
  console.log('Tarea diaria programada: 5:00 p.m. (hora de Guatemala)');
}

module.exports = { iniciarTareaDiaria, ejecutarActualizacion };

// Si ejecutas "node tarea.js" directamente, corre la actualización una vez (para probar)
if (require.main === module) {
  ejecutarActualizacion().then(() => process.exit());
}