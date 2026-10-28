using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

// Numeric counters and optional reclamation of this app's own idle children.
// No privilege elevation, page-file changes, memory reads, paths or process lists
// leave this class. A trim discards resident pages, never the process or its data.
public static class WindowsMemory
{
    [StructLayout(LayoutKind.Sequential)] struct Status { public uint Length, Load; public ulong TotalPhys, AvailPhys, CommitLimit, CommitAvailable, TotalVirtual, AvailVirtual, Extended; }
    [StructLayout(LayoutKind.Sequential)] struct PageInfo { public uint Size, Reserved; public UIntPtr Total, Used, Peak; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Entry { public uint Size, Usage, Pid; public UIntPtr Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name; }
    [StructLayout(LayoutKind.Sequential)] struct Counters { public uint Size, Faults; public UIntPtr PeakWS, WS, PeakPaged, Paged, PeakNonpaged, Nonpaged, Pagefile, PeakPagefile, Private; }
    delegate bool PageCallback(IntPtr ignored, ref PageInfo info, string ignoredName);
    [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref Status s);
    [DllImport("psapi.dll", CharSet = CharSet.Unicode)] static extern bool EnumPageFilesW(PageCallback callback, IntPtr ignored);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref int size);
    [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(IntPtr process);
    [DllImport("psapi.dll")] static extern bool GetProcessMemoryInfo(IntPtr process, ref Counters counters, uint size);

    public static Dictionary<string, object> Health()
    {
        Status s = new Status(); s.Length = (uint)Marshal.SizeOf(typeof(Status));
        if (!GlobalMemoryStatusEx(ref s)) throw new InvalidOperationException();
        ulong pages = 0; int count = 0; bool valid = true;
        PageCallback callback = delegate(IntPtr ignored, ref PageInfo info, string ignoredName) { try { pages = checked(pages + info.Total.ToUInt64()); count++; } catch { valid = false; } return true; };
        bool known = EnumPageFilesW(callback, IntPtr.Zero) && valid;
        return new Dictionary<string, object> { { "totalBytes", s.TotalPhys }, { "availableBytes", s.AvailPhys }, { "commitLimitBytes", s.CommitLimit }, { "commitAvailableBytes", s.CommitAvailable }, { "pageFileKnown", known }, { "pageFileBytes", known ? (object)checked(pages * (ulong)Environment.SystemPageSize) : null }, { "pageFileCount", known ? (object)count : null } };
    }
    static long Birth(IntPtr handle) { long c, e, k, u; if (!GetProcessTimes(handle, out c, out e, out k, out u)) throw new InvalidOperationException(); return c; }
    static string Image(IntPtr handle) { StringBuilder name = new StringBuilder(32768); int size = name.Capacity; if (!QueryFullProcessImageNameW(handle, 0, name, ref size)) throw new InvalidOperationException(); return name.ToString(); }
    static Counters Memory(IntPtr handle) { Counters c = new Counters(); c.Size = (uint)Marshal.SizeOf(typeof(Counters)); if (!GetProcessMemoryInfo(handle, ref c, c.Size)) throw new InvalidOperationException(); return c; }
    static Dictionary<int, int> Parents()
    {
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0); if (snapshot == new IntPtr(-1)) throw new InvalidOperationException();
        try { Entry e = new Entry(); e.Size = (uint)Marshal.SizeOf(typeof(Entry)); var parents = new Dictionary<int, int>(); if (!Process32FirstW(snapshot, ref e)) throw new InvalidOperationException(); do { parents[(int)e.Pid] = (int)e.Parent; } while (Process32NextW(snapshot, ref e)); return parents; }
        finally { CloseHandle(snapshot); }
    }
    static bool Descendant(int pid, long birth, int root, long rootBirth, Dictionary<int, int> parents)
    {
        for (int hops = 0; hops < 32; hops++) {
            int parent; if (!parents.TryGetValue(pid, out parent) || parent <= 0 || parent == pid) return false;
            if (parent == root) return rootBirth <= birth;
            IntPtr handle = OpenProcess(0x1000, false, parent); if (handle == IntPtr.Zero) return false;
            try { long parentBirth = Birth(handle); if (parentBirth > birth) return false; birth = parentBirth; pid = parent; }
            finally { CloseHandle(handle); }
        }
        return false;
    }
    public static Dictionary<string, object> TrimIdleChildren(int[] pids, Func<bool> authorize = null)
    {
        if (pids == null || pids.Length > 32) throw new InvalidOperationException();
        var parents = Parents(); int root; if (!parents.TryGetValue(Process.GetCurrentProcess().Id, out root) || root <= 0) throw new InvalidOperationException();
        IntPtr parent = OpenProcess(0x1000, false, root); if (parent == IntPtr.Zero) throw new InvalidOperationException();
        int trimmed = 0, skipped = 0; bool authorized = false; ulong before = 0, after = 0, commitBefore = 0, commitAfter = 0; var seen = new HashSet<int>();
        try {
            long rootBirth = Birth(parent); long helperBirth; using (var self = Process.GetCurrentProcess()) helperBirth = self.StartTime.ToUniversalTime().ToFileTimeUtc();
            if (rootBirth > helperBirth) throw new InvalidOperationException(); string image = Image(parent);
            foreach (int pid in pids) {
                if (pid <= 0 || pid == root || !seen.Add(pid)) { skipped++; continue; }
                IntPtr handle = OpenProcess(0x500, false, pid); if (handle == IntPtr.Zero) { skipped++; continue; }
                try {
                    long birth = Birth(handle);
                    if (birth > helperBirth || !String.Equals(Image(handle), image, StringComparison.OrdinalIgnoreCase) || !Descendant(pid, birth, root, rootBirth, parents)) { skipped++; continue; }
                    Counters initial = Memory(handle); if (!authorized) { if (authorize != null && !authorize()) throw new InvalidOperationException(); authorized = true; } if (!EmptyWorkingSet(handle)) { skipped++; continue; } Counters final = Memory(handle);
                    before += initial.WS.ToUInt64(); after += final.WS.ToUInt64(); commitBefore += initial.Private.ToUInt64(); commitAfter += final.Private.ToUInt64(); trimmed++;
                } catch { skipped++; } finally { CloseHandle(handle); }
            }
        } finally { CloseHandle(parent); }
        return new Dictionary<string, object> { { "trimmed", trimmed }, { "skipped", skipped }, { "workingSetBeforeBytes", before }, { "workingSetAfterBytes", after }, { "privateCommitBeforeBytes", commitBefore }, { "privateCommitAfterBytes", commitAfter } };
    }
}
