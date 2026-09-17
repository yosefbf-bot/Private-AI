const api=globalThis.browser||globalThis.chrome;
if(api.sidebarAction){
  // Invoke synchronously in the gesture callback; Firefox requires user input.
  api.action.onClicked.addListener(()=>api.sidebarAction.open());
  api.commands.onCommand.addListener(command=>{if(command==='open-private-ai')api.sidebarAction.open();});
}else if(api.sidePanel){
  api.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
  api.commands.onCommand.addListener(command=>{if(command==='open-private-ai')api.windows.getCurrent().then(w=>api.sidePanel.open({windowId:w.id}));});
}
// No content scripts, tab update listeners, page observers, or automatic captures.
