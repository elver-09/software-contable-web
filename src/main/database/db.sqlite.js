// Adaptación web: cada solicitud tiene empresa y espacio propios.
const fs=require('node:fs');const path=require('node:path');
const Database=require('../../../server/sqlite.cjs');
const {current}=require('../../../server/context.cjs');
const {runMigrations,getMigrationState}=require('./migrationRunner');
const {EMPRESA_MIGRATIONS}=require('./migrations/empresa');
const {GLOBAL_MIGRATIONS}=require('./migrations/global');
const {ensureWebSchema}=require("../../../server/legacy/schema.cjs");
const connections=new Map();
function connection(file,migrations){if(!connections.has(file)){const db=new Database(file);try{db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');runMigrations(db,migrations,{logger:{log(){},warn(){},error(){}}});if(migrations===EMPRESA_MIGRATIONS)ensureWebSchema(db);connections.set(file,db);}catch(e){db.close();throw e;}}return connections.get(file);}
function companies(){const c=current();const file=path.join(c.workspace,'companies.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
function selected(){const c=current();return companies().find(x=>x.id===c.companyId)||null;}
function getEstadoEmpresa(){const p=selected();return {connected:!!p,folderPath:p?.publicPath||null,folderName:p?.name||null,dbPath:null};}
function conectarEmpresa(value){const c=current();const p=companies().find(x=>x.publicPath===value||x.id===value||(x.previousPaths||[]).includes(value)||String(value).startsWith('/empresas/'+x.id+'/'));if(!p)throw Error('Empresa no registrada en este espacio');c.companyId=p.id;getDB();return {success:true,...getEstadoEmpresa()};}
function getDB(){const c=current();const p=selected();if(!p)throw Error('No hay ninguna empresa seleccionada.');const dir=path.join(c.workspace,'companies',p.id);fs.mkdirSync(dir,{recursive:true});return connection(path.join(dir,'contable.db'),EMPRESA_MIGRATIONS);}
function getGlobalDB(){return connection(path.join(current().workspace,'global_contable.db'),GLOBAL_MIGRATIONS);}
function getMigrationInfo(){return {empresa:selected()?getMigrationState(getDB(),EMPRESA_MIGRATIONS):null,global:getMigrationState(getGlobalDB(),GLOBAL_MIGRATIONS)};}
function renombrarEmpresa(nombre) {
 const c=current(), file=path.join(c.workspace,'companies.json');
 const anteriores=fs.readFileSync(file,'utf8'), list=JSON.parse(anteriores);
 const empresa=list.find(p=>p.id===c.companyId);
 if(!empresa) throw Error('Empresa no encontrada.');
 empresa.previousPaths=[...new Set([...(empresa.previousPaths||[]),empresa.publicPath])];
 empresa.name=nombre;empresa.publicPath='/empresas/'+empresa.id+'/'+nombre;
 const temporal=file+'.rename-'+require('node:crypto').randomUUID();
 try {fs.writeFileSync(temporal,JSON.stringify(list,null,2));fs.renameSync(temporal,file);}
 finally {if(fs.existsSync(temporal))fs.unlinkSync(temporal);}
 return ()=>{fs.writeFileSync(temporal,anteriores);fs.renameSync(temporal,file);};
}
module.exports={renombrarEmpresa,getDB,getGlobalDB,getEstadoEmpresa,conectarEmpresa,getMigrationInfo,companies};
