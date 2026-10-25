'use strict';
const MAX_SUBSCRIBERS = 32;
const MAX_PENDING_BYTES = 256 * 1024;

class DevelopmentEvents {
  constructor() {
    this.clients = new Map();
    this.timer = setInterval(() => this.write(': keep-alive\n\n'), 15000);
    this.timer.unref();
  }
  add(req, res) {
    const session = req.developmentSession;
    if (!session?.valid()) return res.status(401).json({ ok: false });
    if (this.clients.size >= MAX_SUBSCRIBERS) return res.status(429).json({ ok: false });
    const close = () => {
      this.clients.delete(res);
      unsubscribe();
      res.removeListener('close', close);
      res.destroy(); // Release buffered writes even when the reader is stalled.
    };
    const unsubscribe = session.onInvalidated(close);
    this.clients.set(res, { session, close });
    res.on('close', close);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    this.writeTo(res, ': keep-alive\n\n');
  }
  writeTo(res, data) {
    const client = this.clients.get(res);
    if (!client) return;
    if (!client.session.valid() || res.destroyed || res.writableEnded ||
        res.writableLength + Buffer.byteLength(data) > MAX_PENDING_BYTES) return client.close();
    try {
      res.write(data);
      if (res.writableLength > MAX_PENDING_BYTES) client.close();
    } catch { client.close(); }
  }
  write(data) {
    for (const res of this.clients.keys()) this.writeTo(res, data);
  }
  emit(event) { this.write(`data: ${JSON.stringify(event)}\n\n`); }
  close() {
    clearInterval(this.timer);
    for (const { close } of this.clients.values()) close();
  }
}
module.exports = { DevelopmentEvents, MAX_SUBSCRIBERS, MAX_PENDING_BYTES };
