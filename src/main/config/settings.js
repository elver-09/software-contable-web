const {companies}=require('../database/db');const {current}=require('../../../server/context.cjs');
module.exports={getSettings(){return {companies:companies().map(x=>x.publicPath),lastCompanyPath:companies().find(x=>x.id===current().companyId)?.publicPath||null};},saveSettings(){}};
