# Pruebas automatizadas

La suite usa `node:test`, incluido en Node.js, por lo que no requiere Jest/Mocha.

Desde la raíz del proyecto:

```bash
node src/tests/run-tests.js
```

También puede ejecutarse desde `src/` con `node --test`.

En el entorno real se utiliza `better-sqlite3`. Para CI o desarrollo con Node 22+,
los tests de migración pueden usar `node:sqlite` como fallback.

Cobertura inicial:

- runner de migraciones: orden, idempotencia, rollback y bloqueo de versiones futuras;
- migración de bases de empresa nuevas y legacy (`vouchers.numero`, `periodo`, recuperación);
- migraciones de catálogo global y monedas;
- cuadre de vouchers y validación de montos editables;
- clasificación tributaria, notas de crédito y persistencia RVIE;
- restricciones de hosts/rutas SUNAT;
- precedencia Local > Global de catálogos.

Regla para futuras correcciones: cada bug de datos que se corrija debe agregar primero
un test que reproduzca el fallo y luego la implementación que lo soluciona.
