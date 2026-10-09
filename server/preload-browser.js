// src/preload.js
const contextBridge = { exposeInMainWorld: (name, value) => window[name] = value };
const ipcRenderer = { invoke: invokeWeb };

contextBridge.exposeInMainWorld('api', {
    // --- GESTIÓN GLOBAL DE EMPRESAS (Rutas) ---
    seleccionarEmpresa: () => ipcRenderer.invoke('empresa:seleccionar'),
    checkLastEmpresa: () => ipcRenderer.invoke('empresa:checkLast'),
    getEmpresaEstado: () => ipcRenderer.invoke('empresa:get-estado'),
    getEmpresasLista: () => ipcRenderer.invoke('empresa:get-list'),
    conectarRutaDirecta: (ruta) => ipcRenderer.invoke('empresa:conectar-directa', ruta),

    // --- DATOS INTERNOS DE LA EMPRESA ACTIVA ---
    getPeriodoTrabajo: () => ipcRenderer.invoke('empresa:get-periodo'),
    setPeriodoTrabajo: (data) => ipcRenderer.invoke('empresa:set-periodo', data),
    getEmpresaInfo: () => ipcRenderer.invoke('empresa:get-info'),
    updateEmpresaInfo: (data) => ipcRenderer.invoke('empresa:update-info', data),

    // --- PLAN DE CUENTAS ---
    getPlanCuentas: () => ipcRenderer.invoke('plan-cuentas:get'),
    addCuenta: (data) => ipcRenderer.invoke('plan-cuentas:add', data),
    updateCuenta: (data) => ipcRenderer.invoke('plan-cuentas:update', data),
    setCuentaEstadoResultados: (data) => ipcRenderer.invoke('plan-cuentas:set-er', data),
    deleteCuenta: (codigo) => ipcRenderer.invoke('plan-cuentas:delete', codigo),
    importarExcelCuentas: () => ipcRenderer.invoke('plan-cuentas:import-excel'),
    exportarExcelCuentas: () => ipcRenderer.invoke('plan-cuentas:export-excel'),

    // --- TIPOS DE DOCUMENTOS ---
    getDocumentos: () => ipcRenderer.invoke('documentos:get'),
    addDocumento: (data) => ipcRenderer.invoke('documentos:add', data),
    updateDocumento: (data) => ipcRenderer.invoke('documentos:update', data),
    deleteDocumento: (codigo) => ipcRenderer.invoke('documentos:delete', codigo),
    importarExcelDocumentos: () => ipcRenderer.invoke('documentos:import-excel'),

    // --- ENTIDADES (Cliente / Proveedor) ---
    getEntidades: () => ipcRenderer.invoke('entidades:get'),
    addEntidad: (data) => ipcRenderer.invoke('entidades:add', data),
    updateEntidad: (data) => ipcRenderer.invoke('entidades:update', data),
    deleteEntidad: (codigo) => ipcRenderer.invoke('entidades:delete', codigo),
    importarExcelEntidades: () => ipcRenderer.invoke('entidades:import-excel'),
    exportarExcelEntidades: () => ipcRenderer.invoke('entidades:export-excel'),

    // --- VOUCHERS ---
    addVoucher: (data) => ipcRenderer.invoke('voucher:add', data),
    getSiguienteNumeroVoucher: (data) => ipcRenderer.invoke('voucher:get-siguiente-numero', data),

    // --- AMARRES DEL ASISTENTE ---
    getAmarres: () => ipcRenderer.invoke('amarres:get'),
    addAmarre: (data) => ipcRenderer.invoke('amarres:add', data),
    updateAmarre: (data) => ipcRenderer.invoke('amarres:update', data),
    deleteAmarre: (id) => ipcRenderer.invoke('amarres:delete', id),

    // --- MONEDAS Y T.C. ---
    getMonedas: () => ipcRenderer.invoke('get-monedas'),
    addMoneda: (data) => ipcRenderer.invoke('add-moneda', data),
    updateMoneda: (data) => ipcRenderer.invoke('update-moneda', data),
    deleteMoneda: (data) => ipcRenderer.invoke('delete-moneda', data),
    fetchTipoCambioRango: (params) => ipcRenderer.invoke('fetch-tipo-cambio-rango', params),

    // --- DASHBOARD ---
    getDashboardData: () => ipcRenderer.invoke('dashboard:get-data'),
    getCarteraVencimientos: (params) => ipcRenderer.invoke('cartera:get-vencimientos', params),

    // --- REPORTES ---
    guardarPDF: (params) =>
        ipcRenderer.invoke('reportes:guardar-pdf', params),

    // --- REPORTES (API UNIFICADA) ---
    previsualizarReporte: (params) => ipcRenderer.invoke('reportes:previsualizar', params),
    generarReportePDF: (params) => ipcRenderer.invoke('reportes:generar-pdf', params),
    exportarReporteExcel: (params) => ipcRenderer.invoke('reportes:exportar-excel', params),
    guardarExcel: (params) => ipcRenderer.invoke('reportes:guardar-excel', params),

    // --- EDITAR REGISTROS ---
    buscarVoucher: (params) => ipcRenderer.invoke('voucher:buscar', params),
    buscarVoucherPorFactura: (params) => ipcRenderer.invoke('voucher:buscar-factura', params),
    // SIRE LOCAL
    getDatosSire: (params) => ipcRenderer.invoke('sire:datos', params),
    exportarSireTxt: (params) => ipcRenderer.invoke('sire:exportar-txt', params),
    guardarSireTxt: (params) => ipcRenderer.invoke('sire:guardar-txt', params),

    // SIRE CONFIG (credenciales SUNAT)
    getSireConfig: () => ipcRenderer.invoke('sire-config:get'),
    saveSireConfig: (data) => ipcRenderer.invoke('sire-config:save', data),

    // SIRE SUNAT API
    testSireConnection: () => ipcRenderer.invoke('sire:test-connection'),
    consultarPeriodosSire: (params) => ipcRenderer.invoke('sire-sunat:consultar-periodos', params),
    descargarPropuestaSire: (params) => ipcRenderer.invoke('sire-sunat:descargar-propuesta', params),
    consultarTicketSire: (params) => ipcRenderer.invoke('sire-sunat:consultar-ticket', params),
    descargarArchivoSire: (params) => ipcRenderer.invoke('sire-sunat:descargar-archivo', params),
    getSireLogs: (params) => ipcRenderer.invoke('sire-sunat:logs', params),
    getSireOperaciones: (params) => ipcRenderer.invoke('sire-sunat:operaciones', params),
    listarArchivosSire: (params) => ipcRenderer.invoke('sire-sunat:listar-archivos', params),
    compararSireLocalSunat: (params) => ipcRenderer.invoke('sire:comparar-local-sunat', params),

    updateVoucherCompleto: (data) => ipcRenderer.invoke('voucher:update-completo', data),
    getDocumentosPendientes: (params) => ipcRenderer.invoke('voucher:documentos-pendientes', params),

    // Consulta DNI/RUC
    consultarDocumento: (params) => ipcRenderer.invoke('consultar-documento', params),

    // Notas Estados Financieros
    getConfigER: () => ipcRenderer.invoke('config-er:get'),
    saveNotaER: (data) => ipcRenderer.invoke('config-er:save-nota', data),
    deleteNotaER: (id) => ipcRenderer.invoke('config-er:delete-nota', id),
    getEstadoResultadosData: (params) => ipcRenderer.invoke('config-er:get-data', params),

    getNotasEEFF: () => ipcRenderer.invoke('notas-eeff:get'),
    saveNotaEEFF: (data) => ipcRenderer.invoke('notas-eeff:save', data),
    deleteNotaEEFF: (id) => ipcRenderer.invoke('notas-eeff:delete', id),
    getESFData: (params) => ipcRenderer.invoke('notas-eeff:get-esf', params),

    // SIRE Codificación
    getSireCodificacion: () => ipcRenderer.invoke('sire:codificacion-get'),
    saveSireCodificacion: (data) => ipcRenderer.invoke('sire:codificacion-save', data),
    contabilizarZip: (data) => ipcRenderer.invoke('sire:contabilizar-zip', data),
});
