async function obtenerTipoCambio() {
  const cuerpo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/" />
  </soap:Body>
</soap:Envelope>`;

  const respuesta = await fetch('https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.banguat.gob.gt/variables/ws/TipoCambioDia',
    },
    body: cuerpo,
  });

  const xml = await respuesta.text();
  const resultado = xml.match(/<referencia>([\d.]+)<\/referencia>/);
  if (!resultado) throw new Error('No se pudo leer el tipo de cambio');
  return Number(resultado[1]);
}

module.exports = { obtenerTipoCambio };