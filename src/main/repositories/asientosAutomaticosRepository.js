function listar(db) { return db.prepare('SELECT * FROM asientos_automaticos ORDER BY prefijo,nombre,id').all(); }
function guardar(db,r) {
 const p=[r.nombre,r.prefijo,r.origen,r.cuenta_debe,r.cuenta_haber,r.porcentaje,r.activo];
 if(r.id) return db.prepare('UPDATE asientos_automaticos SET nombre=?,prefijo=?,origen=?,cuenta_debe=?,cuenta_haber=?,porcentaje=?,activo=? WHERE id=?').run(...p,r.id);
 return db.prepare('INSERT INTO asientos_automaticos(nombre,prefijo,origen,cuenta_debe,cuenta_haber,porcentaje,activo) VALUES(?,?,?,?,?,?,?)').run(...p);
}
function eliminar(db,id) { return db.prepare('DELETE FROM asientos_automaticos WHERE id=?').run(id); }
function metadata(db,id) { return db.prepare('SELECT * FROM asientos_automaticos_lineas WHERE voucher_id=? ORDER BY detalle_id').all(id); }
function marcar(db,detalleId,voucherId,fuenteId,regla,lado) { db.prepare('INSERT INTO asientos_automaticos_lineas(detalle_id,voucher_id,fuente_id,regla_json,lado) VALUES(?,?,?,?,?)').run(detalleId,voucherId,fuenteId,JSON.stringify(regla),lado); }
function borrarGeneradas(db,id) {
 const filas=metadata(db,id);
 db.prepare('DELETE FROM asientos_automaticos_lineas WHERE voucher_id=?').run(id);
 const stmt=db.prepare('DELETE FROM voucher_detalles WHERE voucher_id=? AND id=?');
 for(const f of filas) stmt.run(id,f.detalle_id);
}
module.exports={listar,guardar,eliminar,metadata,marcar,borrarGeneradas};
