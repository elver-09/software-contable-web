// src/main/services/sunat/sireVentasService.js
// ─────────────────────────────────────────────────────────────────────────────
// RVIE — Registro de Ventas e Ingresos Electrónico — SIRE SUNAT
// Superficie deliberadamente limitada a operaciones que están integradas y
// verificadas en la interfaz actual: consultar períodos, solicitar propuesta,
// consultar ticket y descargar el archivo generado.
//
// Operaciones que modifican/generan el registro SUNAT (aceptar, reemplazar,
// registrar preliminar, complementos masivos) NO se exponen hasta implementar
// su flujo completo de validación, carga de archivo y confirmación de usuario.
// ─────────────────────────────────────────────────────────────────────────────
const api = require('./sireApiClient');

const COD_LIBRO = '140000';
const TIPO = 'VENTAS';

async function consultarPeriodos() {
  const path = `/v1/contribuyente/migeigv/libros/rvierce/padron/web/omisos/${COD_LIBRO}/periodos`;
  return api.request({ method: 'GET', path, tipo: TIPO, operacion: 'CONSULTAR_PERIODOS' });
}

async function descargarPropuesta(periodo) {
  const path = `/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/${periodo}/exportapropuesta?codTipoArchivo=0`;
  return api.request({ method: 'GET', path, tipo: TIPO, periodo, operacion: 'DESCARGAR_PROPUESTA' });
}

async function consultarTicket(ticket, periodo) {
  const per = periodo || '202601';
  const perFin = periodo || '202612';
  const path = `/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?numTicket=${encodeURIComponent(ticket)}&perIni=${encodeURIComponent(per)}&perFin=${encodeURIComponent(perFin)}&page=1&perPage=10`;
  return api.request({ method: 'GET', path, tipo: TIPO, periodo, operacion: 'CONSULTAR_TICKET' });
}

async function descargarArchivo(params) {
  const { nomArchivoReporte, codTipoArchivoReporte, perTributario, codProceso, numTicket } = params || {};
  const qs = new URLSearchParams({
    nomArchivoReporte: nomArchivoReporte || '',
    codTipoArchivoReporte: codTipoArchivoReporte || '00',
    codLibro: COD_LIBRO,
    perTributario: perTributario || '',
    codProceso: codProceso || '10',
    numTicket: numTicket || '',
  }).toString();
  const path = `/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?${qs}`;
  return api.request({ method: 'GET', path, tipo: TIPO, periodo: perTributario, operacion: 'DESCARGAR_ARCHIVO', rawBuffer: true });
}

module.exports = {
  consultarPeriodos,
  descargarPropuesta,
  consultarTicket,
  descargarArchivo,
  COD_LIBRO,
  TIPO,
};
