import { escapeHTML, escapeAttr } from '../utils/security.js';
let reglas = [];
export async function initAutomaticos() {
 const root=document.getElementById('automaticos-root');
 root.innerHTML=`<style>
 .auto-card{background:var(--card,#fff);border:1px solid var(--brd,#d9e0e6);border-radius:12px;padding:24px;margin:18px 0;color:var(--tx,#263746)}
 .auto-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.auto-grid label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}
 .auto-grid input,.auto-grid select{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--brd,#ccd5df);border-radius:6px;background:var(--bg,#fff);color:inherit}
 .auto-table{width:100%;border-collapse:collapse;font-size:13px}.auto-table th,.auto-table td{text-align:left;padding:12px;border-bottom:1px solid var(--brd,#d9e0e6)}
 .auto-help{margin:0 0 20px;font-size:13px}.auto-help summary{cursor:pointer;color:var(--accent,#3c617b);width:fit-content}.auto-help[open] .auto-note{max-width:850px;padding:8px 0}
 .auto-note{color:var(--tx2,#5b6c7a);font-size:13px;line-height:1.6}.auto-actions{display:flex;gap:12px;margin-top:22px;align-items:center}.auto-status{margin-top:16px;font-size:13px}
 @media(max-width:850px){.auto-grid{grid-template-columns:1fr}.auto-card{padding:16px}}
 </style><div class="auto-card"><h2>Amarres de destino</h2>
 <p class="auto-note">Configure las cuentas de destino de compras y gastos.</p>
 <details class="auto-help"><summary>Cómo funcionan los amarres</summary>
 <div class="auto-note">
 <p>Al guardar un voucher, cada amarre agrega líneas al Debe y Haber según el importe de la cuenta de origen y el porcentaje configurado.</p>
 <p>Se utiliza el prefijo más específico. Puede distribuir el importe entre varios amarres, hasta un 100 %. Las líneas generadas no activan otros amarres.</p>
 <p>Las plantillas de compras y ventas arman el asiento inicial desde el asistente; los amarres agregan su destino al guardar.</p>
 <p>Los cambios de configuración se aplican a nuevos registros. Los vouchers guardados conservan su amarre original y recalculan el destino al editar sus importes. Los reversos invierten el Debe y Haber.</p>
 </div></details>
 <div style="overflow-x:auto"><table class="auto-table"><thead><tr><th>Nombre</th><th>Origen / prefijo</th><th>Aplicación</th><th>Cuenta Debe</th><th>Cuenta Haber</th><th>%</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="auto-lista"></tbody></table></div>
 <div class="auto-actions"><button type="button" class="btn-primary" id="auto-nuevo">Nuevo amarre</button></div>
 </div><div class="auto-card"><h3 id="auto-titulo">Nuevo amarre</h3><form id="auto-form">
 <input type="hidden" id="auto-id"><datalist id="auto-cuentas"></datalist><div class="auto-grid">
 <label>Nombre del amarre<input id="auto-nombre" maxlength="120" required placeholder="Destino de compras o gastos"></label>
 <label>Cuenta o prefijo de origen<input id="auto-prefijo" maxlength="8" inputmode="numeric" required placeholder="Cuenta completa o inicio de la cuenta"></label>
 <label>Aplicar en<select id="auto-origen"><option value="*">Todos los orígenes</option><option value="8">Compras</option><option value="5">Diario</option><option value="14">Ventas</option><option value="1">Caja y bancos</option><option value="31">Planillas</option><option value="50">Provisiones</option><option value="90">Otros</option></select></label>
 <label>Cuenta que se genera al Debe<input id="auto-debe" list="auto-cuentas" maxlength="8" required><small id="auto-debe-nombre"></small></label>
 <label>Cuenta que se genera al Haber<input id="auto-haber" list="auto-cuentas" maxlength="8" required><small id="auto-haber-nombre"></small></label>
 <label>Porcentaje del importe<input id="auto-porcentaje" type="number" min="0.01" max="100" step="0.01" value="100" required></label>
 </div><div class="auto-actions"><label><input id="auto-activo" type="checkbox" checked> Amarre activo</label><button type="submit" class="btn-primary" id="auto-guardar">Guardar amarre</button><button type="button" class="btn-secondary" id="auto-cancelar">Limpiar</button></div>
 <div class="auto-status" id="auto-status" role="status"></div></form>
 </div>`;
 const estado=await window.api.getEmpresaEstado();
 if(!estado?.connected){root.innerHTML='<div class="auto-card">Seleccione una empresa para configurar sus amarres de destino.</div>';return;}
 const plan=await window.api.getPlanCuentas();
 root.querySelector('#auto-cuentas').innerHTML=plan.map(c=>`<option value="${escapeAttr(c.codigo)}">${escapeHTML(c.descripcion)}</option>`).join('');
 for(const lado of ['debe','haber'])root.querySelector('#auto-'+lado).addEventListener('input',()=>{root.querySelector('#auto-'+lado+'-nombre').textContent=plan.find(c=>c.codigo===root.querySelector('#auto-'+lado).value)?.descripcion||'Seleccione una cuenta existente';});
 const status=(texto,error=false)=>{const e=root.querySelector('#auto-status');e.textContent=texto;e.style.color=error?'#a0444f':'#2f745c';};
 const limpiar=()=>{root.querySelector('#auto-form').reset();root.querySelector('#auto-id').value='';root.querySelector('#auto-titulo').textContent='Nuevo amarre';for(const lado of ['debe','haber'])root.querySelector('#auto-'+lado+'-nombre').textContent='';};
 const cargar=async()=>{const res=await window.api.getAutomaticos();if(!res.success){status(res.error,true);return;}reglas=res.reglas;
 root.querySelector('#auto-lista').innerHTML=reglas.length?reglas.map(r=>`<tr><td>${escapeHTML(r.nombre)}</td><td>${escapeHTML(r.prefijo)}</td><td>${r.origen==='*'?'Todos':r.origen==='8'?'Compras':({'1':'Caja y bancos','5':'Diario','8':'Compras','14':'Ventas','31':'Planillas','50':'Provisiones','90':'Otros'}[r.origen]||r.origen)}</td><td>${escapeHTML(r.cuenta_debe)}</td><td>${escapeHTML(r.cuenta_haber)}</td><td>${Number(r.porcentaje).toFixed(2)}</td><td>${r.activo?'Activo':'Inactivo'}</td><td><button type="button" class="btn-secondary" data-auto-edit="${r.id}">Editar</button> <button type="button" class="btn-secondary" data-auto-delete="${r.id}">Eliminar</button></td></tr>`).join(''):'<tr><td colspan="8">No hay amarres configurados. Cree uno con las cuentas del plan contable de su empresa.</td></tr>';
 };
 root.querySelector('#auto-nuevo').onclick=()=>{limpiar();root.querySelector('#auto-nombre').focus();};root.querySelector('#auto-cancelar').onclick=limpiar;
 root.querySelector('#auto-lista').onclick=async e=>{const edit=e.target.closest('[data-auto-edit]'),del=e.target.closest('[data-auto-delete]');
 if(edit){const r=reglas.find(r=>r.id===Number(edit.dataset.autoEdit));for(const [campo,key] of [['id','id'],['nombre','nombre'],['prefijo','prefijo'],['origen','origen'],['debe','cuenta_debe'],['haber','cuenta_haber'],['porcentaje','porcentaje']])root.querySelector('#auto-'+campo).value=r[key];root.querySelector('#auto-activo').checked=!!r.activo;root.querySelector('#auto-titulo').textContent='Editar amarre';for(const lado of ['debe','haber'])root.querySelector('#auto-'+lado).dispatchEvent(new Event('input'));root.querySelector('#auto-nombre').focus();}
 if(del){const res=await window.api.eliminarAutomatico(Number(del.dataset.autoDelete));if(!res.success)status(res.error,true);else{limpiar();await cargar();status('Amarre eliminado. Los vouchers guardados conservan su configuración original.');}}
 };
 root.querySelector('#auto-form').onsubmit=async e=>{e.preventDefault();const boton=root.querySelector('#auto-guardar');boton.disabled=true;try{const valor=id=>root.querySelector('#auto-'+id).value;
 const res=await window.api.guardarAutomatico({id:valor('id')||undefined,nombre:valor('nombre'),prefijo:valor('prefijo'),origen:valor('origen'),cuenta_debe:valor('debe'),cuenta_haber:valor('haber'),porcentaje:valor('porcentaje'),activo:root.querySelector('#auto-activo').checked?1:0});
 if(!res.success){status(res.error,true);return;}limpiar();await cargar();status('Amarre guardado para esta empresa.');}catch(e){status(e.message,true);}finally{boton.disabled=false;}};
 await cargar();
}
