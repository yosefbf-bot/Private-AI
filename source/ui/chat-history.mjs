export function createChatHistory(container, esc, {pageSize=100}={}) {
  let limit=pageSize, previousQuery='', previousHTML='', previousDOM=null, current;
  const render=(chats,query='',activeId)=>{
    current={chats,query,activeId};query=query.toLowerCase();if(query!==previousQuery){limit=pageSize;previousQuery=query;}
    const matches=chats.filter(c=>!c.archived&&(!query||String(c.title||'').toLowerCase().includes(query)));
    const html=matches.slice(0,limit).map(c=>`<button class="chat-item ${activeId===c.id?'active':''}" data-act="chat" data-id="${esc(c.id)}">${esc(c.title)}</button>`).join('')+(matches.length>limit?'<button data-history-more>Show more chats</button>':'');
    if(html===previousHTML&&container.innerHTML===previousDOM)return;
    previousHTML=html;container.innerHTML=html;previousDOM=container.innerHTML;
    const more=container.querySelector('[data-history-more]');if(more)more.onclick=()=>{limit+=pageSize;render(current.chats,current.query,current.activeId);};
  };
  return render;
}
