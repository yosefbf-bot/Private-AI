"use strict";
const path = require("node:path");
const { flipFuses, FuseVersion, FuseV1Options: F } = require("@electron/fuses");
module.exports = async (context) => {
  const payload = require('./packaged-payload.cjs').validate(context.appOutDir);
  console.log('Packaged runtime and OCR fallbacks verified: '+JSON.stringify(payload));
  await flipFuses(path.join(context.appOutDir, "PrivateAI.exe"), {
    version: FuseVersion.V1,
    [F.RunAsNode]: false,
    [F.EnableNodeOptionsEnvironmentVariable]: false,
    [F.EnableNodeCliInspectArguments]: false,
    [F.OnlyLoadAppFromAsar]: true,
  });
};
