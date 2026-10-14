import {qrcodegen} from './vendor/qrcodegen.mjs';

// Secrets exist only in this modal's DOM and short-lived memory. No clipboard,
// storage, remote generator, downloadable image or secret-bearing diagnostics.
export function drawPairingQR(canvas, payload) {
  if (typeof payload !== 'string' || payload.length > 1024 || !payload.startsWith('privateai://pair/v2?')) throw Error('Unsupported pairing invitation.');
  const qr = qrcodegen.QrCode.encodeText(payload,qrcodegen.QrCode.Ecc.MEDIUM), scale = 5, border = 4;
  canvas.width = canvas.height = (qr.size + border * 2) * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle = '#000';
  for (let y=0;y<qr.size;y++) for (let x=0;x<qr.size;x++) if(qr.getModule(x,y)) context.fillRect((x+border)*scale,(y+border)*scale,scale,scale);
  return qr.size;
}

export function createCompanionPairingUI({api,form,esc,document:doc=globalThis.document,now=()=>performance.now(),setTimer=setInterval,clearTimer=clearInterval}) {
  let current = null, generation = 0;
  const clearSecret = row => {
    row.payload = null;
    const canvas = row.canvas;
    if(canvas) { canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); canvas.hidden=true; }
    if(row.link) {row.link.value='';row.link.textContent='';}
    if(row.details) row.details.hidden=true;
  };
  function stop() {
    generation++;
    const row=current; current=null;
    if(!row)return;
    clearTimer(row.timer); clearSecret(row);
    // Cancels pending invitations only. It never revokes an established phone.
    if(row.id) api('companionInviteCancel',{id:row.id}).catch(()=>{});
  }
  async function open(grants) {
    stop(); const epoch=generation, row={busy:false}; current=row;
    try {
      const invite=await api('companionInvite',grants);
      if(current!==row || epoch!==generation) { await api('companionInviteCancel',{id:invite.id}).catch(()=>{}); return; }
      row.id=invite.id; row.payload=invite.pairingUrl;
      row.deadline=now()+Math.max(0,Math.min(180000,invite.expires-Date.now()));
      row.receiptDeadline=row.deadline+420000;
      const modal=form('Pair your phone',`<p><strong>3. Scan QR → 4. Confirm connection</strong></p><p>On your phone, open Settings → Desktop pairing → Scan desktop QR. Both devices must reach this PC on the selected private network or VPN. Keep this invitation private.</p><canvas id="pairing-qr" aria-label="Private phone pairing QR" style="display:block;max-width:100%;height:auto;margin:1rem auto;image-rendering:pixelated"></canvas><p id="pairing-progress" role="status">Waiting for your phone…</p><p id="pairing-countdown"></p><details id="pairing-manual"><summary>Camera unavailable? Paste this invitation on your phone</summary><label class="field">Private invitation<textarea id="pairing-link" readonly rows="4" autocomplete="off" spellcheck="false">${esc(row.payload)}</textarea></label><button type="button" id="pairing-copy" class="secondary">Copy secure pairing link</button><p>The clipboard contains a secret. Paste only into your phone’s pairing settings and never into a website or message.</p></details><button type="button" id="pairing-regenerate" class="secondary">Regenerate invitation</button><p>Expires in three minutes and can be used once. Closing this window cancels unused invitations. No firewall, hotspot or VPN is configured automatically.</p>`,'Close');
      row.canvas=doc.getElementById('pairing-qr'); row.link=doc.getElementById('pairing-link');row.details=doc.getElementById('pairing-manual');
      drawPairingQR(row.canvas,row.payload); row.payload=null;
      const copy=doc.getElementById('pairing-copy'),regenerate=doc.getElementById('pairing-regenerate');
      if(copy)copy.onclick=async()=>{if(current===row && epoch===generation && row.link.value && !row.details.hidden) {copy.disabled=true;try{await api('copy',{text:row.link.value});}catch{const p=doc.getElementById('pairing-progress');if(current===row&&p)p.textContent='Copy failed. Select the invitation text and copy it manually.';}finally{copy.disabled=false;}}};
      if(regenerate)regenerate.onclick=()=>{if(current===row && epoch===generation && !row.issued) {row.regenerate=true;doc.getElementById('modal-cancel')?.click();}};

      const progress=doc.getElementById('pairing-progress'),countdown=doc.getElementById('pairing-countdown');
      const terminal=(message)=>{ clearTimer(row.timer); clearSecret(row);progress.textContent=message;countdown.textContent=''; };
      const tick=async()=>{
        if(current!==row || epoch!==generation || row.busy)return;
        const remaining=Math.ceil((row.deadline-now())/1000);
        if(remaining<=0)clearSecret(row);
        countdown.textContent=remaining>0?`Invitation expires in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}.`:'';
        row.busy=true;
        try {
          const status=await api('companionInviteStatus',{id:row.id});
          if(current!==row || epoch!==generation)return;
          if(status.state==='paired') {row.issued=true;if(regenerate)regenerate.disabled=true;terminal('Connected — your phone verified this PC and completed an authenticated status check.');}
          else if(status.state!=='pending')terminal('Invitation is no longer available. Close and create a new invitation.');
          else if(status.awaitingConnection) {
            row.issued=true;if(regenerate)regenerate.disabled=true;clearSecret(row);countdown.textContent='';
            if(now()>=row.receiptDeadline) {terminal('Device created, but connection could not be confirmed. Inspect Paired phones and revoke the incomplete device before trying again.');await api('companionInviteCancel',{id:row.id}).catch(()=>{});}
            else progress.textContent='Device created. Waiting for the phone’s authenticated connection. If the phone reports failure, close this window and revoke the incomplete device before creating another invitation.';
          } else if(remaining<=0) {
            terminal('Invitation expired. If a device was created without confirmation, inspect Paired phones and revoke it before trying again. Close and create a new invitation.');await api('companionInviteCancel',{id:row.id}).catch(()=>{});
          }
        } catch {
          if(current===row && epoch===generation)terminal('Pairing status could not be verified. Close and check the gateway and paired phones before trying again.');
        } finally {row.busy=false;}
      };
      row.timer=setTimer(tick,1000); await tick(); await modal;
      if(row.regenerate && current===row && epoch===generation) {stop();return await open(grants);}
    } finally {
      if(current===row)stop();
      // The modal is closed before this promise resolves. Remove any remaining
      // detached secret text without disturbing another newly opened modal.
      if(row.link){row.link.value='';row.link.textContent='';}
    }
  }
  return {open,stop};
}
