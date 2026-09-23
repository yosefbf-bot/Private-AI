'use strict';
// Developer-only Linux cross-build. Users receive the complete CPU runtime.
// Requires MinGW-w64 POSIX GCC 13+, CMake, Ninja, host g++, tar and objdump.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const url='https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/b10809';
const expected='097848e79245e784c3bd4fcf2d6e1b46ad24553f3840e65a678131825504a8d2';
const prefix=process.env.PRIVATEAI_MINGW_PREFIX||'/usr';
const root=path.join(__dirname,'runtime-work'),src=path.join(root,'llama.cpp-b10809'),built=path.join(root,'out'),dest=path.join(__dirname,'local-runtime');
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit'});
(async()=>{
 if(fs.existsSync(root))throw Error('Use a new build/runtime-work directory for reproducibility.');fs.mkdirSync(root);
 const r=await fetch(url);if(!r.ok)throw Error('Runtime source download failed');const b=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(b).digest('hex')!==expected)throw Error('Runtime source checksum mismatch');
 const tar=path.join(root,'source.tar.gz');fs.writeFileSync(tar,b);run('tar',['-xzf',tar,'-C',root]);
 // Older MinGW headers do not expose this optional Windows power hint. Normal
 // Windows thread priority and the app's balanced scheduling still apply.
 const cpu=path.join(src,'ggml/src/ggml-cpu/ggml-cpu.c');let s=fs.readFileSync(cpu,'utf8');const old='#if _WIN32_WINNT >= 0x0602\n        THREAD_POWER_THROTTLING_STATE';if(!s.includes(old))throw Error('Power hint patch no longer matches');fs.writeFileSync(cpu,s.replace(old,'#if _WIN32_WINNT >= 0x0602 && defined(THREAD_POWER_THROTTLING_CURRENT_VERSION)\n        THREAD_POWER_THROTTLING_STATE'));
 // Runtime selects AVX2 when supported; x64 fallback needs no AVX instructions.
 const cm=path.join(src,'ggml/src/CMakeLists.txt');s=fs.readFileSync(cm,'utf8');const a=s.indexOf('        ggml_add_cpu_backend_variant(x64)'),end=s.indexOf('    elseif (GGML_SYSTEM_ARCH',a);if(a<0||end<a)throw Error('CPU patch no longer matches');fs.writeFileSync(cm,s.slice(0,a)+'        ggml_add_cpu_backend_variant(x64)\n        ggml_add_cpu_backend_variant(haswell SSE42 AVX F16C FMA AVX2 BMI2)\n'+s.slice(end));
 const gcc=path.join(prefix,'bin/x86_64-w64-mingw32-gcc-posix'),gxx=path.join(prefix,'bin/x86_64-w64-mingw32-g++-posix');
 const gomp=execFileSync(gcc,['-print-file-name=libgomp.a'],{encoding:'utf8'}).trim();if(!path.isAbsolute(gomp))throw Error('Static OpenMP library required');
 const tc=path.join(root,'mingw.cmake');fs.writeFileSync(tc,`set(CMAKE_SYSTEM_NAME Windows)\nset(CMAKE_SYSTEM_PROCESSOR x86_64)\nset(CMAKE_C_COMPILER "${gcc}")\nset(CMAKE_CXX_COMPILER "${gxx}")\nset(CMAKE_RC_COMPILER "${prefix}/bin/x86_64-w64-mingw32-windres")\nset(CMAKE_FIND_ROOT_PATH "${prefix}/x86_64-w64-mingw32")\nset(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)\nset(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)\nset(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)\nset(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)\n`);
 const staticFlags='-static -static-libgcc -static-libstdc++';
 run('cmake',['-S',src,'-B',built,'-G','Ninja','-DCMAKE_TOOLCHAIN_FILE='+tc,'-DCMAKE_BUILD_TYPE=Release','-DGGML_NATIVE=OFF','-DBUILD_SHARED_LIBS=ON','-DGGML_BACKEND_DL=ON','-DGGML_CPU_ALL_VARIANTS=ON','-DGGML_OPENMP=ON','-DLLAMA_BUILD_TESTS=OFF','-DLLAMA_BUILD_EXAMPLES=OFF','-DLLAMA_BUILD_UI=OFF','-DLLAMA_OPENSSL=OFF','-DCMAKE_EXE_LINKER_FLAGS='+staticFlags,'-DCMAKE_SHARED_LINKER_FLAGS='+staticFlags+' -Wl,--exclude-libs,ALL','-DCMAKE_MODULE_LINKER_FLAGS='+staticFlags+' -Wl,--exclude-libs,ALL','-DOpenMP_gomp_LIBRARY='+gomp]);
 run('cmake',['--build',built,'--target','llama-server','-j',process.env.PRIVATEAI_BUILD_JOBS||'4']);
 fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest);
 for(const name of fs.readdirSync(path.join(built,'bin')).filter(n=>/\.(dll|exe)$/.test(n))){const target=path.join(dest,name);fs.copyFileSync(path.join(built,'bin',name),target);run(path.join(prefix,'bin/x86_64-w64-mingw32-strip'),['--strip-unneeded',target]);}
 fs.copyFileSync(path.join(src,'LICENSE'),path.join(dest,'LICENSE-llama.cpp'));
 for(const name of ['RUNTIME_NOTICES.txt','RUNTIME_BUILD.md'])fs.copyFileSync(path.join(__dirname,'../docs',name),path.join(dest,name));
 console.log('Prepared MinGW CPU runtime b10809 without external compiler-runtime DLLs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
