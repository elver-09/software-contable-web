const mainRepository = require('./repositories/mainRepository.js');
// src/main/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('../../server/electron.cjs');
const path = require('path');
const fs = require('fs');

// --- 1. IMPORTACIONES DE CONFIGURACIÓN Y BASE DE DATOS ---
const { getSettings, saveSettings } = require('./config/settings');
const { conectarEmpresa, getEstadoEmpresa } = require('./database/db');

// --- 2. IMPORTACIONES DE CONTROLADORES ---
const empresaController = require('./controllers/empresaController');
const planCuentasController = require('./controllers/planCuentasController');
const tiposDocumentosController = require('./controllers/tiposDocumentosController');
const entidadesController = require('./controllers/entidadesController');
const voucherController = require('./controllers/voucherController');
const amarresController = require('./controllers/amarresController');
const { getSiguienteNumero } = require('./controllers/voucherController');
const { getMonedas, addMoneda, updateMoneda, deleteMoneda, fetchAndSaveTipoCambio, fetchTipoCambioRango } = require('./controllers/monedasController');
const reportesController = require('./controllers/reportesController');
const dashboardController = require('./controllers/dashboardController');
const carteraController = require('./controllers/carteraController');
const estadoResultadosController = require('./controllers/estadoResultadosController');

const APP_NAME = 'Ansorito';
const APP_ICON_PNG = path.join(__dirname, '../../assets/icon.png');
const APP_ICON_ICO = path.join(__dirname, '../../assets/icon.ico');

let mainWindow;
app.setName(APP_NAME);
if (process.platform === 'darwin' && app.dock && typeof app.dock.setIcon === 'function' && fs.existsSync(APP_ICON_PNG)) {
    app.dock.setIcon(APP_ICON_PNG);
}


function _mismaRuta(a, b) {
    if (!a || !b) return false;
    const ra = path.resolve(String(a));
    const rb = path.resolve(String(b));
    return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

function _esDirectorioValido(ruta) {
    try {
        return Boolean(ruta && fs.existsSync(ruta) && fs.statSync(ruta).isDirectory());
    } catch (_) {
        return false;
    }
}

function _guardarEmpresaActivaEnSettings(folderPath) {
    const ruta = path.resolve(folderPath);
    const settings = getSettings();
    const companies = Array.isArray(settings.companies) ? settings.companies : [];

    const normalizadas = [];
    for (const item of companies) {
        if (!_esDirectorioValido(item)) continue;
        const itemNorm = path.resolve(item);
        if (!normalizadas.some(x => _mismaRuta(x, itemNorm))) normalizadas.push(itemNorm);
    }
    if (!normalizadas.some(x => _mismaRuta(x, ruta))) normalizadas.push(ruta);

    settings.companies = normalizadas;
    settings.lastCompanyPath = ruta;
    saveSettings(settings);
}

function _eliminarEmpresaInvalidaDeSettings(folderPath) {
    const settings = getSettings();
    const companies = Array.isArray(settings.companies) ? settings.companies : [];
    settings.companies = companies.filter(c => !_mismaRuta(c, folderPath));
    if (_mismaRuta(settings.lastCompanyPath, folderPath)) settings.lastCompanyPath = null;
    saveSettings(settings);
}

async function _elegirDestinoImportacionCatalogo(nombreCatalogo) {
    const estado = getEstadoEmpresa();
    if (!estado.connected) return 'Global';

    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: `Importar ${nombreCatalogo}`,
        message: '¿Dónde desea aplicar esta importación?',
        detail: '“Solo esta empresa” crea o actualiza registros locales y puede personalizar códigos heredados del catálogo global. “Catálogo global” modifica la base compartida por todas las empresas.',
        buttons: ['Solo esta empresa', 'Catálogo global', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
    });

    if (result.response === 2) return null;
    return result.response === 1 ? 'Global' : 'Local';
}


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 600,
        title: APP_NAME,
        icon: fs.existsSync(process.platform === 'win32' ? APP_ICON_ICO : APP_ICON_PNG) ? (process.platform === 'win32' ? APP_ICON_ICO : APP_ICON_PNG) : undefined,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // El renderer es una aplicación local: no debe navegar ni abrir ventanas
    // arbitrarias aunque un dato almacenado consiga inyectar un enlace.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const currentUrl = mainWindow?.webContents?.getURL() || '';
        if (!currentUrl || url !== currentUrl) event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

}

// Función para obtener el tipo de cambio del día al iniciar la aplicación
async function fetchDailyExchangeRateOnStartup() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;

    // Intentar hasta 3 veces con espera entre reintentos.
    // Al iniciar Electron, la red puede no estar lista aún.
    const MAX_INTENTOS = 3;
    const ESPERA_MS = 5000; // 5 segundos entre intentos

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        console.log(`Main: Obteniendo T.C. para ${todayDate} (intento ${intento}/${MAX_INTENTOS})...`);
        try {
            const result = await fetchAndSaveTipoCambio(todayDate);
            if (result.success) {
                console.log(`Main: T.C. para ${todayDate} obtenido y guardado con éxito.`);
                return; // Éxito, salir
            }
            console.log(`Main: Intento ${intento} falló: ${result.error}`);
        } catch (error) {
            console.log(`Main: Intento ${intento} error: ${error.message}`);
        }

        // Si no es el último intento, esperar antes de reintentar
        if (intento < MAX_INTENTOS) {
            console.log(`Main: Esperando ${ESPERA_MS / 1000}s antes de reintentar...`);
            await new Promise(r => setTimeout(r, ESPERA_MS));
        }
    }
    console.log(`Main: No se pudo obtener T.C. tras ${MAX_INTENTOS} intentos. Se usará el último guardado.`);
}

// --- 3. REGISTRO DE RUTAS IPC (SOLO UNA VEZ POR CANAL) ---
let rutasIPCRegistradas = false;

function registrarRutasIPC() {
    // Electron no permite registrar dos handlers para el mismo canal.
    // Esta guarda protege el arranque ante una llamada accidental repetida.
    if (rutasIPCRegistradas) return;
    rutasIPCRegistradas = true;

    // ENTIDADES (CLIENTE / PROVEEDOR)
    ipcMain.handle('entidades:get', () => entidadesController.getEntidades());
    ipcMain.handle('entidades:add', (event, data) => entidadesController.addEntidad(data));
    ipcMain.handle('entidades:update', (event, data) => entidadesController.updateEntidad(data));
    ipcMain.handle('entidades:delete', (event, codigo) => entidadesController.deleteEntidad(codigo));
    ipcMain.handle('entidades:import-excel', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar archivo Excel',
            filters: [{ name: 'Archivos Excel', extensions: ['xlsx', 'xls', 'csv'] }],
            properties: ['openFile']
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
        const scope = await _elegirDestinoImportacionCatalogo('clientes y proveedores');
        if (!scope) return { success: false, canceled: true };
        return entidadesController.importFromExcel(result.filePaths[0], { scope });
    });
    ipcMain.handle('entidades:export-excel', async () => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar archivo Excel',
            defaultPath: 'ClientesProveedores.xlsx',
            filters: [{ name: 'Archivos Excel', extensions: ['xlsx'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        return entidadesController.exportToExcel(result.filePath);
    });

    // GESTIÓN GLOBAL DE EMPRESAS (Rutas y Carpetas)
    ipcMain.handle('empresa:get-list', () => {
        const settings = getSettings();
        const companies = Array.isArray(settings.companies) ? settings.companies : [];
        const validCompanies = [];

        for (const folderPath of companies) {
            if (!_esDirectorioValido(folderPath)) continue;
            const normalizada = path.resolve(folderPath);
            if (!validCompanies.some(x => _mismaRuta(x, normalizada))) validCompanies.push(normalizada);
        }

        const lastEraInvalida = settings.lastCompanyPath && !_esDirectorioValido(settings.lastCompanyPath);
        const cambioLista = validCompanies.length !== companies.length || validCompanies.some((x, i) => x !== companies[i]);
        if (cambioLista || lastEraInvalida) {
            settings.companies = validCompanies;
            if (lastEraInvalida) settings.lastCompanyPath = null;
            saveSettings(settings);
        }
        return validCompanies;
    });

    // Estado explícito de la conexión actual. No depende del contenido de config_empresa.
    ipcMain.handle('empresa:get-estado', () => getEstadoEmpresa());

    // Reabre la última empresa válida al iniciar la aplicación.
    ipcMain.handle('empresa:checkLast', () => {
        const estadoActual = getEstadoEmpresa();
        if (estadoActual.connected) return { success: true, restored: false, ...estadoActual };

        const settings = getSettings();
        const lastPath = settings.lastCompanyPath;
        if (!lastPath) return { success: true, restored: false, ...estadoActual };

        if (!_esDirectorioValido(lastPath)) {
            _eliminarEmpresaInvalidaDeSettings(lastPath);
            return {
                success: false,
                restored: false,
                connected: false,
                folderPath: null,
                folderName: null,
                dbPath: null,
                error: 'La última empresa utilizada ya no existe. Se eliminó de la lista de empresas recientes.'
            };
        }

        try {
            conectarEmpresa(lastPath);
            _guardarEmpresaActivaEnSettings(lastPath);
            return { success: true, restored: true, ...getEstadoEmpresa() };
        } catch (error) {
            return { success: false, restored: false, ...getEstadoEmpresa(), error: error.message };
        }
    });

    ipcMain.handle('empresa:seleccionar', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar o Crear Carpeta de Empresa',
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled) return { success: false, canceled: true, ...getEstadoEmpresa() };

        const folderPath = path.resolve(result.filePaths[0]);
        try {
            conectarEmpresa(folderPath);
            _guardarEmpresaActivaEnSettings(folderPath);
            return { success: true, ...getEstadoEmpresa() };
        } catch (error) {
            return { success: false, ...getEstadoEmpresa(), error: error.message };
        }
    });

    ipcMain.handle('empresa:conectar-directa', (event, ruta) => {
        if (!_esDirectorioValido(ruta)) {
            _eliminarEmpresaInvalidaDeSettings(ruta);
            return { success: false, ...getEstadoEmpresa(), error: "La carpeta de la empresa ya no existe y ha sido removida de la lista." };
        }
        try {
            const folderPath = path.resolve(ruta);
            conectarEmpresa(folderPath);
            _guardarEmpresaActivaEnSettings(folderPath);
            return { success: true, ...getEstadoEmpresa() };
        } catch (error) {
            return { success: false, ...getEstadoEmpresa(), error: error.message };
        }
    });

    // DATOS DEL PERFIL DE EMPRESA (Configuración Interna)
    ipcMain.handle('empresa:get-info', () => empresaController.getInfoEmpresa());
    ipcMain.handle('empresa:update-info', (event, data) => empresaController.updateInfoEmpresa(data));

    // PLAN DE CUENTAS
    ipcMain.handle('plan-cuentas:get', () => planCuentasController.getPlanCuentas());
    ipcMain.handle('plan-cuentas:add', (event, data) => planCuentasController.addCuenta(data));
    ipcMain.handle('plan-cuentas:update', (event, data) => planCuentasController.updateCuenta(data));
    ipcMain.handle('plan-cuentas:set-er', (event, data) => planCuentasController.setEstadoResultados(data?.codigo, data?.enabled));
    ipcMain.handle('plan-cuentas:delete', (event, codigo) => planCuentasController.deleteCuenta(codigo));
    
    // IMPORTAR EXCEL
    ipcMain.handle('plan-cuentas:import-excel', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar archivo Excel',
            filters: [{ name: 'Archivos Excel', extensions: ['xlsx', 'xls', 'csv'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        const scope = await _elegirDestinoImportacionCatalogo('plan contable');
        if (!scope) return { success: false, canceled: true };
        return planCuentasController.importFromExcel(result.filePaths[0], { scope });
    });
    
    // EXPORTAR EXCEL
    ipcMain.handle('plan-cuentas:export-excel', async () => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar archivo Excel',
            defaultPath: 'PlanContable.xlsx',
            filters: [{ name: 'Archivos Excel', extensions: ['xlsx'] }]
        });

        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        return planCuentasController.exportToExcel(result.filePath);
    });

    // TIPOS DE DOCUMENTOS
    ipcMain.handle('documentos:get', () => tiposDocumentosController.getDocumentos());
    ipcMain.handle('documentos:add', (event, data) => tiposDocumentosController.addDocumento(data));
    ipcMain.handle('documentos:update', (event, data) => tiposDocumentosController.updateDocumento(data));
    ipcMain.handle('documentos:delete', (event, codigo) => tiposDocumentosController.deleteDocumento(codigo));
    ipcMain.handle('documentos:import-excel', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar archivo Excel',
            filters: [{ name: 'Archivos Excel', extensions: ['xlsx', 'xls', 'csv'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
        const scope = await _elegirDestinoImportacionCatalogo('tipos de documento');
        if (!scope) return { success: false, canceled: true };
        return tiposDocumentosController.importFromExcel(result.filePaths[0], { scope });
    });

    // VOUCHERS
    ipcMain.handle('voucher:add', (event, data) => voucherController.addVoucher(data));
    ipcMain.handle('voucher:get-siguiente-numero', (event, data) => getSiguienteNumero(data));

    // AMARRES DEL ASISTENTE
    ipcMain.handle('amarres:get', () => amarresController.getAmarres());
    ipcMain.handle('amarres:add', (event, data) => amarresController.addAmarre(data));
    ipcMain.handle('amarres:update', (event, data) => amarresController.updateAmarre(data));
    ipcMain.handle('amarres:delete', (event, id) => amarresController.deleteAmarre(id));

    // EDITAR REGISTROS
    ipcMain.handle('voucher:buscar', (event, params) => voucherController.buscarVoucher(params));
    ipcMain.handle('voucher:buscar-factura', (event, params) => voucherController.buscarVoucherPorFactura(params));
    ipcMain.handle('voucher:update-completo', (event, data) => voucherController.updateVoucherCompleto(data));
    ipcMain.handle('voucher:documentos-pendientes', (event, params) => voucherController.getDocumentosPendientes(params));

    // MONEDAS Y T.C.
    ipcMain.handle('get-monedas', () => getMonedas());
    ipcMain.handle('add-moneda', (event, data) => addMoneda(data));
    ipcMain.handle('update-moneda', (event, data) => updateMoneda(data));
    ipcMain.handle('delete-moneda', (event, data) => deleteMoneda(data));
    ipcMain.handle('fetch-tipo-cambio-rango', (event, params) => fetchTipoCambioRango(params));

    // ═════════════════════════════════════════════════════════════════
    // DASHBOARD — estadísticas de portada
    // ═════════════════════════════════════════════════════════════════
    ipcMain.handle('dashboard:get-data', () => dashboardController.getDashboardData());
    ipcMain.handle('cartera:get-vencimientos', (event, params) => carteraController.getCarteraVencimientos(params || {}));

    ipcMain.handle('reportes:guardar-pdf', async (event, { filePath, defaultName }) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title:       'Guardar Reporte PDF',
            defaultPath: defaultName || 'Reporte.pdf',
            filters:     [{ name: 'Archivos PDF', extensions: ['pdf'] }],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        try {
            fs.copyFileSync(filePath, result.filePath);
            const { shell } = require('../../server/electron.cjs');
            shell.openPath(result.filePath);
            return { success: true, savedPath: result.filePath };
        } catch (err) {
            console.error('Main: error al guardar PDF:', err);
            return { success: false, error: err.message };
        }
    });

    // ═════════════════════════════════════════════════════════════════
    // REPORTES — API Unificada (nuevo)
    // ═════════════════════════════════════════════════════════════════
    ipcMain.handle('reportes:previsualizar', (event, params) => {
        return reportesController.previsualizar(params);
    });

    ipcMain.handle('reportes:generar-pdf', async (event, params) => {
        return reportesController.generarPDF(params);
    });

    ipcMain.handle('reportes:exportar-excel', (event, params) => {
        return reportesController.exportarExcel(params);
    });

    ipcMain.handle('reportes:guardar-excel', async (event, { filePath, defaultName }) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title:       'Guardar Reporte Excel',
            defaultPath: defaultName || 'Reporte.xlsx',
            filters:     [{ name: 'Archivos Excel', extensions: ['xlsx'] }],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        try {
            fs.copyFileSync(filePath, result.filePath);
            const { shell } = require('../../server/electron.cjs');
            shell.openPath(result.filePath);
            return { success: true, savedPath: result.filePath };
        } catch (err) {
            console.error('Main: error al guardar Excel:', err);
            return { success: false, error: err.message };
        }
    });

    // ── SIRE (Registro de Ventas RVIE / Compras RCE) — LOCAL ──
    const sireController = require('./controllers/sireController');
    ipcMain.handle('sire:datos', (event, params) => sireController.getDatosSire(params));
    ipcMain.handle('sire:exportar-txt', (event, params) => sireController.exportarSireTxt(params));
    ipcMain.handle('sire:guardar-txt', async (event, { filePath, defaultName }) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title:       'Guardar diagnóstico SIRE (TXT)',
            defaultPath: defaultName || 'DIAGNOSTICO_SIRE.txt',
            filters:     [{ name: 'Archivo de texto', extensions: ['txt'] }],
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        try {
            fs.copyFileSync(filePath, result.filePath);
            const { shell } = require('../../server/electron.cjs');
            shell.showItemInFolder(result.filePath);
            return { success: true, savedPath: result.filePath };
        } catch (err) {
            console.error('Main: error al guardar SIRE TXT:', err);
            return { success: false, error: err.message };
        }
    });

    // ── SIRE CONFIG (credenciales SUNAT) ──
    const sireConfigController = require('./controllers/sireConfigController');
    ipcMain.handle('sire-config:get', () => sireConfigController.getConfig());
    ipcMain.handle('sire-config:save', (event, data) => sireConfigController.saveConfig(data));

    // ── SIRE SUNAT API (operaciones contra SUNAT) ──
    const sireSunatController = require('./controllers/sireSunatController');
    ipcMain.handle('sire:test-connection', () => sireSunatController.testConnection());
    ipcMain.handle('sire-sunat:consultar-periodos', (event, params) => sireSunatController.consultarPeriodos(params));
    ipcMain.handle('sire-sunat:descargar-propuesta', (event, params) => sireSunatController.descargarPropuesta(params));
    ipcMain.handle('sire-sunat:consultar-ticket', (event, params) => sireSunatController.consultarTicket(params));
    ipcMain.handle('sire-sunat:descargar-archivo', (event, params) => sireSunatController.descargarArchivo(params));
    ipcMain.handle('sire-sunat:logs', (event, params) => sireSunatController.getLogs(params));
    ipcMain.handle('sire-sunat:operaciones', (event, params) => sireSunatController.getOperaciones(params));
    ipcMain.handle('sire-sunat:listar-archivos', (event, params) => sireSunatController.listarArchivos(params));
    ipcMain.handle('sire:comparar-local-sunat', (event, params) => sireSunatController.compararLocalSunat(params));

    // ── Consulta DNI/RUC (SUNAT/RENIEC) ──
    ipcMain.handle('consultar-documento', async (event, { tipo, numero }) => {
      try {
        if (!numero || numero.trim().length < 8) return { success: false, error: 'Número inválido' };
        const num = numero.trim();
        const urls = tipo === 'dni'
          ? [`https://api.apis.net.pe/v1/dni?numero=${num}`, `https://free.e-api.net.pe/reniec/dni/${num}`]
          : [`https://api.apis.net.pe/v1/ruc?numero=${num}`, `https://free.e-api.net.pe/sunat/ruc/${num}`];
        
        for (const url of urls) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) continue;
            const data = await res.json();
            
            if (tipo === 'dni') {
              const nombre = data.nombreCompleto || data.nombre_completo || 
                [data.apellidoPaterno || data.apellido_paterno, data.apellidoMaterno || data.apellido_materno, data.nombres].filter(Boolean).join(' ');
              if (nombre) return { success: true, nombre: nombre.toUpperCase(), data };
            } else {
              const razon = data.nombre || data.razonSocial || data.razon_social || '';
              const direccion = data.direccion || data.direccionFiscal || '';
              const estado = data.estado || '';
              const condicion = data.condicion || '';
              if (razon) return { success: true, razonSocial: razon, direccion, estado, condicion, data };
            }
          } catch(_) { continue; }
        }
        return { success: false, error: 'No se encontró información.' };
      } catch(e) { return { success: false, error: e.message }; }
    });

    // ── Configuración Estado de Resultados: independiente de Config. EEFF ──
    ipcMain.handle('config-er:get', () => {
      try { return estadoResultadosController.getConfig(); }
      catch (e) { return { success: false, error: e.message, bloques: [], notas: [], cuentasDisponibles: [] }; }
    });
    ipcMain.handle('config-er:save-nota', (event, data) => estadoResultadosController.saveNota(data));
    ipcMain.handle('config-er:delete-nota', (event, id) => estadoResultadosController.deleteNota(id));
    ipcMain.handle('config-er:get-data', (event, params) => estadoResultadosController.getData(params || {}));

    // ── Notas Estados Financieros: CRUD ──
    ipcMain.handle('notas-eeff:get', () => {
      try { const db = require('./database/db').getDB();
        return mainRepository.registrarRutasIPC_all_config_notas_eeff(db);
      } catch(_) { return []; }
    });
    ipcMain.handle('notas-eeff:save', (event, data) => {
      try { const db = require('./database/db').getDB();
        const categoriasEEFF = new Set(['ACTIVO_CORRIENTE','ACTIVO_NO_CORRIENTE','PASIVO_CORRIENTE','PASIVO_NO_CORRIENTE','PATRIMONIO']);
        if (!categoriasEEFF.has(String(data.categoria || ''))) return { success:false, error:'Categoría no válida para Config. EEFF. La Config. ER se administra por separado.' };
        if (data.id) {
          mainRepository.registrarRutasIPC_run_config_notas_eeff(db, data.numero, data.nombre, data.categoria, JSON.stringify(data.cuentas||[]), data.orden||0, data.id);
        } else {
          mainRepository.registrarRutasIPC_run_config_notas_eeff_2(db, data.numero, data.nombre, data.categoria, JSON.stringify(data.cuentas||[]), data.orden||0);
        }
        return { success: true };
      } catch(e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('notas-eeff:delete', (event, id) => {
      try { const db = require('./database/db').getDB();
        mainRepository.registrarRutasIPC_run_config_notas_eeff_3(db, id);
        return { success: true };
      } catch(e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('notas-eeff:get-esf', (event, { desde, hasta }) => {
      try {
        const db = require('./database/db').getDB();
        const notas = mainRepository.registrarRutasIPC_all_config_notas_eeff_2(db);
        // Get balances for all accounts in the period
        const balances = mainRepository.registrarRutasIPC_all_voucher_detalles(db, desde, hasta);
        const balMap = new Map(balances.map(b => [String(b.cuenta || '').trim(), b]));
        const { buildEffectivePlanMap, resolveEffectiveAccountName } = require('./services/catalogos/planCuentasLookup');
        const planMap = buildEffectivePlanMap();
        
        const resultado = notas.map(n => {
          const cuentasArr = JSON.parse(n.cuentas || '[]');
          let total = 0;
          const detalle = cuentasArr.map(codigo => {
            // Sum all accounts that START with this code
            let saldo = 0;
            for (const [key, bal] of balMap) {
              if (key.startsWith(codigo)) {
                const elem = key.charAt(0);
                if (['1','2','3'].includes(elem)) saldo += bal.saldo_deudor;
                else if (['4','5'].includes(elem)) saldo += bal.saldo_acreedor;
              }
            }
            total += saldo;
            // Denominación desde el Plan de Cuentas efectivo (Local sobre Global),
            // con fallback al nombre histórico guardado en los movimientos.
            const nombre = resolveEffectiveAccountName(codigo, { planMap, balanceMap: balMap });
            return { codigo, nombre, saldo };
          });
          return { ...n, cuentas: cuentasArr, detalle, total };
        });
        return { success: true, notas: resultado };
      } catch(e) { return { success: false, error: e.message, notas: [] }; }
    });

    // ── SIRE Codificación: guardar/cargar config de cuentas ──
    ipcMain.handle('sire:codificacion-get', () => {
      try { const db = require('./database/db').getDB();
        return mainRepository.registrarRutasIPC_get_sire_config(db) || {};
      } catch(_) { return {}; }
    });
    ipcMain.handle('sire:codificacion-save', (event, data) => {
      try { const db = require('./database/db').getDB();
        mainRepository.registrarRutasIPC_run_sire_config(db, data.cuenta_gasto||'', data.cuenta_ingreso||'', data.cuenta_igv_compras||'', data.cuenta_igv_ventas||'', data.cuenta_cxp||'', data.cuenta_cxc||'');
        return { success: true };
      } catch(e) { return { success: false, error: e.message }; }
    });

    // ── SIRE Contabilizar: registrar vouchers desde archivo SIRE ──
    ipcMain.handle('sire:contabilizar-zip', (event, { registros, tipo, glosa, config }) => {
      try {
        const db = require('./database/db').getDB();
        if (!db) return { success: false, error: 'No hay base de datos conectada.' };
        const { addVoucher } = require('./controllers/voucherController');
        const origen = tipo === 'ventas' ? '14' : '8';
        const cuentaBase = tipo === 'ventas' ? config.cuenta_ingreso : config.cuenta_gasto;
        const cuentaIGV  = tipo === 'ventas' ? config.cuenta_igv_ventas : config.cuenta_igv_compras;
        const cuentaDest = tipo === 'ventas' ? config.cuenta_cxc : config.cuenta_cxp;
        if (!cuentaBase || !cuentaDest) return { success:false, error:'Configure las cuentas en Codificación primero.' };
        // Obtener nombres de cuentas del plan contable
        const getNombreCuenta = (codigo) => {
          try { return mainRepository.registrarRutasIPC_get_plan_cuentas(db, codigo)?.descripcion || ''; }
          catch(_) { return ''; }
        };
        const nombreBase = getNombreCuenta(cuentaBase);
        const nombreIGV = cuentaIGV ? getNombreCuenta(cuentaIGV) : '';
        const nombreDest = getNombreCuenta(cuentaDest);
        console.log(`SIRE Contabilizar: ${registros.length} registros, tipo=${tipo}, origen=${origen}, cuentas=${cuentaBase}/${cuentaIGV}/${cuentaDest}`);
        let ok=0, errores=[];
        for (const reg of registros) {
          try {
            // Preservar la clasificación tributaria recibida de SIRE. El asiento se
            // construye con importes absolutos y, para notas/ajustes negativos, se
            // invierte Debe/Haber; el comprobante tributario conserva el signo SUNAT.
            const n = (v) => { const x=Number.parseFloat(v); return Number.isFinite(x)?x:0; };
            const venta = tipo === 'ventas';
            const valorExport = n(reg.valor_exportacion);
            const baseGravada = n(reg.base_gravada || reg.base_imponible);
            const descuentoBase = n(reg.descuento_base);
            const igvVenta = n(reg.igv);
            const descuentoIgv = n(reg.descuento_igv);
            const exonerado = n(reg.exonerado || reg.importe_exonerado);
            const inafecto = n(reg.inafecto || reg.importe_inafecto);
            const isc = n(reg.isc);
            const baseIvap = n(reg.base_ivap);
            const ivap = n(reg.ivap);
            const icbper = n(reg.icbper || reg.icbp);
            const otros = n(reg.otros_tributos || reg.otros);

            const tieneGruposCompra = !venta && ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv']
              .some(k => Object.prototype.hasOwnProperty.call(reg, k));
            const g1Base = venta ? 0 : (tieneGruposCompra ? n(reg.g1_base) : n(reg.base_gravada || reg.base_imponible));
            const g1Igv = venta ? 0 : (tieneGruposCompra ? n(reg.g1_igv) : n(reg.igv));
            const g2Base = n(reg.g2_base), g2Igv = n(reg.g2_igv);
            const g3Base = n(reg.g3_base), g3Igv = n(reg.g3_igv);
            const noGravado = n(reg.valor_no_gravado || reg.valor_no_grav) || (!venta ? exonerado + inafecto : 0);

            let totalSigned = n(reg.total ?? reg.importe_total);
            if (Math.abs(totalSigned) < 0.00001) {
              totalSigned = venta
                ? valorExport + baseGravada + descuentoBase + igvVenta + descuentoIgv + exonerado + inafecto + isc + baseIvap + ivap + icbper + otros
                : g1Base + g1Igv + g2Base + g2Igv + g3Base + g3Igv + noGravado + isc + icbper + otros;
            }
            const igvSigned = venta ? (igvVenta + descuentoIgv) : (g1Igv + g2Igv + g3Igv);
            const signo = totalSigned < -0.00001 ? -1 : 1;
            const totalMag = Math.abs(totalSigned);
            const igvMag = Math.abs(igvSigned);
            // Los tributos distintos al IGV se mantienen separados en el modelo
            // tributario; hasta que exista una cuenta de codificación específica se
            // incorporan en la línea de gasto/ingreso para que el asiento cuadre.
            const baseContableMag = Math.max(0, totalMag - igvMag);

            const docNumero = `${reg.serie||''}-${reg.numero||''}`;
            const fechaDoc = reg.fecha_emision || '';
            const fechaVenc = reg.fecha_venc || reg.fecha_vencimiento || fechaDoc || '';
            const moneda = reg.moneda || 'PEN';
            const tc = n(reg.tc || reg.tipo_cambio) || 1;
            const codigo = reg.ruc_dni || reg.ruc_entidad || '';
            const razonSocial = reg.razon_social || '';
            const tipoDoc = reg.tipo_doc || reg.tipo_documento || '';
            const periodoRaw = reg.periodo || '';
            const periodo = periodoRaw.length === 6 ? periodoRaw.slice(0,4) + '-' + periodoRaw.slice(4,6) :
                           periodoRaw.length === 7 ? periodoRaw :
                           (fechaDoc ? fechaDoc.substring(0,7) : '');

            console.log(`  ${docNumero}: totalTrib=${totalSigned} igv=${igvSigned} baseContable=${baseContableMag} fecha=${fechaDoc} per=${periodo} ruc=${codigo}`);

            if (totalMag <= 0.00001) { errores.push(`${docNumero}: comprobante sin importe total`); continue; }
            if (igvMag > 0.00001 && !cuentaIGV) { errores.push(`${docNumero}: tiene IGV pero no se configuró la cuenta IGV`); continue; }

            const detalles = [];
            const invierte = signo < 0;
            if (baseContableMag > 0.00001) detalles.push({
              cuenta: cuentaBase, nombre_cuenta: nombreBase,
              debe: venta ? (invierte?baseContableMag:0) : (invierte?0:baseContableMag),
              haber: venta ? (invierte?0:baseContableMag) : (invierte?baseContableMag:0),
              moneda, tc, doc_tipo:tipoDoc, doc_numero:docNumero, fecha_doc:fechaDoc, fecha_venc:fechaVenc,
              codigo, razon_social:razonSocial, glosa
            });
            if (igvMag > 0.00001 && cuentaIGV) detalles.push({
              cuenta: cuentaIGV, nombre_cuenta: nombreIGV,
              debe: venta ? (invierte?igvMag:0) : (invierte?0:igvMag),
              haber: venta ? (invierte?0:igvMag) : (invierte?igvMag:0),
              moneda, tc, doc_tipo:tipoDoc, doc_numero:docNumero, fecha_doc:fechaDoc,
              codigo, razon_social:razonSocial, glosa
            });
            detalles.push({
              cuenta: cuentaDest, nombre_cuenta: nombreDest,
              debe: venta ? (invierte?0:totalMag) : (invierte?totalMag:0),
              haber: venta ? (invierte?totalMag:0) : (invierte?0:totalMag),
              moneda, tc, doc_tipo:tipoDoc, doc_numero:docNumero, fecha_doc:fechaDoc, fecha_venc:fechaVenc,
              codigo, razon_social:razonSocial, glosa
            });

            const comprobante = {
              fecha_emision:fechaDoc, fecha_vencimiento:fechaVenc, tipo_documento:tipoDoc,
              serie:reg.serie||'', numero:reg.numero||'', tipo_doc_identidad:reg.tipo_doc_id||reg.tipo_doc_identidad||'',
              numero_doc_identidad:codigo, razon_social:razonSocial, moneda, tipo_cambio:tc,
              car_sunat:reg.car_sunat||reg.car||'', fuente:'SIRE', requiere_revision:Number(reg.requiere_revision||0)?1:0,
              ref_fecha:reg.ref_fecha||'', ref_tipo_documento:reg.ref_tipo_documento||'', ref_serie:reg.ref_serie||'', ref_numero:reg.ref_numero||''
            };
            const tributario = venta ? {
              tipo_registro:'VENTA', comprobante,
              venta:{ valor_exportacion:valorExport, base_gravada:baseGravada, descuento_base:descuentoBase,
                igv:igvVenta, descuento_igv:descuentoIgv, importe_exonerado:exonerado, importe_inafecto:inafecto,
                isc, base_ivap:baseIvap, ivap, icbper, otros_tributos:otros, importe_total:totalSigned }
            } : {
              tipo_registro:'COMPRA', comprobante,
              compra:{ g1_base:g1Base,g1_igv:g1Igv,g2_base:g2Base,g2_igv:g2Igv,g3_base:g3Base,g3_igv:g3Igv,
                valor_no_gravado:noGravado,isc,icbper,otros_tributos:otros,importe_total:totalSigned,
                detraccion_numero:reg.detraccion_numero||'',detraccion_fecha:reg.detraccion_fecha||'',marca_retencion:reg.marca_retencion||'' }
            };

            console.log(`  -> ${detalles.length} líneas, debe=${detalles.reduce((s,d)=>s+d.debe,0).toFixed(2)} haber=${detalles.reduce((s,d)=>s+d.haber,0).toFixed(2)}`);
            const r = addVoucher({ origen, fechaContable: fechaDoc, periodo, glosa, detalles, tributario });
            console.log(`  -> addVoucher:`, r.success ? 'OK id=' + r.id : 'ERROR: ' + r.error);
            if (r.success) ok++; else errores.push(`${docNumero}: ${r.error}`);
          } catch(e) { console.error(`  ERROR: ${e.message}`); errores.push(`${reg.serie||''}-${reg.numero||''}: ${e.message}`); }
        }
        console.log(`SIRE Contabilizar: ${ok} ok, ${errores.length} errores`);
        return { success:true, registrados:ok, errores };
      } catch(e) { return { success:false, error:e.message }; }
    });
}


registrarRutasIPC();

module.exports={fetchDailyExchangeRateOnStartup};
