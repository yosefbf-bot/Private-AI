"use strict";
const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld(
  "privateAI",
  Object.freeze({
    call: (op, data = {}) => ipcRenderer.invoke("privateai:call", { op, data }),
    dropFiles: (files, chatId, temporary) =>
      ipcRenderer.invoke("privateai:drop", {
        paths: files.map((file) => webUtils.getPathForFile(file)),
        chatId,
        temporary,
      }),
    onEvent: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("privateai:event", handler);
      return () => ipcRenderer.removeListener("privateai:event", handler);
    },
  }),
);
