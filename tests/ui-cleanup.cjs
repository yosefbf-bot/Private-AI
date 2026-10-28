'use strict';
async function closeUI({browser,server}){
 try{await browser?.close();}
 finally{server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
}
module.exports={closeUI};
