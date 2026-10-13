'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {databaseEngine,validateServerConfig} = require('./runtime-config.cjs');
const root = path.join(__dirname,'..');
const config = {SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/test',SIRE_MASTER_KEY:'test-key-with-more-than-32-characters'};
function environment(extra={}) {
  const env={...process.env};
  for(const key of ['ANSORITO_DB_ENGINE','ANSORITO_SQLITE_MODE','DATABASE_URL','PG_CA_FILE','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SIRE_MASTER_KEY','NODE_ENV']) delete env[key];
  return {...env,...extra};
}
test('PostgreSQL es el motor normal y no admite SQLite implícito',()=>{
  assert.equal(databaseEngine({}),'postgres');
  assert.equal(validateServerConfig(config),'postgres');
  assert.throws(()=>databaseEngine({ANSORITO_DB_ENGINE:'sqlite'}),/inicio normal requiere PostgreSQL/);
  assert.throws(()=>databaseEngine({ANSORITO_DB_ENGINE:'sqlite',ANSORITO_SQLITE_MODE:'demo',NODE_ENV:'production'}),/producción/);
});
test('Falta de configuración o Auth incompleto detiene el inicio',()=>{
  for(const name of Object.keys(config)) {const env={...config};delete env[name];assert.throws(()=>validateServerConfig(env),new RegExp(name));}
  assert.throws(()=>validateServerConfig({...config,DATABASE_URL:'not-a-url-with-a-private-secret'}),/conexión PostgreSQL/);
  assert.throws(()=>validateServerConfig({...config,SUPABASE_URL:'http://test.invalid'}),/URL Supabase/);
});
test('Arranque rechazado no crea bases ni directorios de trabajo',()=>{
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ansorito-startup-'));
  const dir=path.join(parent,'must-not-exist');
  for(const extra of [{},{ANSORITO_DB_ENGINE:'sqlite'}, {...config,SUPABASE_URL:''}]) {
    const r=spawnSync(process.execPath,['server/index.cjs'],{cwd:root,env:environment({...extra,ANSORITO_DATA_DIR:dir}),encoding:'utf8',timeout:5000});
    assert.equal(r.status,1);assert.equal(fs.existsSync(dir),false);
  }
  fs.rmSync(parent,{recursive:true});
});
test('PostgreSQL inaccesible termina antes de escuchar y no crea una base SQLite',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ansorito-unreachable-'));
  const r=spawnSync(process.execPath,['server/index.cjs'],{cwd:root,env:environment({...config,ANSORITO_DATA_DIR:dir,PORT:'0'}),encoding:'utf8',timeout:10000});
  assert.equal(r.status,1,r.stderr);assert.match(r.stderr,/no cambiará a SQLite/);assert.doesNotMatch(r.stdout,/Ansorito web:/);assert.deepEqual(fs.readdirSync(dir),[]);
  fs.rmSync(dir,{recursive:true});
});
test('SQLite exige demo o test; la demo rechaza conexión o autenticación remota',()=>{
  const demo={ANSORITO_DB_ENGINE:'sqlite',ANSORITO_SQLITE_MODE:'demo',HOST:'127.0.0.1'};
  assert.equal(validateServerConfig(demo),'sqlite');
  assert.throws(()=>validateServerConfig({...demo,...config}),/no debe usar credenciales/);
  assert.throws(()=>validateServerConfig({...demo,HOST:'0.0.0.0'}),/127.0.0.1/);
  assert.equal(validateServerConfig({ANSORITO_DB_ENGINE:'sqlite',ANSORITO_SQLITE_MODE:'test'}),'sqlite');
});
test('Comando demo separa datos, puerto y elimina secretos heredados',()=>{
  const script=`const assert=require('node:assert/strict');const path=require('node:path');
  const file=require.resolve('./server/index.cjs');require.cache[file]={exports:{start:async()=>{assert.equal(process.env.ANSORITO_DB_ENGINE,'sqlite');assert.equal(process.env.ANSORITO_SQLITE_MODE,'demo');assert.equal(process.env.ANSORITO_DATA_DIR,path.join(process.cwd(),'data/demo'));assert.equal(process.env.PORT,'4182');assert.equal(process.env.HOST,'127.0.0.1');for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SIRE_MASTER_KEY','PG_CA_FILE'])assert.equal(process.env[key],undefined);}}};require('./server/demo.cjs');`;
  const r=spawnSync(process.execPath,['-e',script],{cwd:root,env:environment({...config,PORT:'4181',ANSORITO_DATA_DIR:'/private-real-accounting',PG_CA_FILE:'private-file'}),encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
});
