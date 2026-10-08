# Ansorito web con Supabase

La instancia configurada utiliza PostgreSQL de Supabase para la contabilidad, Supabase Auth para el ingreso y el bucket privado `ansorito-files` para los archivos. Se conservan la interfaz, los 15 controladores y las 73 operaciones del escritorio. El programa original permanece en `/Volumes/Elver-DSC/ELVER/Software-Contable/`.

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/renderer/` | Pantallas, estilos y lógica de interfaz original. |
| `src/main/controllers/`, `src/main/domain/`, `src/main/services/` | Reglas contables, reportes e integración SUNAT del escritorio. |
| `server/` | Servidor HTTP, sesiones, adaptación del navegador y descargas autorizadas. |
| `server/postgres/` | Conexión privada, consultas compatibles, procesos contables, respaldos y Storage. |
| `supabase/migrations/` | Cambios versionados de tablas, permisos y archivos privados. |
| `tools/` | Generación del esquema, aplicación de migraciones, importación y comprobaciones. |
| `src/main/database/db.sqlite.js`, `server/sqlite.cjs` | Referencia del motor anterior y formato de intercambio del escritorio. |
| `data/` | Copias locales anteriores y archivos de trabajo; PostgreSQL es el motor activo. |

El esquema `ansorito` contiene las 17 tablas contables, el registro de empresas y tablas auxiliares de solicitudes e importaciones. En el panel de Supabase, seleccionar ese esquema para verlas. Cada usuario posee sus empresas y su catálogo global; los permisos de PostgreSQL separan usuarios y empresas. La capa contable usa el rol `authenticated`, con el usuario previamente verificado por Supabase Auth.

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
