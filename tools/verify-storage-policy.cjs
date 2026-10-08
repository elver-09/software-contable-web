const {Client}=require('pg');const {connectionConfig}=require('../server/postgres/connection.cjs');const assert=require('node:assert/strict');const crypto=require('node:crypto');
async function main(){const owner=process.env.ANSORITO_VERIFY_USER_ID;if(!owner)throw Error('Define ANSORITO_VERIFY_USER_ID');const client=new Client(connectionConfig());await client.connect();try{
 await client.query('BEGIN');const company=crypto.randomUUID(),name=owner+'/'+company+'/exports/check.txt';await client.query('INSERT INTO ansorito.empresas(id,owner_id,nombre) VALUES($1,$2,$3)',[company,owner,'Verificación Storage — rollback']);
 const bucket=await client.query("SELECT public FROM storage.buckets WHERE id='ansorito-files'");assert.equal(bucket.rows[0].public,false);
 await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[owner,JSON.stringify({sub:owner,role:'authenticated'})]);
 await client.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['ansorito-files',name]);assert.equal((await client.query('SELECT name FROM storage.objects WHERE name=$1',[name])).rows.length,1);
 await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[crypto.randomUUID(),JSON.stringify({sub:crypto.randomUUID(),role:'authenticated'})]);assert.equal((await client.query('SELECT name FROM storage.objects WHERE name=$1',[name])).rows.length,0);
 await client.query('SAVEPOINT blocked_insert');await assert.rejects(client.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['ansorito-files',name+'-blocked']),{code:'42501'});await client.query('ROLLBACK TO SAVEPOINT blocked_insert');
 await client.query('SET LOCAL ROLE anon');assert.equal((await client.query('SELECT name FROM storage.objects WHERE name=$1',[name])).rows.length,0);
 console.log('PASS: bucket privado; propietario permitido, otro usuario y anónimo bloqueados. Objetos temporales revertidos.');
 }finally{await client.query('ROLLBACK');await client.end();}}
main().catch(e=>{console.error('Storage no validado:',e.code||e.message);process.exitCode=1;});
