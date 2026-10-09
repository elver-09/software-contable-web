# Ansorito web con Supabase

La instancia configurada utiliza PostgreSQL de Supabase para la contabilidad, Supabase Auth para el ingreso y el bucket privado `ansorito-files` para los archivos. Se conservan la interfaz, los 15 controladores y las 73 operaciones del escritorio, más dos operaciones para guardar y consultar el período de trabajo. El programa original permanece en `/Volumes/Elver-DSC/ELVER/Software-Contable/`.

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/renderer/` | Pantallas, estilos y lógica de interfaz original. |
| `src/main/controllers/`, `src/main/domain/`, `src/main/services/` | Reglas contables, reportes e integración SUNAT del escritorio. |
| `src/main/repositories/` | Consultas SQL por módulo, filtros y acceso a datos. |
| `server/` | Servidor HTTP, sesiones, adaptación del navegador y descargas autorizadas. |
| `server/postgres/` | Conexión privada, consultas compatibles, procesos contables, respaldos y Storage. |
| `supabase/migrations/` | Cambios versionados de tablas, permisos y archivos privados. |
| `tools/` | Generación del esquema, aplicación de migraciones, importación y comprobaciones. |
| `src/main/database/db.sqlite.js`, `server/sqlite.cjs` | Referencia del motor anterior y formato de intercambio del escritorio. |
| `data/` | Copias locales anteriores y archivos de trabajo; PostgreSQL es el motor activo. |

El esquema `ansorito` contiene las 17 tablas contables, el registro de empresas y tablas auxiliares de solicitudes e importaciones. En el panel de Supabase, seleccionar ese esquema para verlas. Cada usuario posee sus empresas y su catálogo global; los permisos de PostgreSQL separan usuarios y empresas. La capa contable usa el rol `authenticated`, con el usuario previamente verificado por Supabase Auth.

Los controladores y servicios delegan las consultas a los repositorios y conservan las validaciones, cálculos y transacciones contables. Las tablas PostgreSQL se definen en `supabase/migrations/`; los esquemas JavaScript de SQLite se conservan para respaldos, importación y revisión local. La tabla local de reintentos se inicializa en `server/legacy/schema.cjs`, fuera del guardado de vouchers. Las pruebas de arquitectura impiden volver a introducir SQL en controladores, servicios y registros de rutas.

## Iniciar

Requiere Node 24 y pnpm. En esta carpeta:

```sh
pnpm install --frozen-lockfile
pnpm start
```

Abrir http://127.0.0.1:4181/. `pnpm start` carga `.env` cuando existe. El modo sin `.env` es exclusivamente revisión local con SQLite; no usarlo para trabajar con la contabilidad de Supabase.

`.env` es privado y está excluido de Git. Incluye URL y clave pública de Supabase, `DATABASE_URL`, `PG_CA_FILE`, `ANSORITO_DB_ENGINE=postgres` y `SIRE_MASTER_KEY`. Nunca colocar la conexión PostgreSQL o la clave maestra SUNAT en el navegador. La conexión remota verifica el certificado oficial incluido. La contraseña debe codificarse como parte de una URL si contiene caracteres especiales.

## Migraciones y datos existentes

Las cuatro migraciones ya se aplicaron al proyecto `mjpqbyenuexvjksnskml`. Se importaron el catálogo global y la empresa existente de la versión web anterior, conservando el identificador y comprobando los conteos de cada tabla. Las bases locales anteriores se conservan.

```sh
pnpm db:migrate
pnpm db:import-local
```

Las migraciones se aplican una sola vez con comprobación de contenido y una transacción. La importación registra una huella por fuente, rechaza destinos ocupados y revierte los cambios si falla. Volver a importar una fuente ya registrada no duplica datos. Detener las versiones anteriores durante un traslado para evitar escrituras posteriores en SQLite.

El botón **Respaldos** descarga empresa o catálogo global en formato SQLite compatible con el escritorio, generado desde PostgreSQL. Importar una copia crea una empresa nueva y no reemplaza las existentes. El catálogo global debe importarse antes de crear empresas o cargar catálogos. El límite de importación es 20 MB. Cerrar el escritorio o crear una copia consistente antes de trasladar un archivo que use WAL.

La clave maestra de cifrado se conserva aparte de los respaldos. Las credenciales SUNAT protegidas por el almacén del sistema operativo del escritorio pueden requerir reingreso; no se extraen automáticamente.

## Ingreso y corrección de comprobantes

El Asistente reúne los datos del comprobante, los importes habituales y las opciones especiales desplegables. Genera las líneas y su clasificación tributaria juntas. Si el borrador ya tiene líneas manuales, completa el comprobante sin cambiarlas. El voucher muestra el estado del detalle; las correcciones de asientos guardados se hacen en Editar Registros. Los importes especiales calculan su total y se validan antes del guardado.

## Archivos y concurrencia

PDF, Excel, TXT, ZIP y respaldos generados se guardan en Storage privado y se descargan mediante referencias ligadas al usuario y la empresa. Los archivos SIRE tienen copia remota y se recuperan para las operaciones de listado/comparación. El disco local conserva archivos de trabajo; no se considera una copia única de la contabilidad. Las referencias de descarga y las sesiones son temporales y se pierden al reiniciar.

Las solicitudes contables se procesan fuera del servidor HTTP. Las escrituras usan transacciones y bloqueos por espacio contable. Los reintentos con el mismo identificador no duplican vouchers, y las ediciones comprueban la versión anterior. Se mantienen las reglas monetarias originales y el margen de cuadre de un céntimo.

## Comprobación

```sh
pnpm test
pnpm test:original
pnpm test:postgres
```

Las comprobaciones reales necesitan `ANSORITO_VERIFY_USER_ID`, correspondiente a una cuenta confirmada existente:

```sh
pnpm test:runtime
pnpm test:storage
```

Estas pruebas generan datos temporales y los revierten. La comparación real produjo resultados idénticos a SQLite para las nueve familias de reportes, cartera, dashboard y documentos pendientes con los casos de prueba. También verificó creación de asientos y exportación/reimportación de respaldos. Consultar `VALIDACION.md` para el alcance y los pendientes.

## Acceso por Internet

El servidor actual solo está disponible en este equipo. Publicarlo requiere alojar Node detrás de HTTPS y configurar las variables privadas. Supabase almacena datos y archivos, pero no aloja este servidor Node. Las sesiones y referencias están en memoria: se requiere afinidad de sesiones para más de una instancia o sustituir ese almacenamiento. Todavía no se configuraron copias automáticas, recuperación operativa ni el alojamiento público. Mantener el escritorio hasta validar casos reales y SIRE con credenciales autorizadas.

En Editar Registros, el detalle tributario se presenta como resumen. Las operaciones simples en PEN con base, IGV (4011) y contrapartida identificables (42 en compras, 12 en ventas) sincronizan sus importes al editar las líneas, conservando la clasificación original. Las distribuciones mixtas, monedas extranjeras o cambios de cuentas/documento requieren revisión manual en «Datos especiales y clasificación tributaria». Activar la edición manual mantiene la marca de revisión; las referencias y detracciones se conservan. El guardado sigue exigiendo cuadre y consistencia tributaria.

El Balance de Comprobación traslada ambos lados de los saldos patrimoniales (elementos 1 a 5) a sus columnas de Cuentas, incluyendo la cuenta 40 cuando tiene saldo deudor. Pantalla, PDF y Excel comparten el mismo cálculo. La clasificación de gastos/ingresos y la configuración del Estado de Situación Financiera siguen sus reglas propias.

## Período de trabajo

Debajo de Dashboard, «Período de trabajo» permite seleccionar mes y ejercicio por empresa. Se guarda en `config_empresa.periodo_contable` de PostgreSQL y permanece al volver a ingresar; no requiere tablas nuevas. Una barra superior muestra siempre el período activo. Voucher abre directamente en ese mes, con fecha inicial de hoy si corresponde al mes actual o del primer día del mes elegido. Editar Registros y los reportes toman el período como filtro inicial; los reportes permiten otras fechas y ofrecen «Mes de trabajo» para regresar a la selección. Dashboard usa el período guardado para sus indicadores mensuales y gráficos, manteniendo la fecha de hoy para vencimientos y actividad reciente.

El cambio se bloquea mientras haya líneas de un voucher sin guardar o cambios pendientes en Editar Registros. Al regresar a la edición se conserva el borrador. Los perfiles anteriores que solo guardaban un año siguen siendo compatibles. Editar los datos de empresa sin enviar período conserva la selección existente.

El período de trabajo permite años anteriores y el año actual. En el año actual, el selector ofrece solo hasta el mes actual; en años anteriores, los doce meses. El servidor también rechaza meses y ejercicios futuros. Un período futuro guardado previamente se interpreta como el mes actual al cargar el sistema.

### Amarres de asientos automáticos

En **Contabilidad → Amarres de destino** se configuran por empresa las cuentas o prefijos de origen, las cuentas de destino al Debe y Haber, el porcentaje (hasta dos decimales), los orígenes aplicables y el estado activo. Las reglas se almacenan en Supabase, sin cuentas de destino fijas en el motor. No se crean reglas predeterminadas: cada empresa debe configurar sus cuentas.

El motor agrega pares balanceados al guardar vouchers manuales, del asistente o importados de SIRE. El prefijo más específico tiene prioridad; dentro de ese prefijo las reglas para un origen concreto prevalecen sobre «Todos». Varias reglas del mismo prefijo/origen permiten distribuir hasta el 100 %. El importe se toma del neto Debe menos Haber de cada línea original; los reversos invierten el destino, y se conservan moneda, tipo de cambio y documento. Las líneas generadas no disparan otras reglas.

«Destinos del asiento» aparece como sección desplegable cuando hay líneas y un amarre aplicable; su vista previa se actualiza automáticamente antes de guardar. En Editar Registros se identifican y recalculan desde sus líneas originales; no se editan por separado. El comprobante tributario se concilia con las líneas originales, mientras que los totales contables incluyen los destinos. Cabecera, líneas, destinos y datos tributarios se guardan en la misma transacción.

Los vouchers guardados conservan una copia de su regla. Editar, desactivar o eliminar una configuración no cambia asientos anteriores. Un voucher antiguo sin destinos no recibe reglas nuevas al editarse. Si cambia la cuenta original a otra fuera del prefijo histórico, su destino anterior deja de generarse. Las reglas nuevas se usan en nuevos vouchers.

La migración `202610080005_asientos_automaticos.sql` crea `ansorito.asientos_automaticos` y `ansorito.asientos_automaticos_lineas`, con aislamiento de usuario y empresa. Los respaldos web incluyen reglas y trazabilidad de líneas; SQLite local dispone de tablas equivalentes para revisión y pruebas. «Cuenta contrapartida» en Plantillas de compras y ventas distingue la cuenta por pagar/cobrar de estos destinos.
