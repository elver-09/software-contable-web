import {normalizarPeriodo, nombrePeriodo, esPeriodoValido, esPeriodoDisponible, mesesDisponibles, periodoActual} from '../utils/periodoTrabajo.mjs';
let _periodo = normalizarPeriodo(null);
let _conectada = false;
export function obtenerPeriodoTrabajo() { return _periodo; }
function mostrarPeriodo() {
  const label=document.getElementById('periodo-activo');
  if (label) label.textContent=_conectada?nombrePeriodo(_periodo):'Seleccione una empresa';
  const btn=document.getElementById('periodo-menu');
  if (btn) btn.title=_conectada?`Período de trabajo: ${nombrePeriodo(_periodo)}`:'Período de trabajo';
}
export async function cargarPeriodoTrabajo() {
  try {
    const r=await window.api.getPeriodoTrabajo();
    _conectada=!!r?.success;
    _periodo=normalizarPeriodo(r?.periodo);
  } catch { _conectada=false; _periodo=normalizarPeriodo(null); }
  mostrarPeriodo();
}
export function initPeriodoTrabajo(hayBorradores = () => false) {
  const root=document.getElementById('periodo-trabajo-root');
  root.innerHTML='';
  if (!_conectada) {
    root.innerHTML='<div class="periodo-card"><h2>Período de trabajo</h2><p>Seleccione una empresa en Mi Empresa para elegir su mes y ejercicio.</p></div>';
    return;
  }
  const [anio,mes]=_periodo.split('-');
  root.innerHTML=`<div class="periodo-card"><h2><i class="fa-solid fa-calendar-days"></i> Período de trabajo</h2>
    <p>Elija el mes y ejercicio con los que trabajará en esta empresa.</p>
    <form id="periodo-trabajo-form"><div class="periodo-campos">
    <label>Mes<select id="periodo-mes" required></select></label>
    <label>Ejercicio<input id="periodo-ejercicio" type="number" min="1900" max="${periodoActual().slice(0,4)}" step="1" required value="${anio}"></label>
    </div><p>Voucher, Editar Registros, Dashboard y reportes usarán esta selección. En los reportes podrá consultar otras fechas.</p>
    <button type="submit" class="btn-primary" id="periodo-guardar">Guardar período</button>
    <p id="periodo-estado" role="status" aria-live="polite"></p></form></div>`;
  const mesInput = root.querySelector('#periodo-mes');
  const ejercicioInput = root.querySelector('#periodo-ejercicio');
  const actualizarMeses = () => {
    const elegido = Number(mesInput.value || mes);
    const limite = mesesDisponibles(ejercicioInput.value);
    mesInput.innerHTML = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].slice(0,limite).map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('');
    if (limite) mesInput.value = String(Math.min(elegido,limite)).padStart(2,'0');
  };
  ejercicioInput.addEventListener('input',actualizarMeses);
  actualizarMeses();
  root.querySelector('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const p=`${root.querySelector('#periodo-ejercicio').value}-${root.querySelector('#periodo-mes').value}`;
    const estado=root.querySelector('#periodo-estado');
    if (!esPeriodoValido(p)) {estado.textContent='Seleccione un mes y ejercicio válidos.';return;}
    if (!esPeriodoDisponible(p)) {estado.textContent='El período no puede ser posterior al mes actual.';return;}
    if (p!==_periodo && hayBorradores()) {estado.textContent='Guarde o descarte los cambios pendientes del asiento antes de cambiar el período.';return;}
    const btn=root.querySelector('#periodo-guardar');btn.disabled=true;
    try {
      const r=await window.api.setPeriodoTrabajo({periodo:p});
      if (!r?.success) throw new Error(r?.error||'No se pudo guardar el período.');
      _periodo=r.periodo;mostrarPeriodo();
      estado.textContent=`Período guardado: ${nombrePeriodo(_periodo)}.`;
    } catch(e) {estado.textContent=e.message;} finally {btn.disabled=false;}
  });
}
