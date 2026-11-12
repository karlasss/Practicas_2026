require('dotenv').config();
const db = require('./db');

// Descarga la lista de empresas de NASDAQ y NYSE y la guarda en MySQL
async function cargarCatalogo() {
  let total = 0;
  for (const bolsa of ['NASDAQ', 'NYSE']) {
    const url = `https://api.twelvedata.com/stocks?exchange=${bolsa}&apikey=${process.env.TWELVE_API_KEY}`;
    const respuesta = await (await fetch(url)).json();
    if (!respuesta.data) throw new Error(respuesta.message || `No se pudo descargar ${bolsa}`);

    const filas = respuesta.data.map((a) => [a.symbol, a.name, bolsa]);
    // Se guardan en grupos de 1000 para no hacer una consulta gigante
    for (let i = 0; i < filas.length; i += 1000) {
      await db.query(
        `INSERT INTO catalogo (simbolo, nombre, bolsa) VALUES ?
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), bolsa = VALUES(bolsa)`,
        [filas.slice(i, i + 1000)]
      );
    }
    console.log(`${bolsa}: ${filas.length} empresas guardadas`);
    total += filas.length;
  }
  return total;
}

module.exports = { cargarCatalogo };

// Si ejecutas "node catalogo.js", descarga la lista una vez
if (require.main === module) {
  cargarCatalogo()
    .then((total) => { console.log(`Catálogo listo: ${total} empresas`); process.exit(); })
    .catch((error) => { console.log('Error:', error.message); process.exit(1); });
}