"use strict";
const net = require("node:net"),
  crypto = require("node:crypto");
const {
  Cipher,
  FrameReader,
  encodeFrame,
  fail,
  safeError,
  uuid,
} = require("./security.cjs");
const {boundedWriter}=require('./bounded-writer.cjs');
function derive(cipher, nonce) {
  return new Cipher(
    Buffer.from(
      crypto.hkdfSync(
        "sha256",
        cipher.key,
        Buffer.from(nonce),
        Buffer.from("PrivateAI-pipe-v1"),
        32,
      ),
    ),
  );
}
function startBridge(pipe, cipher, dispatch, onDisconnect = () => {}) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    if (sockets.size >= 12) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const writer=boundedWriter(socket,()=>socket.destroy());let pending=0;
    const context = { temporaryChats: new Set() };
    let authenticated = false,
      session,
      received = 0;
    const nonce = crypto.randomBytes(32).toString("hex");
    socket.setTimeout(15000);
    socket.on("timeout", () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => {
      sockets.delete(socket);
      onDisconnect(context);
    });
    writer.write(encodeFrame({ challenge: nonce }));
    let inbound = 0,
      outbound = 0;
    const send = (message) => {
      if (!authenticated) return;
      const box = session
        .seal({ seq: ++outbound, message }, "server")
        .toString("base64");
      writer.write(encodeFrame({ box }));
    };
    socket.sendEvent = send;
    const reader = new FrameReader(
      async (msg) => {
        try {
          if (!authenticated) {
            const expected = Buffer.from(cipher.mac("bridge:" + nonce));
            const supplied = Buffer.from(String(msg.proof || ""));
            if (
              supplied.length !== expected.length ||
              !crypto.timingSafeEqual(expected, supplied)
            )
              throw fail("POLICY");
            authenticated = true;
            session = derive(cipher, nonce);
            socket.setTimeout(0);
            send({ type: "ready" });
            return;
          }
          const payload = session.open(
            Buffer.from(msg.box, "base64"),
            "client",
          );
          if (payload.seq !== ++inbound) throw fail("POLICY");
          const request = payload.message;
          if (
            !request ||
            typeof request.id !== "string" ||
            typeof request.op !== "string"
          )
            throw fail("INVALID");
          if (++received > 100000) throw fail("LIMIT");
          if(pending>=32)throw fail('LIMIT');pending++;
          try {
            const result = await dispatch(
              request.op,
              request.data || {},
              (event) => send({ type: "event", id: request.id, event }),
              context,
            );
            send({ type: "result", id: request.id, result });
          } catch (e) {
            send({ type: "result", id: request.id, error: safeError(e) });
          }finally{pending--;}
        } catch {
          socket.destroy();
        }
      },
      () => socket.destroy(),
    );
    socket.on("data", (c) => reader.push(c));
  });
  server.listen(pipe);
  return {
    server,
    broadcast: (event) => {
      for (const s of sockets)
        try {
          s.sendEvent?.({ type: "event", event });
        } catch {}
    },
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
function connectBridge(pipe, cipher, onMessage) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipe);
    const writer=boundedWriter(socket,()=>socket.destroy());let disconnected=false;
    const disconnect=()=>{if(!disconnected){disconnected=true;onMessage({type:"disconnected"});}};
    let session,
      inbound = 0,
      outbound = 0,
      ready = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(fail("NETWORK"));
    }, 12000);
    socket.on("error", () => {
      if (!ready) {
        clearTimeout(timer);
        reject(fail("NETWORK"));
      } else disconnect();
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (ready) disconnect();
      else reject(fail("NETWORK"));
    });
    const reader = new FrameReader(
      (msg) => {
        try {
          if (msg.challenge) {
            if (ready || session) throw fail("POLICY");
            session = derive(cipher, msg.challenge);
            writer.write(
              encodeFrame({ proof: cipher.mac("bridge:" + msg.challenge) }),
            );
            return;
          }
          if (!session) throw fail("POLICY");
          const p = session.open(Buffer.from(msg.box, "base64"), "server");
          if (p.seq !== ++inbound) throw fail("POLICY");
          if (p.message.type === "ready") {
            ready = true;
            clearTimeout(timer);
            resolve({
              send: (message) =>
                writer.write(
                  encodeFrame({
                    box: session
                      .seal({ seq: ++outbound, message }, "client")
                      .toString("base64"),
                  }),
                ),
              close: () => socket.destroy(),
            });
          } else onMessage(p.message);
        } catch {
          socket.destroy();
          reject(fail("POLICY"));
        }
      },
      () => socket.destroy(),
    );
    socket.on("data", (c) => reader.push(c));
  });
}
module.exports = { startBridge, connectBridge, derive };
