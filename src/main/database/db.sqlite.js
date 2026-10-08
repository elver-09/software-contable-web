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
function conectarEmpresa(value){const c=current();const p=companies().find(x=>x.publicPath===value||x.id===value);if(!p)throw Error('Empresa no registrada en este espacio');c.companyId=p.id;getDB();return {success:true,...getEstadoEmpresa()};}
function getDB(){const c=current();const p=selected();if(!p)throw Error('No hay ninguna empresa seleccionada.');const dir=path.join(c.workspace,'companies',p.id);fs.mkdirSync(dir,{recursive:true});return connection(path.join(dir,'contable.db'),EMPRESA_MIGRATIONS);}
function getGlobalDB(){return connection(path.join(current().workspace,'global_contable.db'),GLOBAL_MIGRATIONS);}
function getMigrationInfo(){return {empresa:selected()?getMigrationState(getDB(),EMPRESA_MIGRATIONS):null,global:getMigrationState(getGlobalDB(),GLOBAL_MIGRATIONS)};}
module.exports={getDB,getGlobalDB,getEstadoEmpresa,conectarEmpresa,getMigrationInfo,companies};
