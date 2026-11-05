const input = document.getElementById('simbolo');
const boton = document.getElementById('buscar');
const mensaje = document.getElementById('mensaje');
const resultado = document.getElementById('resultado');

async function buscar() {
  const simbolo = input.value.trim();
  if (!simbolo) return;

  mensaje.textContent = 'Buscando...';
  resultado.classList.add('oculto');

  const respuesta = await fetch(`/api/accion/${encodeURIComponent(simbolo)}`);
  const datos = await respuesta.json();

  if (!respuesta.ok) {
    mensaje.textContent = `Error: ${datos.error}`;
    return;
  }

  mensaje.textContent = '';
  document.getElementById('nombre').textContent = `${datos.nombre} (${datos.simbolo})`;
  document.getElementById('detalle').textContent = `Precio del ${datos.fecha} · Dato obtenido de: ${datos.origen}`;
  document.getElementById('usd').textContent = `$${datos.precio.toFixed(2)}`;
  document.getElementById('gtq').textContent = `Q${datos.precioGTQ.toFixed(2)}`;
  document.getElementById('cambio').textContent = `Tipo de cambio de referencia: Q${datos.tipoCambio} por US$1 · Fuente: Banco de Guatemala`;
  resultado.classList.remove('oculto');
}

boton.addEventListener('click', buscar);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscar();
});