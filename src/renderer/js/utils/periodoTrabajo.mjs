export function periodoActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}`;
}
export function esPeriodoValido(p) {
  return typeof p === 'string' && /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(p);
}
export function esPeriodoDisponible(p, fecha = new Date()) {
  return esPeriodoValido(p) && p <= periodoActual(fecha);
}
export function mesesDisponibles(anio, fecha = new Date()) {
  const actual = periodoActual(fecha);
  const ejercicio = Number(anio);
  const anioActual = Number(actual.slice(0,4));
  if (!Number.isInteger(ejercicio) || ejercicio < 1900 || ejercicio > anioActual) return 0;
  return ejercicio === anioActual ? Number(actual.slice(5)) : 12;
}
export function normalizarPeriodo(p, fecha = new Date()) {
  if (esPeriodoValido(p)) return esPeriodoDisponible(p,fecha) ? p : periodoActual(fecha);
  // Older company profiles stored only the fiscal year.
  if (typeof p === 'string' && /^(19\d{2}|[2-9]\d{3})$/.test(p)) return normalizarPeriodo(`${p}-${String(fecha.getMonth()+1).padStart(2,'0')}`, fecha);
  return periodoActual(fecha);
}
export function nombrePeriodo(p) {
  if (!esPeriodoValido(p)) return '';
  const [anio,mes]=p.split('-');
  return `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][Number(mes)-1]} ${anio}`;
}
export function rangoPeriodo(p) {
  if (!esPeriodoValido(p)) throw new Error('Período inválido. Seleccione mes y ejercicio.');
  const [anio,mes]=p.split('-').map(Number);
  const dia=new Date(anio,mes,0).getDate();
  return {desde:`${p}-01`,hasta:`${p}-${dia}`};
}
export function fechaInicialPeriodo(p, fecha = new Date()) {
  if (!esPeriodoValido(p)) throw new Error('Período inválido.');
  return p===periodoActual(fecha) ? `${p}-${String(fecha.getDate()).padStart(2,'0')}` : `${p}-01`;
}
