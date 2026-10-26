// Coalesce event bursts, never poll while hidden, and retain a pending update
// while a user is editing. A visibility/focus change drains it promptly.
export function createVisibleRefresh({visible,blocked,run,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let pending=false,running=false,timer=null;
  const drain=async()=>{
    timer=null;
    if(!pending||running||!visible()||blocked())return;
    pending=false;running=true;
    try{if(await run()===false)pending=true;}finally{running=false;if(pending)schedule();}
  };
  const schedule=()=>{if(timer===null&&pending&&!running&&visible()&&!blocked())timer=setTimer(drain,150);};
  return {request(){pending=true;schedule();},resume(){if(!visible()&&timer!==null){clearTimer(timer);timer=null;}schedule();},clear(){pending=false;if(timer!==null)clearTimer(timer);timer=null;}};
}
