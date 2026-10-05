export function companionSettings(status, esc) {
  if (!status) return `<section class="section"><h2>Android Companion Gateway</h2><p>Configure phone pairing in the Windows desktop app. The development preview cannot expose a network gateway.</p></section>`;
  const s = status.settings;
  const choices = [...status.interfaces];
  if (!choices.some(x => x.address === s.host)) choices.push({name:'Saved address (currently unavailable)',address:s.host});
  return `<section class="section" id="companion-settings"><h2>Android Companion Gateway</h2>
  <p class="companion-status">${esc(status.state)}${status.locked?' — desktop locked':''}</p>
  ${status.error?`<p class="error-note">${esc(status.error.message)}</p>`:''}
  <p>Connect your phone to this PC's existing AI. The PC must be awake and Private AI running and unlocked, with background work resumed. The phone uses the same local/cloud privacy settings. WhatsApp has its own permissions.</p>
  <label class="check"><input type="checkbox" name="companion-enabled" ${s.enabled?'checked':''}> Enable HTTPS gateway on the selected network interface</label>
  <label class="field">Network address<select name="companion-host">${choices.map(x=>`<option value="${esc(x.address)}" ${x.address===s.host?'selected':''}>${esc(x.name)} — ${esc(x.address)}</option>`).join('')}</select></label>
  <label class="field">Port<input name="companion-port" type="number" min="1024" max="65535" value="${s.port}"></label>
  <button data-act="companion-save">Save gateway settings</button>
  <p>No firewall rule is added automatically. A managed PC may need IT to permit this address and port from your phone. Do not expose this gateway to the public Internet.</p>
  ${status.state==='listening'?`<p>Desktop address: <code>${esc(status.baseUrl)}</code></p><p>Certificate SHA-256: <code style="overflow-wrap:anywhere">${esc(status.certificate?.fingerprint)}</code><br>Expires: ${esc(status.certificate?.expires)}</p><button data-act="companion-pair">Pair a phone</button>`:''}
  <p>Pairing requires the Android app to verify the supplied certificate and address. Choose optional notes/evidence and notification access when pairing. PC chat histories are shared only when explicitly selected. Desktop commands and remote clinical approvals are not included.</p>
  <h3>Paired phones</h3>${status.devices.length?status.devices.map(d=>`<div class="card"><strong>${esc(d.name)}</strong><p>${Object.entries(d.scopes).filter(([,v])=>v).map(([k])=>esc(k)).join(', ')||'Status only'}</p>${d.scopes.chat?`<button data-act="companion-grant" data-id="${esc(d.id)}">Choose shared PC chats</button>`:''}<button class="danger" data-act="companion-revoke" data-id="${esc(d.id)}">Revoke phone</button></div>`).join(''):'<p>No paired phones.</p>'}
  <p>Optional tasks and alerts share status metadata only. View resident details, documents and approvals on the desktop. Missing or incomplete monitoring never means all clear.</p></section>`;
}
