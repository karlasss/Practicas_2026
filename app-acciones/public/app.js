// ================= Pestañas =================
document.querySelectorAll('.pestana').forEach((pestana) => {
  pestana.addEventListener('click', () => {
    document.querySelectorAll('.pestana').forEach((p) => p.classList.remove('activa'));
    document.querySelectorAll('.seccion').forEach((s) => s.classList.add('oculto'));
    pestana.classList.add('activa');
    document.getElementById(pestana.dataset.seccion).classList.remove('oculto');
  });
});

// ================= Selector de empresas con sugerencias =================
// Se usa en Comparar y en Ayúdame a decidir
function crearSelector(idContenedor, maximo = 10) {
  const contenedor = document.getElementById(idContenedor);
  contenedor.className = 'selector';
  contenedor.innerHTML = `
    <div class="etiquetas"></div>
    <div class="campo-autocompletar">
      <input type="text" placeholder="Escribe una empresa y elígela" autocomplete="off">
      <ul class="sugerencias oculto"></ul>
    </div>`;

  const zona = contenedor.querySelector('.etiquetas');
  const campo = contenedor.querySelector('input');
  const lista = contenedor.querySelector('.sugerencias');
  const elegidas = [];
  let opciones = [];
  let marcada = -1;
  let espera = null;

  async function pedirSugerencias(texto) {
    const respuesta = await fetch(`/api/sugerencias?q=${encodeURIComponent(texto)}`);
    return respuesta.json();
  }

  function dibujarEtiquetas() {
    zona.innerHTML = '';
    elegidas.forEach((empresa, i) => {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'etiqueta-accion';
      etiqueta.title = empresa.nombre;
      etiqueta.textContent = empresa.simbolo;

      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '×';
      quitar.title = `Quitar ${empresa.simbolo}`;
      quitar.addEventListener('click', () => {
        elegidas.splice(i, 1);
        dibujarEtiquetas();
      });

      etiqueta.appendChild(quitar);
      zona.appendChild(etiqueta);
    });

    const lleno = elegidas.length >= maximo;
    campo.disabled = lleno;
    campo.placeholder = lleno ? `Máximo ${maximo} empresas` : 'Escribe una empresa y elígela';
  }

  function agregar(opcion) {
    if (!opcion || elegidas.length >= maximo) return;
    if (!elegidas.some((e) => e.simbolo === opcion.simbolo)) elegidas.push(opcion);
    campo.value = '';
    ocultar();
    dibujarEtiquetas();
    campo.focus();
  }

  function mostrar() {
    marcada = -1;
    lista.innerHTML = '';
    if (opciones.length === 0) return ocultar();

    opciones.forEach((opcion) => {
      const li = document.createElement('li');
      const simbolo = document.createElement('b');
      const nombre = document.createElement('span');
      const bolsa = document.createElement('small');
      simbolo.textContent = opcion.simbolo;
      nombre.textContent = opcion.nombre;
      bolsa.textContent = opcion.bolsa;
      li.append(simbolo, nombre, bolsa);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // evita que el campo pierda el foco antes de elegir
        agregar(opcion);
      });
      lista.appendChild(li);
    });
    lista.classList.remove('oculto');
  }

  function ocultar() {
    lista.classList.add('oculto');
    marcada = -1;
  }

  function marcar() {
    lista.querySelectorAll('li').forEach((li, i) => li.classList.toggle('seleccionada', i === marcada));
  }

  // Sugerencias mientras escribes (espera 250 ms a que dejes de teclear)
  campo.addEventListener('input', () => {
    clearTimeout(espera);
    const texto = campo.value.trim();
    if (!texto) return ocultar();
    espera = setTimeout(async () => {
      opciones = await pedirSugerencias(texto);
      mostrar();
    }, 250);
  });

  campo.addEventListener('keydown', async (e) => {
    const abierta = !lista.classList.contains('oculto');

    if (e.key === 'ArrowDown' && abierta) {
      e.preventDefault();
      marcada = Math.min(marcada + 1, opciones.length - 1);
      return marcar();
    }
    if (e.key === 'ArrowUp' && abierta) {
      e.preventDefault();
      marcada = Math.max(marcada - 1, 0);
      return marcar();
    }
    if (e.key === 'Escape') return ocultar();

    // Borrar con el campo vacío quita la última etiqueta
    if (e.key === 'Backspace' && !campo.value && elegidas.length) {
      elegidas.pop();
      return dibujarEtiquetas();
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const texto = campo.value.trim();
      if (!texto) return;
      if (abierta && marcada >= 0) return agregar(opciones[marcada]);

      // Si presionaste Enter sin elegir, usamos la empresa más parecida
      clearTimeout(espera);
      const encontradas = await pedirSugerencias(texto);
      const exacta = encontradas.find((o) => o.simbolo.toUpperCase() === texto.toUpperCase());
      agregar(exacta || encontradas[0] || { simbolo: texto.toUpperCase(), nombre: '', bolsa: '' });
    }
  });

  campo.addEventListener('blur', () => setTimeout(ocultar, 150));
  contenedor.addEventListener('click', () => campo.focus());

  // Lo que el resto del programa puede usar
  return { obtener: () => elegidas.map((e) => e.simbolo) };
}

// ================= Buscar =================
const input = document.getElementById('simbolo');
const listaSugerencias = document.getElementById('sugerencias');
const mensaje = document.getElementById('mensaje');
const ficha = document.getElementById('ficha');

let sugerencias = [];
let seleccion = -1;
let temporizador = null;
let simboloActual = null;
let periodoFicha = '6M';
let historialFicha = [];
let graficaFicha = null;

// --- Formatos para mostrar números ---
const vacio = (v) => v === null || v === undefined || isNaN(v);
const dinero = (v) => (vacio(v) ? '—' : `$${Number(v).toFixed(2)}`);
const numero = (v) => (vacio(v) ? '—' : Number(v).toFixed(2));
const porcentaje = (v) => (vacio(v) ? '—' : `${Number(v).toFixed(2)}%`);
const capitalizacion = (millones) => {
  if (vacio(millones)) return '—';
  const v = millones * 1e6;
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)} billones`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)} mil millones`;
  return `$${(v / 1e6).toFixed(0)} millones`;
};

// --- Sugerencias mientras escribes ---
input.addEventListener('input', () => {
  clearTimeout(temporizador);
  const texto = input.value.trim();
  if (!texto) return ocultarSugerencias();

  // Espera 250 ms a que dejes de escribir antes de preguntar al servidor
  temporizador = setTimeout(async () => {
    const respuesta = await fetch(`/api/sugerencias?q=${encodeURIComponent(texto)}`);
    sugerencias = await respuesta.json();
    mostrarSugerencias();
  }, 250);
});

function mostrarSugerencias() {
  seleccion = -1;
  listaSugerencias.innerHTML = '';
  if (sugerencias.length === 0) return ocultarSugerencias();

  sugerencias.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${s.simbolo}</b><span>${s.nombre}</span><small>${s.bolsa}</small>`;
    li.addEventListener('mousedown', () => elegir(i));
    listaSugerencias.appendChild(li);
  });
  listaSugerencias.classList.remove('oculto');
}

function ocultarSugerencias() {
  listaSugerencias.classList.add('oculto');
  seleccion = -1;
}

function elegir(i) {
  input.value = sugerencias[i].simbolo;
  ocultarSugerencias();
  buscar();
}

// Flechas para moverse, Enter para elegir, Escape para cerrar
input.addEventListener('keydown', (e) => {
  const items = listaSugerencias.querySelectorAll('li');
  const abierta = !listaSugerencias.classList.contains('oculto');

  if (e.key === 'ArrowDown' && abierta) {
    e.preventDefault();
    seleccion = Math.min(seleccion + 1, items.length - 1);
    items.forEach((li, i) => li.classList.toggle('seleccionada', i === seleccion));
  } else if (e.key === 'ArrowUp' && abierta) {
    e.preventDefault();
    seleccion = Math.max(seleccion - 1, 0);
    items.forEach((li, i) => li.classList.toggle('seleccionada', i === seleccion));
  } else if (e.key === 'Enter') {
    if (abierta && seleccion >= 0) elegir(seleccion);
    else buscar();
  } else if (e.key === 'Escape') {
    ocultarSugerencias();
  }
});

input.addEventListener('blur', () => setTimeout(ocultarSugerencias, 150));

// --- Buscar y mostrar la ficha ---
async function buscar() {
  const texto = input.value.trim();
  if (!texto) return;
  clearTimeout(temporizador);
  ocultarSugerencias();
  mensaje.textContent = 'Buscando...';

  try {
    // Si escribiste un nombre (por ejemplo "apple"), usamos la empresa más parecida
    const lista = await (await fetch(`/api/sugerencias?q=${encodeURIComponent(texto)}`)).json();
    const exacta = lista.find((s) => s.simbolo.toUpperCase() === texto.toUpperCase());
    const simbolo = exacta ? exacta.simbolo : (lista[0]?.simbolo ?? texto);
    input.value = simbolo;

    const respuesta = await fetch(`/api/ficha/${encodeURIComponent(simbolo)}`);
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      mensaje.textContent = `Error: ${datos.error}`;
      ficha.classList.add('oculto');
      return;
    }

    mensaje.textContent = '';
    simboloActual = simbolo;
    mostrarFicha(datos);
    ficha.classList.remove('oculto');
    await cargarGraficaFicha();
  } catch (error) {
    mensaje.textContent = `Ocurrió un problema: ${error.message}`;
    console.error(error);
  }
}

function mostrarFicha(d) {
  const c = d.cotizacion || {};
  const f = d.fundamentales || {};

  // Encabezado
  const logo = document.getElementById('logo');
  if (f.logo) {
    logo.src = f.logo;
    logo.classList.remove('oculto');
  } else {
    logo.classList.add('oculto');
  }
  document.getElementById('nombre').textContent = `${d.nombre} (${d.simbolo})`;
  document.getElementById('detalle').textContent = [f.industria, c.bolsa, `Precio del ${d.fecha}`].filter(Boolean).join(' · ');

  // Precios
  document.getElementById('usd').textContent = dinero(d.precio);
  document.getElementById('gtq').textContent = `Q${d.precioGTQ.toFixed(2)}`;
  const cambioDia = document.getElementById('cambio-dia');
  if (!vacio(c.cambioPct)) {
    const sube = c.cambioPct >= 0;
    cambioDia.className = sube ? 'sube' : 'baja';
    cambioDia.textContent = `${sube ? '▲' : '▼'} ${dinero(Math.abs(c.cambio))} (${Math.abs(c.cambioPct).toFixed(2)}%) en el día`;
  } else {
    cambioDia.textContent = '';
  }
  document.getElementById('cambio').textContent = `Tipo de cambio de referencia: Q${d.tipoCambio} por US$1 · Fuente: Banco de Guatemala`;

    // Título con la fecha, y aviso si la bolsa sigue abierta
  document.getElementById('titulo-cierre').textContent = c.mercadoAbierto
    ? `Datos del ${c.fecha ?? d.fecha} (la bolsa sigue abierta, aún no es el cierre final)`
    : `Cierre del ${c.fecha ?? d.fecha}`;

  // Cierre del día
  llenarCuadricula('cierre', [
    ['Cierre', dinero(c.cierre ?? d.precio), 'Último precio del día de bolsa'],
    ['Apertura', dinero(c.apertura), 'Precio al abrir la bolsa'],
    ['Máximo del día', dinero(c.maximo), 'Precio más alto del día'],
    ['Mínimo del día', dinero(c.minimo), 'Precio más bajo del día'],
    ['Cierre anterior', dinero(c.cierreAnterior), 'Cierre del día hábil anterior'],
    ['Volumen', vacio(c.volumen) ? '—' : Number(c.volumen).toLocaleString('es-GT'), 'Acciones compradas y vendidas en el día'],
  ]);

  // Fundamentales
  if (d.fundamentales) {
    llenarCuadricula('fundamentales', [
      ['Capitalización', capitalizacion(f.capitalizacion), 'Valor total de la empresa en la bolsa'],
      ['P/E (precio / ganancias)', numero(f.pe), 'Cuántos años de ganancias pagas por la acción. Más bajo = más barata'],
      ['EPS (ganancia por acción)', dinero(f.eps), 'Ganancia de los últimos 12 meses por cada acción'],
      ['Dividendo anual', porcentaje(f.dividendo), 'Lo que paga al año a sus accionistas, respecto al precio'],
      ['Beta', numero(f.beta), 'Mayor que 1 = se mueve más que el mercado (más riesgo)'],
      ['Rango 52 semanas', `${dinero(f.min52)} – ${dinero(f.max52)}`, 'Precio más bajo y más alto del último año'],
      ['Rendimiento 1 año', porcentaje(f.rendimiento52), 'Cuánto subió o bajó en los últimos 12 meses'],
      ['Crecimiento de ingresos', porcentaje(f.crecimientoIngresos), 'Cuánto crecieron sus ventas en un año'],
      ['Margen neto', porcentaje(f.margenNeto), 'De cada $100 que vende, cuánto le queda de ganancia'],
      ['ROE', porcentaje(f.roe), 'Ganancia que genera con el dinero de sus accionistas'],
      ['Deuda / capital', numero(f.deudaCapital), 'Más alto = más endeudada'],
      ['País', f.pais || '—', f.web || ''],
    ]);
  } else {
    llenarCuadricula('fundamentales', [['Sin datos', '—', 'No se pudieron obtener. Revisa tu FINNHUB_API_KEY en .env']]);
  }
}

function llenarCuadricula(id, filas) {
  const contenedor = document.getElementById(id);
  contenedor.innerHTML = '';
  filas.forEach(([etiqueta, valor, ayuda]) => {
    const div = document.createElement('div');
    div.className = 'dato';
    div.innerHTML = `<span>${etiqueta}</span><strong>${valor}</strong>${ayuda ? `<small>${ayuda}</small>` : ''}`;
    contenedor.appendChild(div);
  });
}

// --- Gráfica de la empresa ---
async function cargarGraficaFicha() {
  const respuesta = await fetch(`/api/historial?simbolos=${encodeURIComponent(simboloActual)}&periodo=${periodoFicha}`);
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    mensaje.textContent = `Gráfica: ${datos.error}`;
    return;
  }
  historialFicha = datos.acciones[0].datos;

  // Relleno rosa degradado debajo de la línea
  const lienzo = document.getElementById('grafica-ficha');
  const degradado = lienzo.getContext('2d').createLinearGradient(0, 0, 0, 300);
  degradado.addColorStop(0, 'rgba(231, 84, 128, 0.35)');
  degradado.addColorStop(1, 'rgba(231, 84, 128, 0)');

  if (graficaFicha) graficaFicha.destroy();
  graficaFicha = new Chart(lienzo, {
    type: 'line',
    data: {
      labels: historialFicha.map((d) => d.fecha),
      datasets: [{
        label: simboloActual,
        data: historialFicha.map((d) => d.precio),
        borderColor: '#e75480',
        backgroundColor: degradado,
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.25,
      }],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `Cierre: $${c.parsed.y.toFixed(2)}` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#8a6475' }, grid: { display: false } },
        y: { ticks: { color: '#8a6475', callback: (v) => `$${v}` }, grid: { color: '#fde4ec' } },
      },
    },
  });
}

document.querySelectorAll('#periodos-ficha .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    activarChip(document.getElementById('periodos-ficha'), chip);
    periodoFicha = chip.dataset.periodo;
    if (simboloActual) cargarGraficaFicha();
  });
});

// --- Descargar los precios de cierre como archivo CSV ---
document.getElementById('btn-csv').addEventListener('click', () => {
  if (historialFicha.length === 0) return;
  const lineas = ['fecha,precio_cierre_usd', ...historialFicha.map((d) => `${d.fecha},${d.precio}`)];
  const archivo = new Blob([lineas.join('\n')], { type: 'text/csv' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `${simboloActual}_cierres_${periodoFicha}.csv`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
});

document.getElementById('btn-buscar').addEventListener('click', buscar);

// ================= Comparar =================
// rosa, lavanda, durazno, menta, azul cielo, frambuesa, mostaza, oliva, coral, ciruela
const COLORES = ['#e75480', '#9b6bd6', '#f4a261', '#4fb3a9', '#5b8def', '#b5179e', '#d4a017', '#7a9e3e', '#ff8a80', '#6d597a'];
let periodo = '6M';
let vista = 'rendimiento';
let ultimaRespuesta = null;
let grafica = null;

function activarChip(grupo, boton) {
  grupo.querySelectorAll('.chip').forEach((c) => c.classList.remove('activa'));
  boton.classList.add('activa');
}

// Botones de periodo: vuelven a pedir los datos
document.querySelectorAll('#periodos .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    activarChip(document.getElementById('periodos'), chip);
    periodo = chip.dataset.periodo;
    if (ultimaRespuesta) comparar();
  });
});

// Botones de vista: solo redibujan la gráfica
document.querySelectorAll('#vistas .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    activarChip(document.getElementById('vistas'), chip);
    vista = chip.dataset.vista;
    if (ultimaRespuesta) dibujarGrafica(ultimaRespuesta.acciones);
  });
});

async function comparar() {
  const simbolos = selectorComparar.obtener();
  const mensajeComparar = document.getElementById('mensaje-comparar');
  if (simbolos.length === 0) {
    mensajeComparar.textContent = 'Elige al menos una empresa de la lista';
    return;
  }

  mensajeComparar.textContent = simbolos.length > 7
    ? 'Cargando historial... si hay empresas nuevas puede tardar hasta un par de minutos por el límite de Twelve Data'
    : 'Cargando historial...';

  try {
    const respuesta = await fetch(`/api/historial?simbolos=${encodeURIComponent(simbolos.join(','))}&periodo=${periodo}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensajeComparar.textContent = `Error: ${datos.error}`;
      return;
    }

    // Avisos: de qué día son los datos (en la vista de 1 día) y qué empresas fallaron
    const avisos = [];
    const primerDato = datos.acciones[0]?.datos[0];
    if (periodo === '1D' && primerDato) {
      avisos.push(`Datos del ${primerDato.fecha.slice(0, 10)}, cada 5 minutos (hora de Guatemala)`);
    }
    if (datos.errores?.length) avisos.push(`No se pudieron cargar: ${datos.errores.join(' · ')}`);
    mensajeComparar.textContent = avisos.join(' · ');
    ultimaRespuesta = datos;
    document.getElementById('zona-comparacion').classList.remove('oculto');
    dibujarGrafica(datos.acciones);
    llenarTabla(datos.acciones, datos.tipoCambio);
  } catch (error) {
    mensajeComparar.textContent = `Ocurrió un problema: ${error.message}`;
    console.error(error);
  }
}

// En la vista de 1 día mostramos solo la hora (ej. "09:35"); en las demás, la fecha
const etiquetaFecha = (f) => (f.length > 10 ? f.slice(11, 16) : f);

function dibujarGrafica(acciones) {
  // Todas las fechas de todas las acciones, ordenadas y sin repetir
  const fechas = [...new Set(acciones.flatMap((a) => a.datos.map((d) => d.fecha)))].sort();

  const datasets = acciones.map((accion, i) => {
    const inicial = accion.datos[0]?.precio;
    const porFecha = Object.fromEntries(accion.datos.map((d) => [d.fecha, d.precio]));
    return {
      label: accion.simbolo,
      data: fechas.map((f) => {
        const precio = porFecha[f];
        if (precio === undefined) return null;
        return vista === 'rendimiento' ? (precio / inicial - 1) * 100 : precio;
      }),
      borderColor: COLORES[i],
      backgroundColor: COLORES[i],
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.25,
      spanGaps: true,
    };
  });

  const formato = (valor) => (vista === 'rendimiento' ? `${valor.toFixed(2)}%` : `$${valor.toFixed(2)}`);

  if (grafica) grafica.destroy();
  grafica = new Chart(document.getElementById('grafica'), {
    type: 'line',
    data: { labels: fechas.map(etiquetaFecha), datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, color: '#4a2c3a', font: { family: 'Poppins' } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formato(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#8a6475' }, grid: { display: false } },
        y: { ticks: { color: '#8a6475', callback: (v) => (vista === 'rendimiento' ? `${v}%` : `$${v}`) }, grid: { color: '#fde4ec' } },
      },
    },
  });
}

// Muestra números enormes de forma legible: 1,250,000,000 → "1.25 mil millones"
function cantidadGrande(valor) {
  if (valor >= 1e12) return `${(valor / 1e12).toFixed(2)} billones`;
  if (valor >= 1e9) return `${(valor / 1e9).toFixed(2)} mil millones`;
  if (valor >= 1e6) return `${(valor / 1e6).toFixed(2)} millones`;
  return Math.round(valor).toLocaleString('es-GT');
}

function llenarTabla(acciones, tipoCambio) {
  const cuerpo = document.querySelector('#tabla tbody');
  cuerpo.innerHTML = '';

  acciones.forEach((accion, i) => {
    const precios = accion.datos.map((d) => d.precio);
    if (precios.length === 0) return;

    const inicial = precios[0];
    const actual = precios.at(-1);
    const rendimiento = (actual / inicial - 1) * 100;

    // Totales del periodo: suma de acciones negociadas y suma de (volumen × precio) de cada día
    const totalAcciones = accion.datos.reduce((suma, d) => suma + d.volumen, 0);
    const montoUSD = accion.datos.reduce((suma, d) => suma + d.volumen * d.precio, 0);

    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td><span class="punto" style="background:${COLORES[i]}"></span>${accion.nombre} <small>(${accion.simbolo})</small></td>
      <td>$${inicial.toFixed(2)}</td>
      <td>$${actual.toFixed(2)}</td>
      <td>Q${(actual * tipoCambio).toFixed(2)}</td>
      <td class="${rendimiento >= 0 ? 'sube' : 'baja'}">${rendimiento >= 0 ? '▲' : '▼'} ${Math.abs(rendimiento).toFixed(2)}%</td>
      <td>$${Math.max(...precios).toFixed(2)}</td>
      <td>$${Math.min(...precios).toFixed(2)}</td>
      <td>${totalAcciones ? cantidadGrande(totalAcciones) : '—'}</td>
      <td>${montoUSD ? `$${cantidadGrande(montoUSD)}<br><small>Q${cantidadGrande(montoUSD * tipoCambio)}</small>` : '—'}</td>`;
    cuerpo.appendChild(fila);
  });
}

const selectorComparar = crearSelector('selector-comparar');
document.getElementById('btn-comparar').addEventListener('click', comparar);

// ================= Ayúdame a decidir =================
let perfilElegido = 'equilibrado';
const selectorDecidir = crearSelector('selector-decidir');
const zonaResultados = document.getElementById('resultados-decidir');

// Convierte texto en texto seguro para usar dentro de innerHTML
const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Elegir perfil (si ya hay resultados, se recalculan al instante)
document.querySelectorAll('#perfiles .perfil').forEach((boton) => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('#perfiles .perfil').forEach((b) => b.classList.remove('activa'));
    boton.classList.add('activa');
    perfilElegido = boton.dataset.perfil;
    if (zonaResultados.children.length) decidir();
  });
});

async function decidir() {
  const simbolos = selectorDecidir.obtener();
  const mensajeDecidir = document.getElementById('mensaje-decidir');
  if (simbolos.length === 0) {
    mensajeDecidir.textContent = 'Elige al menos una empresa de la lista';
    return;
  }

  mensajeDecidir.textContent = 'Analizando empresas...';
  try {
    const respuesta = await fetch(`/api/decidir?simbolos=${encodeURIComponent(simbolos.join(','))}&perfil=${perfilElegido}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensajeDecidir.textContent = `Error: ${datos.error}`;
      return;
    }

    mensajeDecidir.textContent = datos.errores?.length ? `No se pudieron analizar: ${datos.errores.join(' · ')}` : '';
    mostrarResultados(datos);
  } catch (error) {
    mensajeDecidir.textContent = `Ocurrió un problema: ${error.message}`;
    console.error(error);
  }
}

function mostrarResultados(datos) {
  zonaResultados.innerHTML = '';
  if (datos.resultados.length === 0) return;

  // Explicación de cómo se calculó, con los pesos del perfil elegido
  const pesos = datos.resultados[0].criterios.map((c) => `${c.nombre} ${c.peso}%`).join(' · ');
  zonaResultados.innerHTML = `
    <details class="tarjeta como">
      <summary>¿Cómo se calculó el puntaje para el perfil "${escapar(datos.perfil)}"?</summary>
      <p>Cada empresa recibe de 0 a 100 puntos en cada criterio, según sus datos fundamentales.
      Luego se combinan con esta importancia: ${escapar(pesos)}.
      Si falta algún dato, ese criterio no se cuenta.</p>
    </details>`;

  datos.resultados.forEach((r, i) => {
    zonaResultados.insertAdjacentHTML('beforeend', tarjetaResultado(r, i, datos.tipoCambio));
  });
}

function tarjetaResultado(r, posicion, tipoCambio) {
  const medalla = r.puntaje === null ? '❔' : (['🥇', '🥈', '🥉'][posicion] || `#${posicion + 1}`);
  const precio = vacio(r.precio)
    ? 'Búscala en la pestaña Buscar para ver su precio'
    : `${dinero(r.precio)} · Q${(r.precio * tipoCambio).toFixed(2)}`;

  const criterios = r.criterios.map((c) => `
    <div class="criterio">
      <span class="criterio-nombre">${escapar(c.nombre)}<small>${escapar(c.texto)}</small></span>
      <div class="barra"><div style="width:${c.puntos ?? 0}%"></div></div>
      <b>${c.puntos ?? '—'}</b>
    </div>`).join('');

  const fortalezas = r.fortalezas.map((t) => `<li class="fortaleza">✔ ${escapar(t)}</li>`).join('');
  const debilidades = r.debilidades.map((t) => `<li class="debilidad">✖ ${escapar(t)}</li>`).join('');

  return `
    <article class="tarjeta resultado">
      <div class="resultado-encabezado">
        <span class="medalla">${medalla}</span>
        <div class="resultado-nombre">
          <h2>${escapar(r.nombre)} <small>(${escapar(r.simbolo)})</small></h2>
          <p class="nota">${escapar(precio)}</p>
        </div>
        <div class="anillo" style="--valor:${r.puntaje ?? 0}"><span>${r.puntaje ?? '—'}</span></div>
      </div>
      <p class="veredicto ${r.nivel}">${escapar(r.veredicto)}</p>
      <div class="criterios">${criterios}</div>
      <ul class="puntos-clave">${fortalezas}${debilidades}</ul>
    </article>`;
}

document.getElementById('btn-decidir').addEventListener('click', decidir);