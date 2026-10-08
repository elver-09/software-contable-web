const {AsyncLocalStorage}=require('node:async_hooks');
const storage=new AsyncLocalStorage();
module.exports={storage,current(){const c=storage.getStore();if(!c)throw Error('Operación sin sesión de trabajo');return c;}};
