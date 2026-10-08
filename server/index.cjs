const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {storage,current}=require('./context.cjs');const {handlers}=require('./electron.cjs');
const desktop=require('../src/main/main.js');const exchangeStarted=new Map();
const db=require('../src/main/database/db');
require('./voucher-web.cjs').install(handlers);
const root=path.resolve(__dirname,'..');const data=path.resolve(process.env.ANSORITO_DATA_DIR||path.join(root,'data'));
fs.mkdirSync(data,{recursive:true,mode:0o700});
const supabaseUrl=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
if(Boolean(supabaseUrl)!==Boolean(key))throw Error('Configure URL y clave pública de Supabase juntas');
if(supabaseUrl&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl))throw Error('URL Supabase inválida');
if(supabaseUrl&&String(process.env.SIRE_MASTER_KEY||'').length<32)throw Error('Falta SIRE_MASTER_KEY para proteger credenciales SUNAT');
if(!process.env.SIRE_MASTER_KEY){const f=path.join(data,'.sire-master-key');if(!fs.existsSync(f))fs.writeFileSync(f,crypto.randomBytes(32).toString('hex'),{mode:0o600});process.env.SIRE_MASTER_KEY=fs.readFileSync(f,'utf8');}
const sessions=new Map(),downloads=new Map(),loginAttempts=new Map();const id=()=>crypto.randomUUID();
function createCompany(name){const c=current();name=String(name||'').trim();if(!name||name.length>100||/[\/\\\x00-\x1f]/.test(name))throw Error('Nombre de empresa inválido');const list=db.companies(),item={id:id(),name,publicPath:'/empresas/'+id()+'/'+name};list.push(item);fs.writeFileSync(path.join(c.workspace,'companies.json'),JSON.stringify(list));return db.conectarEmpresa(item.id);}
handlers.set('empresa:get-list',()=>db.companies().map(p=>p.publicPath));
handlers.set('empresa:checkLast',()=>({success:true,restored:db.getEstadoEmpresa().connected,...db.getEstadoEmpresa()}));
handlers.set('empresa:seleccionar',()=>createCompany(current().companyName));
handlers.set('empresa:conectar-directa',(_,value)=>db.conectarEmpresa(value));
// Rutas de archivos se sustituyen por referencias opacas ligadas a la sesión y empresa.
for(const channel of ['reportes:guardar-pdf','reportes:guardar-excel','sire:guardar-txt'])handlers.set(channel,(_,p)=>{const d=downloads.get(p?.filePath);const c=current();if(!d||d.workspace!==c.workspace||d.companyId!==c.companyId||d.expires<Date.now())throw Error('Archivo no disponible en esta empresa');return {success:true,savedPath:d.name,filePath:p.filePath,download:p.filePath};});
const {importDatabase,backupDatabase}=require('./databases.cjs');
handlers.set('web:import-database',(_,input)=>importDatabase(input));
handlers.set('web:backup-database',(_,kind)=>backupDatabase(kind));
function serialize(value,c){if(Array.isArray(value))return value.map(x=>serialize(x,c));if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value)){if((k==='filePath'||k==='savedPath')&&typeof v==='string'&&fs.existsSync(v)&&fs.statSync(v).isFile()){const real=fs.realpathSync(v);if(!real.startsWith(fs.realpathSync(c.workspace)+path.sep))throw Error('Archivo fuera del espacio');const token=id();downloads.set(token,{file:real,name:path.basename(v),workspace:c.workspace,companyId:c.companyId,expires:Date.now()+3600000});out[k]=token;out.download=token;}else out[k]=serialize(v,c);}return out;}return typeof value==='bigint'?Number(value):value;}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>30*1024*1024)throw Error('Archivo o solicitud demasiado grande');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function cookie(req){return /(?:^|;\s*)ansorito_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];}
function setCookie(res,token){res.setHeader('Set-Cookie',`ansorito_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${supabaseUrl?'; Secure':''}`);}
async function auth(req){const s=sessions.get(cookie(req));if(!s||s.expires<Date.now())throw Error('Sesión requerida');if(s.local)return s;let r=await fetch(supabaseUrl+'/auth/v1/user',{signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+s.access_token}});if(r.status===401&&s.refresh_token){const refreshed=await fetch(supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});if(refreshed.ok){Object.assign(s,await refreshed.json());r=await fetch(supabaseUrl+'/auth/v1/user',{signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+s.access_token}});}}if(!r.ok)throw Error('Sesión de Supabase vencida');const u=await r.json();if(u.id!==s.userId)throw Error('Sesión inválida');return s;}
function makeServer(){return http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 const url=new URL(req.url,'http://localhost');
 if(!supabaseUrl&&!['localhost','127.0.0.1','[::1]'].includes((req.headers.host||'').split(':')[0]))return json(res,403,{error:'Revisión disponible solo en este equipo'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Origen no permitido'});
 if(url.pathname==='/config')return json(res,200,{mode:supabaseUrl?'supabase':'local',authenticated:!!sessions.get(cookie(req))&&sessions.get(cookie(req)).expires>Date.now()});
 if(url.pathname==='/login'&&req.method==='POST'){
  if(!supabaseUrl)return json(res,400,{error:'El modo local no requiere contraseña'});
  const address=req.socket.remoteAddress;let attempts=loginAttempts.get(address);if(!attempts||attempts.until<Date.now()){attempts={count:0,until:Date.now()+60000};loginAttempts.set(address,attempts);}if(++attempts.count>10)return json(res,429,{error:'Demasiados intentos. Espera un minuto.'});
  const b=await body(req);const r=await fetch(supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:b.email,password:b.password})});const result=await r.json();if(!r.ok)return json(res,401,{error:'No se pudo iniciar sesión'});
  const token=id();sessions.set(token,{...result,userId:result.user.id,expires:Date.now()+8*3600000});setCookie(res,token);return json(res,200,{success:true});
 }
 if(url.pathname==='/logout'&&req.method==='POST'){sessions.delete(cookie(req));setCookie(res,'');return json(res,200,{success:true});}
 if(url.pathname==='/rpc'&&req.method==='POST'){
  const session=await auth(req);const b=await body(req);if(!handlers.has(b.channel))return json(res,404,{error:'Operación desconocida'});
  const workspace=path.join(data,session.userId);fs.mkdirSync(workspace,{recursive:true,mode:0o700});const tempDir=path.join(workspace,'exports',id());fs.mkdirSync(tempDir,{recursive:true});
  const c={workspace,tempDir,companyId:b.companyId||null,companyName:b.companyName,scope:b.scope,requestId:b.requestId};
  if(c.companyId&&!/^[a-f0-9-]{36}$/.test(c.companyId))throw Error('Empresa inválida');
  if(b.upload){if(!['entidades:import-excel','plan-cuentas:import-excel','documentos:import-excel'].includes(b.channel))throw Error('Carga no permitida');const extension=path.extname(b.upload.name||'').toLowerCase();if(!['.xls','.xlsx','.csv'].includes(extension))throw Error('Formato de archivo no admitido');c.uploadPath=path.join(tempDir,'import'+extension);fs.writeFileSync(c.uploadPath,Buffer.from(b.upload.base64,'base64'));}
  return await storage.run(c,async()=>{if(c.companyId)db.getDB();const value=await handlers.get(b.channel)({},...(b.args||[]));const active=db.companies().find(x=>x.id===c.companyId);if(active&&b.channel.startsWith('empresa:')&&process.env.AUTO_EXCHANGE_RATE!=='0'){const day=new Date().toISOString().slice(0,10);if(exchangeStarted.get(workspace)!==day){exchangeStarted.set(workspace,day);const timer=setTimeout(()=>desktop.fetchDailyExchangeRateOnStartup().catch(()=>{}),3000);timer.unref();}}json(res,200,{value:serialize(value,c),companyId:active?.id||null});});
 }
 if(url.pathname.startsWith('/download/')){const s=await auth(req),d=downloads.get(url.pathname.split('/').at(-1));if(!d||d.expires<Date.now()||d.workspace!==path.join(data,s.userId)||d.companyId!==(url.searchParams.get('company')||null))return json(res,404,{error:'Archivo no disponible'});res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,'Cache-Control':'no-store'});return fs.createReadStream(d.file).pipe(res);}
 if(req.method!=='GET')return json(res,405,{error:'Método no permitido'});
 if(url.pathname==='/'&&!supabaseUrl&&(!sessions.get(cookie(req))||sessions.get(cookie(req)).expires<Date.now())){const token=id();sessions.set(token,{local:true,userId:'revision-local',expires:Date.now()+8*3600000});setCookie(res,token);}
 let file=url.pathname==='/bridge.js'?path.join(__dirname,'bridge.js'):path.resolve(root,'src/renderer','.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(url.pathname==='/bridge.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(file,'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'preload-browser.js'),'utf8'));}
 if(!file.startsWith(path.join(root,'src/renderer')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Recurso no disponible'});
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,400,{error:e.message});}});}
module.exports={makeServer,handlers,storage,data,createCompany};
if(require.main===module){const host=process.env.HOST||'127.0.0.1';if(!supabaseUrl&&host!=='127.0.0.1')throw Error('Configura Supabase antes de exponer el servidor');makeServer().listen(Number(process.env.PORT||4180),host,()=>console.log(`Ansorito web: http://${host}:${process.env.PORT||4180} (${supabaseUrl?'Supabase':'revisión local'})`));}
