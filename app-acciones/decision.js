// ================= Reglas para calificar empresas =================

const vacio = (v) => v === null || v === undefined || isNaN(v);
const formato = (v, sufijo = '') => (vacio(v) ? 'sin dato' : `${Number(v).toFixed(2)}${sufijo}`);

// Convierte un valor en puntos según rangos.
// Ejemplo: escala(1.2, [0.8, 1, 1.3], [100, 80, 60, 35]) → 1.2 es menor que 1.3, así que da 60
function escala(valor, cortes, puntos) {
  for (let i = 0; i < cortes.length; i++) {
    if (valor < cortes[i]) return puntos[i];
  }
  return puntos[puntos.length - 1];
}

// Los 7 criterios: de dónde sale el dato, cómo se califica y cómo se explica
const CRITERIOS = {
  valoracion: {
    nombre: 'Precio razonable',
    valor: (f) => f.pe,
    texto: (f) => `P/E ${formato(f.pe)}`,
    puntos: (pe) => (pe <= 0 ? 15 : escala(pe, [15, 25, 40, 60], [100, 75, 50, 30, 15])),
    bueno: 'Su precio es razonable comparado con lo que gana',
    malo: 'Está cara comparada con sus ganancias, o tiene pérdidas',
  },
  dividendo: {
    nombre: 'Dividendos',
    valor: (f) => f.dividendo ?? 0, // si no hay dato, normalmente es porque no paga dividendos
    texto: (f) => `${formato(f.dividendo ?? 0, '%')} al año`,
    puntos: (d) => escala(d, [0.01, 1, 2, 4, 8], [0, 30, 55, 85, 100, 75]),
    bueno: 'Paga buenos dividendos a sus accionistas',
    malo: 'Paga pocos dividendos o ninguno',
  },
  riesgo: {
    nombre: 'Estabilidad',
    valor: (f) => f.beta,
    texto: (f) => `Beta ${formato(f.beta)}`,
    puntos: (b) => escala(b, [0.8, 1, 1.3, 1.7], [100, 80, 60, 35, 15]),
    bueno: 'Su precio es más estable que el promedio del mercado',
    malo: 'Su precio sube y baja mucho (más riesgo)',
  },
  crecimiento: {
    nombre: 'Crecimiento',
    valor: (f) => f.crecimientoIngresos,
    texto: (f) => `Ventas ${formato(f.crecimientoIngresos, '%')} en un año`,
    puntos: (c) => escala(c, [0, 5, 15, 30], [15, 40, 70, 90, 100]),
    bueno: 'Sus ventas están creciendo con fuerza',
    malo: 'Sus ventas crecen poco o están bajando',
  },
  rentabilidad: {
    nombre: 'Rentabilidad',
    valor: (f) => f.margenNeto,
    texto: (f) => `Margen neto ${formato(f.margenNeto, '%')}`,
    puntos: (m) => escala(m, [0, 5, 15, 25], [10, 35, 65, 85, 100]),
    bueno: 'Le queda una buena ganancia de lo que vende',
    malo: 'Le queda poca ganancia de lo que vende, o pierde dinero',
  },
  deuda: {
    nombre: 'Deuda',
    valor: (f) => f.deudaCapital,
    texto: (f) => `Deuda / capital ${formato(f.deudaCapital)}`,
    puntos: (d) => escala(d, [0.3, 1, 2], [100, 75, 45, 20]),
    bueno: 'Tiene poca deuda',
    malo: 'Está bastante endeudada',
  },
  tendencia: {
    nombre: 'Tendencia',
    valor: (f) => f.rendimiento52,
    texto: (f) => `${formato(f.rendimiento52, '%')} en el último año`,
    puntos: (r) => escala(r, [-20, 0, 15, 40], [15, 40, 65, 85, 100]),
    bueno: 'Su precio ha subido bien en el último año',
    malo: 'Su precio ha bajado en el último año',
  },
};

// Cuánto pesa cada criterio en cada perfil (cada perfil suma 100)
const PERFILES = {
  conservador: { nombre: 'Poco riesgo', pesos: { riesgo: 30, deuda: 20, rentabilidad: 20, valoracion: 15, dividendo: 15 } },
  dividendos: { nombre: 'Dividendos', pesos: { dividendo: 40, rentabilidad: 20, deuda: 15, riesgo: 15, valoracion: 10 } },
  crecimiento: { nombre: 'Crecimiento', pesos: { crecimiento: 35, tendencia: 20, rentabilidad: 20, deuda: 10, valoracion: 10, riesgo: 5 } },
  equilibrado: { nombre: 'Equilibrado', pesos: { crecimiento: 20, rentabilidad: 20, valoracion: 15, riesgo: 15, dividendo: 10, deuda: 10, tendencia: 10 } },
};

// Califica una empresa según sus fundamentales y el perfil elegido
function calificar(f, perfil) {
  const criterios = [];
  let suma = 0;
  let pesoUsado = 0;

  for (const [clave, peso] of Object.entries(PERFILES[perfil].pesos)) {
    const c = CRITERIOS[clave];
    const valor = c.valor(f);
    const puntos = vacio(valor) ? null : c.puntos(Number(valor));
    if (puntos !== null) {
      suma += puntos * peso;
      pesoUsado += peso;
    }
    criterios.push({ nombre: c.nombre, peso, puntos, texto: c.texto(f), bueno: c.bueno, malo: c.malo });
  }

  const limpios = criterios.map(({ nombre, peso, puntos, texto }) => ({ nombre, peso, puntos, texto }));

  // Si faltan datos de más de la mitad del peso, no damos un puntaje poco confiable
  if (pesoUsado < 50) {
    return { puntaje: null, veredicto: 'No hay suficientes datos para calificarla', nivel: 'bajo', criterios: limpios, fortalezas: [], debilidades: [] };
  }

  const puntaje = Math.round(suma / pesoUsado);

  // Las fortalezas y debilidades más importantes para este perfil
  const fortalezas = criterios.filter((c) => c.puntos >= 75).sort((a, b) => b.peso - a.peso).slice(0, 3).map((c) => c.bueno);
  const debilidades = criterios.filter((c) => c.puntos !== null && c.puntos <= 35).sort((a, b) => b.peso - a.peso).slice(0, 3).map((c) => c.malo);

  let veredicto;
  let nivel;
  if (puntaje >= 75) [veredicto, nivel] = ['Muy compatible con tu perfil', 'alto'];
  else if (puntaje >= 60) [veredicto, nivel] = ['Compatible con tu perfil', 'alto'];
  else if (puntaje >= 45) [veredicto, nivel] = ['Compatibilidad regular con tu perfil', 'medio'];
  else [veredicto, nivel] = ['Poco compatible con tu perfil', 'bajo'];

  return { puntaje, veredicto, nivel, criterios: limpios, fortalezas, debilidades };
}

module.exports = { calificar, PERFILES };