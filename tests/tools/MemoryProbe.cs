// Test-only Windows counters/constraints for an explicitly owned synthetic child.
// No memory contents, command lines, credentials, screenshots or files are read.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.IO;
public sealed class MemoryProbe : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Status {public uint Length,Load;public ulong TotalPhys,AvailPhys,CommitLimit,CommitAvailable,TotalVirtual,AvailVirtual,Extended;}
 [StructLayout(LayoutKind.Sequential)] struct Counters {public uint Size,Faults;public UIntPtr PeakWS,WS,PeakPaged,Paged,PeakNonpaged,Nonpaged,Pagefile,PeakPagefile,Private;}
 [StructLayout(LayoutKind.Sequential)] struct Region {public IntPtr Base,AllocationBase;public uint AllocationProtect;public UIntPtr Size;public uint State,Protect,Type;}
 [StructLayout(LayoutKind.Sequential)] struct WS {public IntPtr Address;public UIntPtr Flags;}
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWS,MaxWS;public uint Active;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong Read,Write,Other,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct Limits {public Basic Basic;public IO IO;public UIntPtr Process,Job,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {public uint Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,XChars,YChars,Fill,Flags;public ushort Show,ReservedSize;public IntPtr ReservedPtr,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)] struct Created {public IntPtr Process,Thread;public uint Pid,Tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string file,StringBuilder command,IntPtr security,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Created created);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr process,uint milliseconds);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll")] static extern bool SetPriorityClass(IntPtr process,uint priority);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GlobalMemoryStatusEx(ref Status status);
 [DllImport("psapi.dll",SetLastError=true)] static extern bool GetProcessMemoryInfo(IntPtr p,ref Counters c,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern UIntPtr VirtualQueryEx(IntPtr p,IntPtr address,out Region r,UIntPtr size);
 [DllImport("psapi.dll",SetLastError=true)] static extern bool QueryWorkingSetEx(IntPtr p,[In,Out] WS[] info,int bytes);
 [DllImport("psapi.dll",CharSet=CharSet.Unicode)] static extern uint GetMappedFileName(IntPtr p,IntPtr address,StringBuilder name,int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetProcessWorkingSetSizeEx(IntPtr p,UIntPtr min,UIntPtr max,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetProcessInformation(IntPtr p,int kind,ref uint info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAlloc(IntPtr address,UIntPtr size,uint type,uint protection);
 [DllImport("kernel32.dll")] static extern bool VirtualFree(IntPtr address,UIntPtr size,uint type);
 IntPtr process,job;readonly List<IntPtr> buffers=new List<IntPtr>();Timer guard;
 readonly object sync=new object();public bool PressureReleased {get;private set;} public long AllocatedBytes {get;private set;}
 public MemoryProbe(){if(IntPtr.Size!=8)throw new InvalidOperationException("x64 required");guard=new Timer(CheckPressure,null,100,100);}
 public static Dictionary<string,object> SystemMemory(){Status s=new Status();s.Length=(uint)Marshal.SizeOf(typeof(Status));if(!GlobalMemoryStatusEx(ref s))throw new InvalidOperationException();return new Dictionary<string,object>{{"availableBytes",s.AvailPhys},{"totalBytes",s.TotalPhys},{"commitLimitBytes",s.CommitLimit},{"commitAvailableBytes",s.CommitAvailable}};}
 static string Quote(string value){StringBuilder b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"')b.Append('\\',slashes*2+1);else b.Append('\\',slashes);slashes=0;b.Append(c);}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 public Dictionary<string,object> Launch(string file,string[] args,string token,string condition,long bytes,bool priority){
  if(process!=IntPtr.Zero||!File.Exists(file)||!String.Equals(Path.GetFileName(file),"llama-server.exe",StringComparison.OrdinalIgnoreCase)||String.IsNullOrEmpty(token)||token.Length>256)throw new InvalidOperationException();
  int host=Array.IndexOf(args,"--host");if(host<0||host+1>=args.Length||args[host+1]!="127.0.0.1"||Array.LastIndexOf(args,"--host")!=host||Array.IndexOf(args,"--no-webui")<0||Array.IndexOf(args,"--no-slots")<0)throw new InvalidOperationException();
  Startup startup=new Startup();startup.Size=(uint)Marshal.SizeOf(typeof(Startup));Created child=new Created();StringBuilder command=new StringBuilder(Quote(file));foreach(string arg in args)command.Append(' ').Append(Quote(arg));
  try{
   Environment.SetEnvironmentVariable("LLAMA_ARG_API_KEY",token);
   if(!CreateProcess(file,command,IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,Path.GetDirectoryName(file),ref startup,out child))throw new InvalidOperationException();
   process=child.Process;job=CreateJobObject(IntPtr.Zero,null);Limits limits=new Limits();limits.Basic.Flags=0x2000;
   if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits)))||!AssignProcessToJobObject(job,process))throw new InvalidOperationException();
   Dictionary<string,object> cap=null;if(condition=="commit"||condition=="working-set"){cap=Constrain(condition,bytes);if(!(bool)cap["applied"])throw new InvalidOperationException();}
   bool priorityApplied=!priority||LowPriority();if(priority&&!priorityApplied)throw new InvalidOperationException();
   if(ResumeThread(child.Thread)==UInt32.MaxValue)throw new InvalidOperationException();
   return new Dictionary<string,object>{{"pid",child.Pid},{"contained",true},{"constraintTiming","before-resume"},{"cap",cap},{"lowPriorityApplied",priority&&priorityApplied}};
  }catch{if(child.Process!=IntPtr.Zero){TerminateProcess(child.Process,1);WaitForSingleObject(child.Process,5000);}throw;}
  finally{Environment.SetEnvironmentVariable("LLAMA_ARG_API_KEY",null);if(child.Thread!=IntPtr.Zero)CloseHandle(child.Thread);}
 }
 public Dictionary<string,object> Alive(){uint code;if(process==IntPtr.Zero||!GetExitCodeProcess(process,out code))return new Dictionary<string,object>{{"alive",false},{"exitCode",1}};return new Dictionary<string,object>{{"alive",code==259},{"exitCode",code}};}
 public void Stop(){if(process!=IntPtr.Zero){uint code;if(GetExitCodeProcess(process,out code)&&code==259){TerminateProcess(process,1);if(WaitForSingleObject(process,5000)!=0)throw new InvalidOperationException();}}}
 public Dictionary<string,object> Constrain(string kind,long bytes){
  if(process==IntPtr.Zero||!(bool)Alive()["alive"]||bytes<1073741824L||bytes>3221225472L)throw new InvalidOperationException();
  bool ok=false;if(kind=="working-set")ok=SetProcessWorkingSetSizeEx(process,new UIntPtr(65536),new UIntPtr((ulong)bytes),6);
  else if(kind=="commit") {Limits l=new Limits();l.Basic.Flags=0x100|0x2000;l.Process=new UIntPtr((ulong)bytes);ok=job!=IntPtr.Zero&&SetInformationJobObject(job,9,ref l,(uint)Marshal.SizeOf(typeof(Limits)));}
  else throw new InvalidOperationException();
  return new Dictionary<string,object>{{"kind",kind},{"applied",ok},{"bytes",bytes},{"errorCode",ok?0:Marshal.GetLastWin32Error()}};
 }
 public bool LowPriority(){if(process==IntPtr.Zero||!(bool)Alive()["alive"])throw new InvalidOperationException();uint value=2;return SetPriorityClass(process,0x4000)&&SetProcessInformation(process,0,ref value,4);}
 public Dictionary<string,object> Allocate(long bytes){
  if(bytes<0||bytes>1610612736L)throw new InvalidOperationException();
  lock(sync){if(buffers.Count>0||PressureReleased)throw new InvalidOperationException();
   while(AllocatedBytes<bytes){if(Convert.ToUInt64(SystemMemory()["availableBytes"])<3221225472UL)break;const int n=16*1024*1024;IntPtr b=VirtualAlloc(IntPtr.Zero,new UIntPtr(n),0x3000,4);if(b==IntPtr.Zero)break;buffers.Add(b);AllocatedBytes+=n;for(int i=0;i<n;i+=4096)Marshal.WriteByte(b,i,1);}
  }
  return new Dictionary<string,object>{{"allocatedBytes",AllocatedBytes},{"pressureReleased",PressureReleased}};
 }
 void CheckPressure(object ignored){try{if(Convert.ToUInt64(SystemMemory()["availableBytes"])<1342177280UL){lock(sync){if(buffers.Count>0){PressureReleased=true;Release();}}}}catch{lock(sync){PressureReleased=true;Release();}}}
 public void Release(){lock(sync){foreach(IntPtr b in buffers)VirtualFree(b,UIntPtr.Zero,0x8000);buffers.Clear();AllocatedBytes=0;}}
 public Dictionary<string,object> Sample(bool mappings){
  Dictionary<string,object> result=SystemMemory();result["pressureReleased"]=PressureReleased;result["allocatedBytes"]=AllocatedBytes;
  if(process==IntPtr.Zero)return result;if(!(bool)Alive()["alive"])throw new InvalidOperationException();
  Counters c=new Counters();c.Size=(uint)Marshal.SizeOf(typeof(Counters));if(!GetProcessMemoryInfo(process,ref c,c.Size))throw new InvalidOperationException();
  result["privateCommitBytes"]=c.Private.ToUInt64();result["workingSetBytes"]=c.WS.ToUInt64();result["peakWorkingSetBytes"]=c.PeakWS.ToUInt64();result["pageFaultsTotal"]=c.Faults;result["hardPageFaults"]=null;
  // Total faults include soft faults. Do not mislabel them as disk/hard faults.
  result["hardPageFaultsReason"]="Per-process hard-fault tracing is unavailable in this non-elevated sampler.";
  long creation,exit,kernel,user;if(GetProcessTimes(process,out creation,out exit,out kernel,out user))result["cpuMs"]=(kernel+user)/10000.0;
  if(!mappings)return result;
  ulong address=0,privateResident=0,mappedResident=0,weightsResident=0,weightsMapped=0,imageResident=0,unshared=0,pages=0;
  bool complete=true;WS[] info=new WS[4096];var clock=Stopwatch.StartNew();
  while(address<0x7ffffffeffffUL){Region r;if(VirtualQueryEx(process,new IntPtr((long)address),out r,new UIntPtr((uint)Marshal.SizeOf(typeof(Region))))==UIntPtr.Zero){complete=false;result["mappingErrorCode"]=Marshal.GetLastWin32Error();break;}
   ulong size=r.Size.ToUInt64(),start=(ulong)r.Base.ToInt64();if(size==0||start+size<=address){complete=false;break;}
   if(r.State==0x1000){bool weight=false;if(r.Type==0x40000){StringBuilder name=new StringBuilder(4096);weight=GetMappedFileName(process,r.Base,name,name.Capacity)>0&&name.ToString().EndsWith(".gguf",StringComparison.OrdinalIgnoreCase);if(weight)weightsMapped+=size;}
    for(ulong offset=0;offset<size;){int count=(int)Math.Min(4096UL,(size-offset+4095)/4096);for(int i=0;i<count;i++)info[i].Address=new IntPtr((long)(start+offset+(ulong)i*4096));
     if(!QueryWorkingSetEx(process,info,count*16)){complete=false;break;}
     for(int i=0;i<count;i++){ulong flags=info[i].Flags.ToUInt64();if((flags&1)==0)continue;if((flags&0x8000)==0)unshared+=4096;if(r.Type==0x20000)privateResident+=4096;else if(r.Type==0x40000){mappedResident+=4096;if(weight)weightsResident+=4096;}else if(r.Type==0x1000000)imageResident+=4096;}
     offset+=(ulong)count*4096;pages+=(ulong)count;if(pages>2000000||clock.ElapsedMilliseconds>2000){complete=false;break;}
    }
   }
   if(!complete)break;address=start+size;
  }
  result["mappingSampleComplete"]=complete;result["privateRegionResidentBytes"]=privateResident;result["unsharedResidentBytes"]=unshared;result["mappedFileResidentBytes"]=mappedResident;result["mappedWeightResidentBytes"]=weightsResident;result["mappedWeightVirtualBytes"]=weightsMapped;result["imageResidentBytes"]=imageResident;result["mappingSampleMs"]=clock.ElapsedMilliseconds;
  return result;
 }
 public void Dispose(){guard.Dispose();Release();try{Stop();}finally{if(job!=IntPtr.Zero)CloseHandle(job);if(process!=IntPtr.Zero)CloseHandle(process);}}
}
