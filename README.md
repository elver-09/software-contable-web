# Ansorito: base web con los módulos del escritorio

Esta versión reutiliza la interfaz original y registra sus 73 operaciones. Es una base ejecutable para validar la conversión completa, todavía no una certificación de igualdad funcional ni una publicación en producción. El piloto anterior de ocho tablas es otro proyecto y no debe sustituir esta versión.

## Qué se conserva

Pantallas, temas, formularios, asistente, validaciones, cuentas, documentos, entidades, amarres, monedas/tipos de cambio, vouchers de todos los orígenes, edición, dashboard, cartera, reportes, notas de estados financieros, configuración y servicios SIRE. Se reutilizan las once migraciones por empresa y las cuatro del catálogo global. El TXT sigue siendo diagnóstico interno, con la misma advertencia del escritorio.

Las reglas monetarias originales, incluido el margen de un céntimo para cuadre, se mantienen. No se reemplazaron por las reglas del piloto. Los 15 controladores originales están incluidos; las modificaciones de infraestructura están en PROVENIENCIA.json.

## Arquitectura elegida

Navegador → servidor Node 24 → controladores originales → SQLite por empresa.

Supabase Auth valida el acceso. Cada usuario tiene un espacio independiente; sus empresas comparten su catálogo global y no el de otros usuarios. Esta entrega no incorpora invitaciones, contadores compartidos o roles de equipo. Estos son requisitos adicionales de un sistema multiusuario y deben definirse antes de ofrecerlo a terceros.

La contabilidad se almacena en el disco persistente del servidor. **Todavía no se almacena en PostgreSQL de Supabase.** Supabase por sí solo no aloja este servidor Node ni sus archivos SQLite. La conversión total a PostgreSQL requiere una fase posterior con comparación de consultas, migraciones y resultados. Esta elección conserva el motor y los controladores actuales durante la transición.

El servidor necesita almacenamiento persistente y un solo proceso en esta etapa; no debe desplegarse como una función efímera. Las sesiones de acceso y referencias de descarga se pierden al reiniciar, pero la contabilidad permanece en disco. El usuario vuelve a iniciar sesión.

## Revisión local

Requiere Node 24 y pnpm. Desde esta carpeta:

```sh
pnpm install --frozen-lockfile
pnpm start
```

Abrir http://127.0.0.1:4180/. Sin configuración de Supabase, solo admite acceso desde este equipo. Los datos creados son de revisión local en `data/revision-local/`. No son datos de una cuenta de Supabase y no se trasladan automáticamente al configurar una cuenta.

```sh
pnpm test
pnpm run test:original
```

## Configurar Supabase

1. Abrir Project Settings → API Keys del proyecto `mjpqbyenuexvjksnskml`.
2. Copiar la Publishable key que empieza por `sb_publishable_`. También admite la antigua clave `anon`. No usar `service_role` ni una clave `sb_secret_`.
3. Copiar `.env.example` a `.env`, completar la clave pública y generar una `SIRE_MASTER_KEY` aleatoria, de al menos 32 caracteres, exclusivamente para el servidor.
4. Iniciar con `pnpm start:configured`. Para acceso remoto, alojar detrás de HTTPS y usar un disco persistente. Las cookies de Supabase son Secure y HttpOnly.
5. Ingresar con una cuenta existente de Supabase Auth, con correo confirmado cuando el proyecto lo requiera. Las credenciales del Dashboard de Supabase no constituyen automáticamente una cuenta de usuario de la aplicación.

Fuentes oficiales: [claves API](https://supabase.com/docs/guides/getting-started/api-keys), [acceso con contraseña](https://supabase.com/docs/guides/auth/passwords) y [verificación del usuario](https://supabase.com/docs/reference/javascript/auth-getuser).

No se crean tablas contables remotas ni se aplica la migración del piloto en esta arquitectura. No hace falta una clave secreta de Supabase. No se ha validado todavía el acceso contra el proyecto real.

## Transferir la contabilidad del escritorio

Usar el botón **Respaldos**. Importar una copia de la base SQLite crea una empresa nueva y aplica las migraciones originales. No reemplaza empresas existentes. Se verifica formato e integridad, y se admiten copias hasta 20 MB en esta primera implementación.

Importar `global_contable.db` antes de crear empresas o cargar catálogos en el nuevo espacio. Si ya existe un catálogo global, la importación se rechaza para evitar sobrescribirlo. Las monedas/tipos de cambio también pertenecen al catálogo global, como en el escritorio.

Antes de copiar una base del escritorio, cerrar el programa para que el archivo refleje todos los cambios. Seleccionar `<nombre_empresa>_contable.db`. Una copia aislada con cambios pendientes en archivos WAL necesita un respaldo consistente, no únicamente copiar el `.db` abierto.

Descargar respaldos genera una copia SQLite consistente incluso cuando el servidor utiliza WAL. El respaldo de empresa y el catálogo global se descargan por separado. Conservar también, por un medio privado, la clave maestra de cifrado del servidor: no está incluida en esos archivos.

Las credenciales SUNAT protegidas por el almacén del sistema operativo del escritorio pueden requerir reingreso en la web. No se intenta extraerlas ni descifrarlas en otro equipo. Si las credenciales previas usan una clave maestra propia, esa clave debe gestionarse por separado.

## Cambios para el navegador

- Las carpetas locales se convierten en empresas registradas y aisladas en el servidor; la pestaña recuerda su empresa activa.
- Excel se carga desde el navegador. PDF, Excel, TXT, ZIP y respaldos se descargan mediante referencias temporales autorizadas, nunca por una ruta arbitraria del equipo.
- Cada solicitud conserva su empresa y su espacio, incluidos los servicios que esperan respuestas de SUNAT.
- Los reintentos de guardar un nuevo voucher con el mismo identificador no duplican el asiento.
- La edición detecta si otra sesión cambió el voucher mientras se editaba.
- La consulta diaria de tipo de cambio original se inicia al conectar una empresa; los servicios BCRP/SUNAT y sus reglas de fechas se conservan.

## Validación pendiente antes del reemplazo

Consultar VALIDACION.md. Hace falta comparar una copia real de tus datos, validar compras/ventas tributarias con casos de tu operación, revisar cada salida PDF/Excel, completar pruebas del asistente en todos los orígenes y probar SIRE con tus credenciales autorizadas. También falta el alojamiento, las copias automáticas, la recuperación ante fallos y el acceso remoto real.

No reemplazar todavía el escritorio. La fuente original permanece intacta y es la referencia para la aceptación.

## Paquete para alojamiento

Se incluye un Dockerfile para un servidor Node con un volumen persistente en `/app/data`. Configurar URL/clave pública de Supabase y la clave maestra SIRE como variables privadas del servidor; conservar la misma clave maestra al reiniciar. El contenedor necesita HTTPS mediante el alojamiento o un proxy. No se construyó ni publicó una imagen Docker en este entorno; su despliegue queda pendiente de prueba.

La instancia configurada en este equipo usa el puerto 4181. La revisión con datos ficticios usa 4180. Ninguna de esas direcciones es pública.
