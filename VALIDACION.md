# Validación de PostgreSQL — 8 de octubre de 2026

Motor activo: PostgreSQL de Supabase. Catálogo global y una empresa de la versión web anterior importados, sin sobrescribir las copias locales.

## Evidencia

- 50 pruebas de la suite original y 31 pruebas web pasan.
- 6 pruebas del esquema y repositorio PostgreSQL pasan: campos/semillas, aislamiento, relaciones, certificados, creación de empresas y guardado del período.
- 3 pruebas de traducción de consultas y 3 pruebas de separación de repositorios pasan. 6 pruebas de sincronización y presentación del editor pasan. 5 pruebas de regresión del balance pasan. 6 pruebas de período de trabajo pasan. Total automatizado: **110 pruebas**.
- Comparación contra PostgreSQL real: resultados idénticos a SQLite para nueve familias de reportes, cartera, dashboard y documentos pendientes usando un conjunto controlado de asientos.
- Verificación real de creación/búsqueda de asientos, totales, correlativos, respaldo SQLite, reimportación y creación posterior sin colisión de identificadores.
- Verificación real de Storage: bucket privado; acceso del propietario permitido, acceso de otro usuario y anónimo bloqueado. Los objetos de esa prueba se revirtieron.
- Verificación en Chrome: ingreso real, apertura de la empresa migrada y dashboard conectado a PostgreSQL. La consulta automática del tipo de cambio guardó datos correctamente.
- Respaldo solicitado desde Chrome: objeto real de 167.936 bytes guardado en Storage privado, descargado al equipo y comprobado con `integrity_check = ok`.

Las pruebas reales usan una cuenta confirmada existente y transacciones revertidas. Las semillas del escritorio conservan sus identificadores. Los empates de cantidades por origen se ordenan de forma explícita para obtener el mismo orden en ambos motores.

## Separación de acceso a datos

Se extrajeron las consultas de los 15 controladores, servicios con acceso a datos, registro de rutas y manejo web de reintentos a `src/main/repositories/`. Se conservan los cálculos, validaciones y límites transaccionales. Los identificadores dinámicos de catálogos y configuración SIRE se restringen a los campos declarados; los valores continúan ligados mediante parámetros. PostgreSQL crea sus tablas desde migraciones SQL. SQLite mantiene su esquema de compatibilidad para importar, respaldar y revisar.

La comparación entre motores incluye ahora el mismo catálogo global, además de la misma empresa, para comparar también los tipos de cambio.

## Flujo del detalle tributario del comprobante

El Asistente concentra el ingreso del comprobante y conserva todos los campos. Se retiraron el botón y el modal tributario independientes; el voucher muestra un estado informativo. Los importes habituales se completan desde Base/IGV/Total y los especiales quedan desplegables dentro del Asistente. Otros impuestos, distribuciones mixtas y referencias están en secciones desplegables. Un comprobante simple reabierto mantiene su clasificación y tasa sin activar la distribución especial. Una validación compartida entre navegador y servidor rechaza fichas vacías, importes inválidos y componentes que no suman el total, con tolerancia de un céntimo. El estado se actualiza al cambiar las líneas. El guardado inconsistente revierte asiento y detalle juntos.

Los duplicados distinguen tipo de documento y, en compras, proveedor, incluyendo la edición. El asistente permite elegir G1/G2/G3 para clasificar compras gravadas. Esa selección conserva la generación contable configurada en los amarres: el usuario debe revisar las cuentas de IGV en G2/G3; no se calcula prorrata automáticamente.

Comprobación visual en un espacio local aislado: compra base 100, IGV 18 y total 118 generada con tres líneas; reabrir y completar el comprobante conserva exactamente esas líneas; guardar persiste el asiento y asigna el siguiente correlativo. El ingreso manual permite completar el comprobante dentro del mismo Asistente sin regenerar líneas. Las correcciones posteriores permanecen en Editar Registros. La barra web tiene espacio reservado para no tapar Guardar Asiento. No se modificaron los movimientos ni credenciales de la instancia Supabase.

## Límites

Esta evidencia cubre los casos de prueba, no certifica equivalencia integral de toda contabilidad posible. Faltan datos históricos reales del escritorio, validación de todos los formatos PDF/Excel, escenarios completos del asistente, SIRE con credenciales y respuestas reales, pruebas de volumen/carga y recuperación ante fallos. Los archivos SIRE históricos solo existentes en el escritorio requieren traslado separado; los generados en la web se sincronizan con Storage.

El alojamiento público y las copias automáticas siguen pendientes. La interfaz se comprueba en el navegador por separado. El escritorio original permanece intacto.

---

## Evidencia anterior de la adaptación web (SQLite)

# Validación de la conversión web

Fecha: 7 de octubre de 2026. Estado: base completa de módulos disponible para revisión local; producción y equivalencia integral pendientes.

## Evidencia automática

45 pruebas originales pasan, sin omisiones. 25 pruebas de adaptación web pasan. Total: **70 pruebas**.

La suite original cubre migraciones, reglas de vouchers/tributación, catálogos, monedas, cartera, estados de resultados, seguridad SUNAT y contratos estáticos de interfaz.

La suite web comprueba:

- Registro de los 73 canales originales, sin omitir operaciones.
- Rechazo de solicitudes sin sesión, orígenes externos, empresas desconocidas y rutas arbitrarias.
- Aplicación de las migraciones originales y creación de empresa/perfil/cuentas.
- Cuadre de vouchers, numeración, persistencia y búsqueda.
- Separación entre empresas y catálogos de distintos espacios; herencia global dentro del mismo espacio.
- Contexto correcto durante dos solicitudes asíncronas simultáneas.
- Igualdad entre HTTP y el controlador para dashboard y las nueve familias de previsualización de reportes. Esta comparación verifica el transporte; no sustituye una auditoría de los cálculos históricos.
- Generación real de PDF y XLSX de Libro Diario, firmas de archivo y restricciones de descarga.
- Reintentos idempotentes de nuevos asientos; rechazo de edición con una versión antigua.
- Compras y ventas, detección de comprobantes duplicados, datos locales SIRE y TXT diagnóstico.
- Monedas manuales, amarres y respuesta de cartera/notas/operaciones SIRE.
- Respaldo SQLite consistente y reimportación en una nueva empresa, con los mismos vouchers e importes.
- Rechazo de bases falsas y de importaciones globales que sobrescribirían un espacio existente.
- Carga real de XLSX en cuentas, documentos y entidades, con aislamiento por empresa.
- Autenticación Supabase simulada: no existe acceso demo cuando está configurado Supabase; sesiones HttpOnly/Secure; rechazo de contraseña inválida; bloqueo al revocarse un usuario; cierre de sesión.

## Evidencia manual en navegador

Se cargaron las pantallas originales. Se creó una empresa ficticia, se cargaron catálogos de prueba y se abrió el voucher de Compras. El asistente reconoció la entidad y la cuenta, calculó base 100 + IGV 18 = total 118 y generó las tres líneas con el amarre original. El guardado mostró «Voucher guardado correctamente. Número asignado: 1» y avanzó al correlativo 2. Los datos tributarios quedaron marcados como listos.

El dashboard mostró el asiento y sus totales de debe/haber 118. La consulta automática original de tipo de cambio consiguió una respuesta y los tipos de cambio aparecieron en su pantalla. Esta observación verifica que la consulta funcionó en esta ejecución, no la disponibilidad futura del proveedor externo.

Se conserva una captura de la pantalla de voucher y otra de la aplicación original en la web. Las capturas contienen únicamente datos de prueba.

## Supabase real

Se accedió al proyecto compartido por el usuario, se localizó una clave Publishable existente y se guardó en la configuración local. La consulta a `/auth/v1/settings` devolvió HTTP 200: correo habilitado, registro permitido y confirmación por correo requerida. La pantalla de inicio de sesión web del servidor configurado también se verificó.

El usuario completó la creación de su cuenta y el inicio de sesión real en Ansorito. Se verificó la pantalla original con el indicador «Sesión Supabase» y un espacio de empresas vacío. La cuenta aparece confirmada en el Dashboard. El espacio local asociado al usuario se creó correctamente y permanece separado de los datos ficticios de revisión. Las pruebas de autenticación automáticas usan respuestas simuladas y se identifican así, sin afirmar que son sesiones reales.

No se modificaron tablas, políticas ni registros contables remotos. No se revelaron ni copiaron claves secretas del proyecto.

## Condiciones de aceptación aún pendientes

| Área | Lo pendiente |
|---|---|
| Datos del escritorio | Importar copias reales y comparar cantidades, saldos, catálogos y cada reporte contra el escritorio. No había bases reales de empresas en el código analizado. |
| Asistente | Recorrer todos los orígenes, afectaciones, tasas, amarres y monedas con casos de operación real. La prueba manual terminada corresponde a compra gravada en PEN. |
| Reportes | Revisar visualmente cada PDF/XLSX con varios períodos y empresas, incluidos ER/ESF y notas. El Formato 2.0 del Libro Diario permanece en construcción, igual que en el escritorio. |
| SIRE/SUNAT | Credenciales válidas, OAuth, propuestas, tickets, archivos, comparación, contabilización ZIP y conciliación real. El código está incluido, pero estos recorridos no se han validado de extremo a extremo. |
| Credenciales importadas | Reingresar secretos del escritorio protegidos por su sistema operativo cuando no sean transportables. |
| Acceso real | La creación de cuenta y el ingreso real ya se completaron. Falta comprobar el aislamiento con dos usuarios reales y el acceso remoto publicado. |
| Publicación | Seleccionar alojamiento con disco persistente, HTTPS, respaldo automático y ensayo de restauración. No hay URL pública publicada. |
| Usuarios de equipo | Definir y añadir invitaciones/roles/espacios compartidos si varias personas trabajarán la misma empresa. Hoy cada usuario tiene su propio espacio. |
| PostgreSQL | Si se desea almacenar toda la contabilidad en Supabase, portar las consultas y migraciones y repetir la comparación. Esta versión conserva SQLite en servidor. |

**Las 70 pruebas no certifican por sí solas que todas las funciones sean idénticas con datos reales.** Son la evidencia inicial para seguir la migración sin omitir los módulos existentes.

La carpeta fuente del escritorio se mantiene intacta. PROVENIENCIA.json registra las huellas de los archivos originales y de las copias web.

## Simplificación de Editar Registros

Comprobación visual en datos locales aislados: compra de base 100 / IGV 18 / total 118 editada a 200 / 36 / 236. El resumen tributario se actualizó sin una segunda entrada de montos, mantuvo G1 y se guardó junto con las tres líneas. Los campos especiales permanecen cerrados por defecto y su edición de importes requiere activar el modo manual. Las pruebas cubren G2/G3, ventas exoneradas, notas negativas, conservación de detracciones, reversión de líneas y bloqueo de cambios ambiguos aunque el total coincida. La sincronización se limita a estructuras simples identificables en PEN; no infiere la clasificación de operaciones mixtas.

La verificación visual detectó y corrigió un falso conflicto de versión al buscar por período/factura: sus columnas adicionales de presentación producían una versión diferente a la búsqueda por ID. Ahora ambas utilizan la representación canónica, conservando el rechazo de versiones antiguas.

## Balance de comprobación y cuenta 40

Las cuentas patrimoniales de elementos 1 a 5 trasladan su saldo deudor a Activo y su saldo acreedor a Pasivo/Patrimonio en la hoja de comprobación, independientemente del prefijo. Los elementos 6 a 9 conservan el tratamiento previo de resultados y cuentas de destino. No se modifica la configuración ni la presentación del Estado de Situación Financiera.

Se reprodujeron los movimientos de la observación en un espacio local aislado: cuenta 40, débito 2 409.80 y crédito 988.48, saldo deudor 1 421.32. Activo corregido 27 447.92; Pasivo/Patrimonio 35 392.00; pérdida 7 944.08 coincidente en Cuentas, Naturaleza y Función. La pantalla, la estructura de la tabla PDF y el archivo Excel se verificaron contra esos importes; además se probaron saldos contrarios al prefijo a dos dígitos y al detalle. No se modificó información de Supabase ni movimientos reales.

## Período de trabajo por empresa

Se verifica la persistencia en el perfil, el aislamiento entre dos empresas, la conservación del período al editar datos de empresa, rechazo de meses/años inválidos, febrero bisiesto y compatibilidad con perfiles que guardaban solo el año. La prueba PostgreSQL utiliza el SQL real del repositorio, su traducción con clave de ámbito y RLS para comprobar que el upsert conserva nombre y RUC y no altera otra empresa.

Comprobación visual local aislada: guardar Julio 2026; barra superior y Voucher muestran julio; la fecha inicial del voucher es 2026-07-01; Editar Registros inicia con 2026-07; reportes inician entre 2026-07-01 y 2026-07-31 y disponen de «Mes de trabajo»; recargar conserva julio y Dashboard consulta el mes seleccionado. Cambiar a agosto con una línea editada sin guardar queda bloqueado y volver a Editar Registros conserva el importe del borrador. No se modificaron preferencias ni movimientos reales en Supabase.

El selector limita el ejercicio al año actual y muestra, en ese año, únicamente los meses transcurridos incluyendo el actual. En ejercicios anteriores ofrece los doce meses. Volver de diciembre de un ejercicio anterior al año actual ajusta el mes al último disponible. El servidor rechaza períodos futuros aunque se envíen directamente a la API. Si se había guardado un período futuro, se utiliza el mes actual al leerlo, sin modificar movimientos ni reescribir silenciosamente el perfil. Se probaron enero, diciembre y el caso octubre de 2026 en la función compartida, el rechazo HTTP y el selector real en Chrome.

## Amarres de destino configurables

Validación adicional: CRUD por empresa, cuentas existentes en catálogo efectivo, porcentaje y distribución, prioridad de prefijo/origen, redondeo y moneda, vista previa, reintentos sin duplicados, preservación de reglas históricas, actualización de importes, líneas automáticas independientes del total tributario, importación SIRE con nota de crédito, rollback completo y respaldo/restauración con amarres. PostgreSQL/PGlite confirma migración, trazabilidad, borrado por cascada y aislamiento por usuario y empresa. Revisión visual realizada en una empresa SQLite desechable; no se agregaron reglas ni vouchers de prueba a empresas reales de Supabase.

Resultado de esta revisión: 68 pruebas web/PostgreSQL y 50 pruebas originales (118 en total). La migración de tablas nuevas se aplicó al proyecto Supabase configurado. Reiniciar el servidor y recargar la página para cargar las rutas nuevas.

## Creación y edición de empresas

Los botones de los diálogos web tienen 12 px de separación. Guardar el nombre comercial actualiza el directorio y perfil en PostgreSQL dentro de una transacción, conservando el ID de empresa y los registros. La revisión SQLite sincroniza su directorio por escritura atómica y conserva rutas anteriores para conexiones existentes. La pantalla refresca lista, perfil y menú lateral al guardar; permite perfiles sin logo.

Pruebas: 70 web/PostgreSQL y 50 originales aprobadas; regresión adicional del perfil sin logo aprobada. Revisiones visuales hechas en una empresa desechable. Reiniciar el servidor para cargar la sincronización del directorio y recargar la página.

### Vista previa discreta de destinos

Se retiró el botón de la barra del voucher. «Destinos del asiento» aparece cerrado cuando existen líneas con un amarre aplicable. La vista previa se actualiza al agregar, editar o quitar líneas, cambiar el origen o volver al voucher. Se ignoran respuestas antiguas para evitar mostrar destinos de un borrador anterior. Comprobado visualmente: voucher vacío sin sección, compra con destinos calculados automáticamente y cambio a un origen sin amarre que oculta la sección. El guardado continúa generando los destinos en el servidor.
