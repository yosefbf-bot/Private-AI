"use strict";
// Packaging only. Standard NSIS template and upstream binary uninstaller reader.
const fs=require("node:fs/promises"),path=require("node:path");
const {build,Platform,Arch}=require("electron-builder");
if (process.argv.includes("--prepackaged")) {
  require("./check-release-staging.cjs")(path.resolve(__dirname, ".."));
  require("./pe-integrity.cjs").validateTree(path.resolve(__dirname, "../dist/win-unpacked"));
}
if(process.platform === "linux") {
  const {NsisTarget}=require("app-builder-lib/out/targets/nsis/NsisTarget");
  const {UninstallerReader,nsisTemplatesDir}=require("app-builder-lib/out/targets/nsis/nsisUtil");
  NsisTarget.prototype.computeScriptAndSignUninstaller=async function(defines,commands,installerPath,sharedHeader,archs){
    if(this.options.script)throw Error("Unsigned Linux wrapper requires the standard NSIS script.");
    const script=await fs.readFile(path.join(nsisTemplatesDir,"installer.nsi"),"utf8");
    const uninstallerPath=path.join(this.outDir,path.basename(installerPath,"exe")+"__uninstaller.exe");
    defines.BUILD_UNINSTALLER=null;
    defines.UNINSTALLER_OUT_FILE=path.win32.join("Z:",uninstallerPath);
    await this.executeMakensis(defines,commands,sharedHeader+await this.computeFinalScript(script,false,archs));
    await UninstallerReader.exec(installerPath,uninstallerPath);
    const bytes=await fs.readFile(uninstallerPath);
    if(bytes.length<10000||bytes.subarray(0,2).toString()!=="MZ")throw Error("Uninstaller extraction failed");
    delete defines.BUILD_UNINSTALLER;
    defines.UNINSTALLER_OUT_FILE=uninstallerPath;
    console.log("Embedded standard NSIS uninstaller using binary extraction. Windows code was not executed.");
    return {script,isCustomScript:false};
  };
}
build({targets:Platform.WINDOWS.createTarget(["nsis"],Arch.x64),...(process.argv.includes("--prepackaged")?{prepackaged:path.resolve(__dirname,"../dist/win-unpacked")}: {})}).catch(e=>{console.error(e);process.exitCode=1;});
