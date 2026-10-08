const {DatabaseSync}=require('node:sqlite');
module.exports=class Database {
 constructor(file){this.db=new DatabaseSync(file);this.open=true;this.depth=0;}
 prepare(sql){const q=this.db.prepare(sql); return {get:(...a)=>q.get(...a),all:(...a)=>q.all(...a),run:(...a)=>{const r=q.run(...a);return {changes:Number(r.changes),lastInsertRowid:Number(r.lastInsertRowid)};}};}
 exec(sql){return this.db.exec(sql);}
 pragma(sql,options){const rows=this.db.prepare('PRAGMA '+sql).all();return options?.simple?Object.values(rows[0]||{})[0]:rows;}
 transaction(fn){const call=(...args)=>{const nested=this.depth>0;const name='tx'+this.depth++;this.exec(nested?`SAVEPOINT ${name}`:'BEGIN IMMEDIATE');try{const r=fn(...args);if(r?.then)throw Error('Transacción asíncrona no permitida');this.exec(nested?`RELEASE ${name}`:'COMMIT');return r;}catch(e){this.exec(nested?`ROLLBACK TO ${name}`:'ROLLBACK');if(nested)this.exec(`RELEASE ${name}`);throw e;}finally{this.depth--;}};call.immediate=call;call.deferred=call;call.exclusive=call;return call;}
 close(){this.db.close();this.open=false;}
};
