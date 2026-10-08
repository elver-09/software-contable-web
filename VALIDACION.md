# Validación de PostgreSQL — 8 de octubre de 2026

Motor activo: PostgreSQL de Supabase. Catálogo global y una empresa de la versión web anterior importados, sin sobrescribir las copias locales.

## Evidencia

- 45 pruebas originales y 25 pruebas web pasan.
- 5 pruebas del esquema y repositorio PostgreSQL pasan: campos/semillas, aislamiento, relaciones, certificados y creación de empresas.
- 3 pruebas de traducción de consultas pasan. Total automatizado: **78 pruebas**.
- Comparación contra PostgreSQL real: resultados idénticos a SQLite para nueve familias de reportes, cartera, dashboard y documentos pendientes usando un conjunto controlado de asientos.
- Verificación real de creación/búsqueda de asientos, totales, correlativos, respaldo SQLite, reimportación y creación posterior sin colisión de identificadores.
- Verificación real de Storage: bucket privado; acceso del propietario permitido, acceso de otro usuario y anónimo bloqueado. Los objetos de esa prueba se revirtieron.
- Verificación en Chrome: ingreso real, apertura de la empresa migrada y dashboard conectado a PostgreSQL. La consulta automática del tipo de cambio guardó datos correctamente.
- Respaldo solicitado desde Chrome: objeto real de 167.936 bytes guardado en Storage privado, descargado al equipo y comprobado con `integrity_check = ok`.

Las pruebas reales usan una cuenta confirmada existente y transacciones revertidas. Las semillas del escritorio conservan sus identificadores. Los empates de cantidades por origen se ordenan de forma explícita para obtener el mismo orden en ambos motores.

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
