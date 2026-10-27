// Bind asynchronous clinical reads/actions to the page that initiated them.
export function createPageLifetime(call, notify) {
  let generation=0, container=null;
  const current=target=>container===target && !!target && target.isConnected!==false;
  return {
    start(target){container=target;generation++;return this.scope(target);},
    stop(){generation++;container=null;},
    current,
    scope(target){
      const ticket=generation,active=()=>ticket===generation&&current(target);
      const wait=async work=>{const result=await work;if(!active())throw Error('This view is closed.');return result;};
      return {active,wait,toast:(...args)=>{if(active())notify(...args);},
        api:(...args)=>{if(!active())return Promise.reject(Error('This view is closed.'));return wait(call(...args));}};
    }
  };
}
