# Auditoría de Ansorito Web — 12 de octubre de 2026

## Alcance y resultado

Se revisó el proyecto de `/Volumes/Elver-DSC/ELVER/Ansorito-Web-Completo`, su configuración privada sin divulgar valores, el servidor HTTP, selección de motor, creación de empresas, migraciones, repositorios, autenticación, archivos, respaldos, módulos contables y pruebas. Se consultó Supabase mediante una transacción de solo lectura. No se alteraron tablas, datos, configuración ni reglas contables. Las pruebas se ejecutaron con bases temporales y PostgreSQL embebido; no se usaron credenciales reales de SUNAT.

La configuración actual selecciona PostgreSQL. La contabilidad operativa reside en Supabase. SQLite permanece como motor de revisión local y como formato de importación/exportación de respaldos. El servidor y la generación de archivos todavía requieren un entorno Node con disco de trabajo; Supabase no sustituye ese servidor.

El servidor local en el puerto 4181 no respondió durante la revisión. Esto no impidió comprobar directamente la base remota; no permite afirmar qué motor usaba un proceso anteriormente iniciado con otras variables.

## Evidencia comprobada

- `.env` contiene el selector `ANSORITO_DB_ENGINE=postgres`, configuración de Auth, conexión PostgreSQL y clave maestra SIRE. Permisos del archivo: 600. No está versionado.
- La conexión PostgreSQL real respondió. Se verificaron las cinco migraciones: esquema contable, reintentos web, archivos privados, historial de importaciones y amarres automáticos.
- El esquema `ansorito` tiene 23 tablas, contando las auxiliares y el historial de migraciones. Las 22 tablas de aplicación tienen RLS activado y forzado; `schema_migrations` se protege mediante permisos administrativos en vez de políticas por usuario.
- Se observaron 2 empresas, 4 vouchers y 12 líneas en las tablas remotas al momento de consultar. Estos conteos describen ese momento, no certifican cada asiento.
- El bucket `ansorito-files` existe y es privado. Se revisó la política de acceso por usuario y empresa; no se efectuó una descarga real del bucket ni una prueba remota de recuperación en este análisis.
- Hay bases SQLite antiguas en `data/`, un respaldo generado y bases de revisión. Su presencia no cambia el motor seleccionado ni significa sincronización permanente entre ambas bases.
- Pruebas: 71 del servidor/esquema PostgreSQL y 50 de las reglas originales, todas aprobadas. No equivalen a pruebas de carga, despliegue público o certificación tributaria.

## Cómo se crea y usa la base

### Estructura PostgreSQL

`supabase/migrations/*.sql` define las tablas, índices, restricciones y permisos. `tools/apply-postgres-schema.cjs` las aplica con una transacción, bloqueo y checksum por migración. El comando es `pnpm db:migrate`.

No se crea una base PostgreSQL nueva con cada empresa ni con cada inicio. Se usa la base del proyecto de Supabase y el esquema `ansorito`. El inicio normal tampoco aplica automáticamente migraciones: cada cambio de estructura exige ejecutar el proceso de migración correspondiente. Las migraciones aplicadas no deben reescribirse; las modificaciones posteriores deben ser nuevas migraciones.

### Nueva empresa

`server/index.cjs` deriva la operación a `server/postgres/database.cjs` cuando el motor es PostgreSQL. `createCompany` inserta la empresa y sus datos iniciales dentro de una transacción. Cada registro contable se distingue por `owner_id` y `scope_id`.

Por ejemplo, dos empresas comparten la tabla `vouchers`, pero sus filas pertenecen a ámbitos separados. Los identificadores locales de asiento pueden repetirse entre empresas porque la clave incluye el ámbito. Las políticas de PostgreSQL limitan la lectura y escritura al usuario y empresa autorizados.

La ruta visible `/empresas/<id>/<nombre>` es una referencia lógica en el modo PostgreSQL. No representa una nueva base ni un directorio que contenga toda la contabilidad.

### Cuando aparece SQLite

`src/main/database/db.js` toma el motor de la variable de entorno y, si falta, usa SQLite. `pnpm start` permite que `.env` no exista; por eso puede arrancar en revisión local. Si se omite solo el selector y se conservan URL y clave de Supabase, incluso puede existir autenticación Supabase con contabilidad SQLite.

SQLite crea `companies.json`, `global_contable.db` y un `companies/<id>/contable.db`. Esta ruta está separada de PostgreSQL. No hay respaldo automático de las escrituras locales en las tablas remotas. Un fallo de conexión con PostgreSQL tampoco provoca un cambio automático a SQLite: el problema concreto es una configuración ausente o distinta al iniciar.

En el modo PostgreSQL, pedir un respaldo crea un archivo SQLite temporal a partir de los datos remotos. Eso es un formato de copia compatible con el escritorio, no un regreso del motor contable a SQLite.

## Distribución de responsabilidades

| Elemento | Ubicación actual |
| --- | --- |
| Empresas, plan de cuentas, documentos, entidades, monedas y configuración | PostgreSQL de Supabase |
| Asientos, líneas, datos tributarios y amarres | PostgreSQL de Supabase |
| Configuración, operaciones y registros SIRE | PostgreSQL de Supabase |
| Usuarios y validación de ingreso | Supabase Auth |
| Contraseñas/tokens de sesión | Tokens mantenidos en memoria del servidor; contraseña de acceso enviada a Auth |
| Credenciales SUNAT | Datos cifrados; clave maestra privada del servidor |
| Reportes y respaldos generados | Se generan en disco del servidor y se publican en Storage privado |
| Archivos SIRE | Disco de trabajo y copia en Storage; recuperación para listado/comparación |
| Sesiones y referencias de descarga | Memoria del proceso Node |
| Tema de la interfaz | Almacenamiento del navegador |
| Empresa seleccionada | Almacenamiento de sesión del navegador |
| Bases SQLite anteriores | Disco local; no son la contabilidad operativa seleccionada |

## Evaluación funcional y estructural

- **Voucher y edición:** las validaciones y transacciones siguen en el servidor. Hay protección contra reintentos duplicados y edición sobre versiones antiguas. Los destinos se calculan en el servidor y conservan la regla histórica.
- **Datos tributarios:** las líneas contables y clasificación se guardan juntas; existe validación de coherencia. La clasificación especial requiere revisión cuando no puede deducirse de una operación simple.
- **Catálogos:** existe separación entre catálogo global del usuario y catálogo de empresa, con consultas en repositorios.
- **Cartera:** hay consulta, filtros, clasificación de vencimientos y exportación Excel/PDF de todos los resultados filtrados. La prueba de 58 documentos supera la página de 50 y verifica importes numéricos y aislamiento de descargas.
- **Reportes:** nueve familias conservan sus cálculos y exportaciones. Quedan las observaciones sobre presentación de estados financieros: importes sin decimales/símbolos y encabezados completos.
- **SIRE:** hay servicios separados para Auth, API, archivos y tickets, cifrado de credenciales y registros persistidos. El usuario confirmó previamente consulta de períodos y descargas; este análisis no volvió a ejecutar operaciones externas SUNAT.
- **Organización:** renderer, controladores, dominio, servicios, repositorios, servidor y migraciones están separados. Permanece una capa que adapta contratos del escritorio al navegador y traduce consultas SQLite a PostgreSQL. Es una migración funcional, con trabajo de modernización pendiente.
- **Despliegue:** existe Dockerfile con Node 24, usuario no privilegiado y motor PostgreSQL. No se comprobó construcción del contenedor ni un alojamiento público activo.

## Hallazgos y prioridades

### 1. Alta: impedir usar SQLite accidentalmente

Evidencia: `db.js` usa SQLite por defecto; `package.json` usa `--env-file-if-exists` en `start`; el selector del motor es independiente de la configuración de Auth.

Propuesta: arranque normal exclusivamente PostgreSQL, con validación conjunta de variables y rechazo claro si falta configuración. Reservar SQLite para un comando explícito de demostración/pruebas. Conservarlo para leer y generar copias del escritorio. Mostrar el motor activo de forma inequívoca.

### 2. Alta antes de publicación: completar operación del servidor

El servidor está configurado para 127.0.0.1. Docker permite desplegarlo, pero faltan comprobación de alojamiento, dominio/HTTPS, supervisor del proceso, monitorización y procedimiento de actualización/migración. Las sesiones y descargas se pierden al reiniciar; más de una instancia necesita un almacén compartido o una estrategia documentada de afinidad.

### 3. Alta para datos reales: respaldos y recuperación operativa

Existe exportación/importación manual de empresa y catálogo. No se encontró programación propia de copias ni un procedimiento probado que recupere conjuntamente PostgreSQL, Storage y la clave maestra SUNAT. Las capacidades de respaldo del plan contratado en Supabase no se comprobaron. Definir frecuencia, retención, ubicación separada y ensayo de restauración; custodiar la clave maestra fuera del repositorio.

### 4. Media: controlar archivos temporales y publicaciones

Cada RPC crea un directorio de exportación, incluso si no genera un archivo. Sesiones, referencias expiradas, archivos locales y objetos exportados no tienen un proceso de limpieza en el código revisado. El vencimiento de una descarga solo bloquea acceso; no elimina el archivo.

SIRE recorre archivos locales para publicarlos tras las operaciones de la empresa. La caché de hashes está en memoria; al reiniciar puede volver a subir archivos existentes. Además, una subida fallida puede devolver error después de que una operación de base haya concluido. Propuesta: catálogo de archivos, política de retención, publicación/reintentos por tarea y limpieza controlada. Mantener la caché local necesaria para operar, sin considerarla el almacén definitivo.

### 5. Media: rendimiento con volumen real

La cartera obtiene y clasifica el conjunto antes de filtrar y paginar en JavaScript. El adaptador contable usa llamadas síncronas sobre workers y traduce SQL; hay tres workers de rutas. El diseño preserva el escritorio, pero no se ha probado con muchos usuarios y años de movimientos.

Propuesta: medir primero; trasladar filtros/paginación a consultas PostgreSQL, revisar índices y planes de ejecución, definir límites y pruebas de concurrencia. No hay evidencia actual de lentitud con volumen real; es un límite por validar.

### 6. Media según uso: permisos de personal y auditoría

El aislamiento actual es de propietario y empresa. No se encontró un modelo de miembros con roles de administrador/contador/consulta ni historial general de quién cambió cada dato. Los logs SIRE y snapshots de amarres no sustituyen ese historial.

Si trabajará personal distinto del propietario, agregar miembros y permisos explícitos; si seguirá usándolo una sola persona, puede programarse después del cierre funcional.

### 7. Media: terminar observaciones y ordenar deuda técnica

Completar formato y encabezados de estados financieros en pantalla/PDF/Excel. Unificar generación de reportes para evitar diferencias. Separar gradualmente módulos grandes de reportes y voucher y sustituir contratos del escritorio donde aporte claridad, sin reescribir las reglas ya verificadas.

Actualizar documentación: README todavía menciona cuatro migraciones aplicadas en una sección; se comprobaron cinco. El esquema está en SQL, aunque los repositorios sigan escribiendo consultas SQL desde JavaScript, lo cual es normal. El DDL SQLite en JavaScript sigue siendo necesario para compatibilidad de copias y pruebas mientras se conserve ese formato.

## Orden recomendado

1. Arranque PostgreSQL obligatorio y demo SQLite explícita.
2. Completar presentación de estados financieros.
3. Política de archivos, respaldos y ensayo de recuperación.
4. Desplegar servidor con HTTPS y verificar sesión/Storage/SIRE en ese entorno.
5. Probar volumen y concurrencia; agregar roles y auditoría si habrá más personal.

No hace falta eliminar la base de Supabase ni crear otra para estos cambios. Tampoco conviene borrar las copias locales antiguas hasta definir retención y verificar que no contienen datos pendientes.
