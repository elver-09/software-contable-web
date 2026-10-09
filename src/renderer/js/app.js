import { initAutomaticos } from './modules/asientosAutomaticos.js';
import { cargarPeriodoTrabajo, obtenerPeriodoTrabajo, initPeriodoTrabajo } from './modules/periodoTrabajo.js';
import { nombrePeriodo } from './utils/periodoTrabajo.mjs';
// src/renderer/js/app.js

import { initRouter } from './router.js';
import { initPlanCuentas } from './modules/planCuentas.js';
import { initTiposDocumentos } from './modules/tiposDocumentos.js';
import { initEntidades } from './modules/entidades.js';
import { initVoucher, hayBorradorVoucher } from './modules/voucher.js';
import { initMonedas } from './modules/monedas.js';
import { initAmarres } from './modules/amarres.js';
import { initReportes } from './modules/reportes.js';
import { initEditarRegistros, hayCambiosEditarRegistros } from './modules/editarRegistros.js';
import { initDashboard } from './modules/dashboard.js';
import { initCartera } from './modules/cartera.js';
import { initSire } from './modules/sire.js';
import { initConfigEEFF, initConfigER } from './modules/configEEFF.js';
import { isAllowedImageFile, setSafeImageSrc } from './utils/security.js';

let empresaConfigInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
  await window.ansoritoReady;
  // Función para mostrar solo el nombre final de la carpeta (ej: Gloria_SAC)
  const obtenerNombreCarpeta = (rutaCompleta) => {
    if (!rutaCompleta) return "Contabilidad";
    return rutaCompleta.split(/[/\\]/).pop();
  };

  // 1. Estado visual inicial y restauración de la última empresa usada.
  document.getElementById('sidebar-title').textContent = "Contabilidad";
  document.getElementById('sidebar-logo').style.display = 'none';

  // checkLastEmpresa() distingue tres estados:
  // - no había empresa previa -> connected:false, sin error
  // - última empresa válida -> la reconecta antes de inicializar módulos
  // - ruta inválida/error -> mantiene el sistema sin empresa y devuelve el motivo
  try {
    const restauracion = await window.api.checkLastEmpresa();
    if (!restauracion?.success && restauracion?.error) {
      console.warn('Empresa: no se pudo restaurar la última empresa:', restauracion.error);
    }
  } catch (error) {
    console.warn('Empresa: error comprobando la última empresa:', error);
  }

  await cargarPeriodoTrabajo();

  // Configurar el botón de contraer / expandir sidebar
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed');
  });

  // 2. Inicializar el menú lateral y decirle qué hacer al cambiar de vista
  initRouter((targetId) => {
      if (targetId === 'view-dashboard') {
          initDashboard();
      } else if (targetId === 'view-periodo') {
          initPeriodoTrabajo(() => hayBorradorVoucher() || hayCambiosEditarRegistros());
      } else if (targetId === 'view-cartera') {
          initCartera();
      } else if (targetId === 'view-empresa-gestion') {
          renderListaEmpresas();
          initEmpresaConfig();
      } else if (targetId === 'view-plan-cuentas') {
          initPlanCuentas();
      } else if (targetId === 'view-tipos-documentos') {
          initTiposDocumentos();
      } else if (targetId === 'view-entidades') {
          initEntidades();
      } else if (targetId === 'view-monedas') {
          initMonedas();
      } else if (targetId === 'view-automaticos') {
          initAutomaticos();
      } else if (targetId === 'view-amarres') {
          initAmarres();
      } else if (targetId === 'view-voucher') {
          const periodo = obtenerPeriodoTrabajo();
          const [anio, mes] = periodo.split('-');
          document.getElementById('voucher_mes_trabajo').textContent = `PERÍODO: ${nombrePeriodo(periodo).toUpperCase()}`;
          initVoucher(mes, anio);
      } else if (targetId === 'view-reportes') {
          initReportes({ rootId: 'reportes-root', categorias: ['Libros Obligatorios'], titulo: 'Centro de Reportes', subtitulo: 'Seleccione un reporte para configurar, previsualizar y exportar' });
      } else if (targetId === 'view-estados-financieros') {
          initReportes({ rootId: 'estados-financieros-root', categorias: ['Estados Financieros'], titulo: 'Estados Financieros', subtitulo: 'Seleccione un estado financiero para configurar, previsualizar y exportar' });
      } else if (targetId === 'view-sire') {
          initSire();
      } else if (targetId === 'view-config-eeff') {
          initConfigEEFF();
      } else if (targetId === 'view-config-er') {
          initConfigER();
      } else if (targetId === 'view-editar-registros') {
          initEditarRegistros();
      }
  });

  document.getElementById('periodo-cambiar').addEventListener('click', () => document.getElementById('periodo-menu').click());

  renderListaEmpresas();
  initEmpresaConfig();
  // Cargar dashboard como portada principal
  initDashboard();
});

async function renderListaEmpresas() {
  const empresas = await window.api.getEmpresasLista() || [];
  const lista = document.getElementById('lista-empresas-items');
  lista.innerHTML = '';
  
  empresas.forEach(ruta => {
    const div = document.createElement('div');
    div.className = 'empresa-item';
    div.title = String(ruta || '');

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'width:40px;height:40px;border-radius:10px;background:#f1f5f9;color:var(--tx2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-building';
    iconWrap.appendChild(icon);

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;justify-content:center;flex-grow:1;';
    const strong = document.createElement('strong');
    strong.style.cssText = 'color:var(--tx);font-size:14px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;';
    strong.textContent = String(ruta || '').split(/[/\\]/).pop() || 'Empresa';
    textWrap.appendChild(strong);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.dataset.ruta = String(ruta || '');
    editBtn.style.cssText = 'background:var(--accent-lt);border:none;width:34px;height:34px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--accent);flex-shrink:0;transition:.2s;';
    editBtn.title = 'Editar Empresa';
    const editIcon = document.createElement('i');
    editIcon.className = 'fa-solid fa-pencil';
    editBtn.appendChild(editIcon);

    div.append(iconWrap, textWrap, editBtn);
    div.addEventListener('dblclick', async () => {
      const res = await window.api.conectarRutaDirecta(ruta);
      if (res.success) {
        window.location.reload();
      } else {
        alert(res.error);
        renderListaEmpresas(); // Refrescar lista de UI
      }
    });
    lista.appendChild(div);
  });

  // Agregar eventos a los botones de editar
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruta = btn.getAttribute('data-ruta');
      abrirModalEditar(ruta);
    });
  });
}

function initEmpresaConfig() {
  // Cargar datos actuales (solo lectura)
  loadEmpresaInfo();

  // Evitar registrar listeners múltiples veces
  if (empresaConfigInitialized) return;
  empresaConfigInitialized = true;

  // Evento para nueva empresa
  document.getElementById('btnNuevaEmpresa').addEventListener('click', async () => {
    const result = await window.api.seleccionarEmpresa();
    if (result.success) {
      // Actualizar título del sidebar
      const nombreCarpeta = result.folderPath.split(/[/\\]/).pop();
      document.getElementById('sidebar-title').textContent = nombreCarpeta;
      await cargarPeriodoTrabajo();
      renderListaEmpresas();
      loadEmpresaInfo();
    }
  });

  // Eventos del modal
  // Consulta RUC: antes estaba en un onclick inline del HTML. Se registra aquí
  // para que la CSP pueda bloquear por completo scripts inline.
  const btnBuscarRuc = document.getElementById('emp-btn-buscar-ruc');
  if (btnBuscarRuc) {
    btnBuscarRuc.addEventListener('click', async () => {
      const num = document.getElementById('edit_emp_ruc').value.trim();
      if (!/^\d{11}$/.test(num)) {
        alert('Ingrese un RUC válido (11 dígitos)');
        return;
      }
      btnBuscarRuc.textContent = '';
      const spinner = document.createElement('i');
      spinner.className = 'fa-solid fa-spinner fa-spin';
      btnBuscarRuc.appendChild(spinner);
      btnBuscarRuc.disabled = true;
      try {
        const r = await window.api.consultarDocumento({ tipo: 'ruc', numero: num });
        if (r.success) {
          if (r.razonSocial) document.getElementById('edit_emp_nombre').value = r.razonSocial;
          if (r.direccion) document.getElementById('edit_emp_direccion').value = r.direccion;
          btnBuscarRuc.textContent = '';
          const ok = document.createElement('i'); ok.className = 'fa-solid fa-check'; btnBuscarRuc.appendChild(ok);
          btnBuscarRuc.style.background = 'var(--btn-ok)';
          setTimeout(() => {
            btnBuscarRuc.textContent = '';
            const search = document.createElement('i'); search.className = 'fa-solid fa-search'; btnBuscarRuc.appendChild(search);
            btnBuscarRuc.style.background = 'var(--btn-primary)';
          }, 2000);
        } else {
          alert('No se encontró: ' + (r.error || 'sin datos'));
        }
      } catch (error) {
        alert('Error: ' + (error?.message || 'No se pudo consultar el RUC'));
      } finally {
        btnBuscarRuc.disabled = false;
      }
    });
  }

  document.getElementById('formEditarEmpresa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('edit_emp_nombre').value;
    const ruc = document.getElementById('edit_emp_ruc').value;
    const direccion = document.getElementById('edit_emp_direccion').value;
    const telefono = document.getElementById('edit_emp_telefono').value;
    const correo = document.getElementById('edit_emp_correo').value;
    
    // Obtener logo
    let logo = null;
    const fileInput = document.getElementById('edit_emp_logo');
    if (fileInput.files[0]) {
      logo = document.getElementById('preview-logo').src;
    } else {
      // Mantener logo actual si no se cambió
      const info = await window.api.getEmpresaInfo();
      logo = info.logo;
    }
    
    const result = await window.api.updateEmpresaInfo({
      nombre: nombre,
      ruc: ruc,
      direccion: direccion,
      telefono: telefono,
      correo: correo,
      logo: logo
    });
    if (result.success) {
      cerrarModal();
      // Refresh the profile and directory together after a successful rename.
      await Promise.all([loadEmpresaInfo(), renderListaEmpresas()]);
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Evento para preview del logo
  document.getElementById('edit_emp_logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!isAllowedImageFile(file)) {
        alert('Formato de logo no permitido. Use PNG, JPG, WEBP o GIF.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setSafeImageSrc(document.getElementById('preview-logo'), e.target.result);
        document.getElementById('preview-logo').style.display = 'block';
        if (document.getElementById('preview-icon')) document.getElementById('preview-icon').style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
  const btnCerrarX = document.getElementById('btnCerrarModalX');
  if (btnCerrarX) btnCerrarX.addEventListener('click', cerrarModal);
}

async function loadEmpresaInfo() {
  try {
    const estado = await window.api.getEmpresaEstado();
    if (!estado?.connected) throw new Error('No hay ninguna empresa seleccionada.');

    const info = await window.api.getEmpresaInfo();
    document.getElementById('emp_connection_state').hidden = false;
    document.getElementById('emp_nombre').textContent = info.nombre_comercial || estado.folderName || 'Empresa sin nombre';
    const empRuc = document.getElementById('emp_ruc');
    empRuc.textContent = '';
    const rucIcon = document.createElement('i');
    rucIcon.className = 'fa-solid fa-hashtag';
    rucIcon.style.color = 'var(--tx3)';
    empRuc.append(rucIcon, document.createTextNode(' RUC: ' + (info.ruc || 'No especificado')));
    document.getElementById('emp_direccion').textContent = info.direccion_fiscal || 'No especificado';
    document.getElementById('emp_telefono').textContent = info.telefono || 'No especificado';
    document.getElementById('emp_correo').textContent = info.correo || 'No especificado';
    
    // Mostrar logo en sidebar y en el perfil
    const logoImg = document.getElementById('sidebar-logo');
    const mainProfileLogo = document.getElementById('main-profile-logo');
    const mainProfileIcon = document.getElementById('main-profile-icon');

    if (info.logo) {
      const logoOk = setSafeImageSrc(logoImg, info.logo);
      logoImg.style.display = logoOk ? 'block' : 'none';
      if (mainProfileLogo) {
         const profileLogoOk = setSafeImageSrc(mainProfileLogo, info.logo);
         mainProfileLogo.style.display = profileLogoOk ? 'block' : 'none';
         if (mainProfileIcon) mainProfileIcon.style.display = 'none';
      }
    } else {
      logoImg.style.display = 'none';
      if (mainProfileLogo) mainProfileLogo.style.display = 'none';
      if (mainProfileIcon) mainProfileIcon.style.display = 'block';
    }

    // Mostrar el nombre de la empresa en el sidebar
    document.getElementById('sidebar-title').textContent = info.nombre_comercial || estado.folderName || 'Empresa Activa';

  } catch (error) {
    // No hay empresa activa todavía o no hay base de datos cargada.
    document.getElementById('emp_connection_state').hidden = true;
    document.getElementById('emp_nombre').textContent = 'Ninguna empresa seleccionada';
    const empRuc = document.getElementById('emp_ruc');
    empRuc.textContent = '';
    const rucIcon = document.createElement('i');
    rucIcon.className = 'fa-solid fa-hashtag';
    rucIcon.style.color = 'var(--tx3)';
    empRuc.append(rucIcon, document.createTextNode(' RUC: --'));
    document.getElementById('emp_direccion').textContent = '--';
    document.getElementById('emp_telefono').textContent = '--';
    document.getElementById('emp_correo').textContent = '--';
    document.getElementById('sidebar-logo').style.display = 'none';
    document.getElementById('sidebar-title').textContent = "Contabilidad";

    if (document.getElementById('main-profile-logo')) document.getElementById('main-profile-logo').style.display = 'none';
    if (document.getElementById('main-profile-icon')) document.getElementById('main-profile-icon').style.display = 'block';
  }
}

async function abrirModalEditar(ruta) {
  // Primero conectar a esa empresa para cargar su info
  const connectRes = await window.api.conectarRutaDirecta(ruta);
  if (!connectRes.success) {
    alert(connectRes.error);
    renderListaEmpresas();
    return;
  }
  // Luego cargar info
  const info = await window.api.getEmpresaInfo();
  const nombreCarpeta = ruta.split(/[/\\]/).pop();
  
    // Pre-llenar con nombre de carpeta si no hay nombre comercial
    document.getElementById('edit_emp_nombre').value = info.nombre_comercial || nombreCarpeta;
    document.getElementById('edit_emp_ruc').value = info.ruc || '';
    document.getElementById('edit_emp_direccion').value = info.direccion_fiscal || '';
    document.getElementById('edit_emp_telefono').value = info.telefono || '';
    document.getElementById('edit_emp_correo').value = info.correo || '';
    
    // Mostrar logo actual
    const previewImg = document.getElementById('preview-logo');
    const previewIcon = document.getElementById('preview-icon');
    if (info.logo) {
      const previewOk = setSafeImageSrc(previewImg, info.logo);
      previewImg.style.display = previewOk ? 'block' : 'none';
      if (previewIcon) previewIcon.style.display = 'none';
    } else {
      previewImg.style.display = 'none';
      if (previewIcon) previewIcon.style.display = 'block';
    }
    
    document.getElementById('modalEditarEmpresa').style.display = 'flex';
    
    // Evento para preview de nuevo logo
    document.getElementById('edit_emp_logo').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        if (!isAllowedImageFile(file)) {
          alert('Formato de logo no permitido. Use PNG, JPG, WEBP o GIF.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = function(event) {
          setSafeImageSrc(previewImg, event.target.result);
          previewImg.style.display = 'block';
          if (previewIcon) previewIcon.style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });
}

function cerrarModal() {
  document.getElementById('modalEditarEmpresa').style.display = 'none';
  // Reconectar a la empresa original si es necesario
  // Pero por ahora, dejar como está
}
