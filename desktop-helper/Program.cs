using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;
using System.Text.RegularExpressions;

// One request per process. No network, shell, key injection, clipboard, or Send().
internal static class Program
{
    static JsonElement request;
    static readonly List<object> com = new();
    static T Keep<T>(T obj) { if (obj is not null && Marshal.IsComObject(obj)) com.Add(obj); return obj; }
    static string Clip(object? value, int max = 50000) { string s = Convert.ToString(value) ?? ""; return s.Length > max ? s[..max] : s; }
    static string S(string key, int max = 50000) { var s = request.GetProperty(key).GetString() ?? ""; if (s.Length > max || s.IndexOf('\0') >= 0) throw new InvalidOperationException(); return s; }
    [STAThread]
    static int Main()
    {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var input = Console.ReadLine(); if (input is null || input.Length > 300000) throw new InvalidOperationException();
            using var doc = JsonDocument.Parse(input); request = doc.RootElement;
            var result = Execute(S("op", 40));
            var output = JsonSerializer.Serialize(new { ok = true, result });
            if (Encoding.UTF8.GetByteCount(output) > 800000) throw new InvalidOperationException();
            Console.WriteLine(output); return 0;
        } catch { Console.WriteLine("{\"ok\":false,\"code\":\"ACCESS\"}"); return 1; }
        finally { for (int i = com.Count - 1; i >= 0; i--) try { Marshal.FinalReleaseComObject(com[i]); } catch { } }
    }
    static object Execute(string op) => op switch {
        "health" => new { windows = OperatingSystem.IsWindows(), architecture = RuntimeInformation.ProcessArchitecture.ToString(), classicOutlook = Type.GetTypeFromProgID("Outlook.Application") is not null, memory = MemoryHealth() },
        "memory.trimIdle" => WindowsMemory.TrimIdleChildren(request.GetProperty("pids").EnumerateArray().Select(p => p.GetInt32()).ToArray(), IdleApproval),
        "windows" => Windows(),
        "ui.read" => ReadVisible(Window()),
        "ui.fields" => Fields(Window()),
        "ui.writeDraft" => WriteDraft(Window()),
        "wa.snapshot" => WhatsAppSnapshot(),
        "outlook.messages" => Messages(),
        "outlook.message" => Message(),
        "outlook.calendar" => Calendar(),
        "outlook.draft" => MailDraft(),
        "outlook.appointment" => Appointment(),
        "outlook.delete" => DeleteMessage(),
        "outlook.cleanup" => CleanupMessages(),
        _ => throw new InvalidOperationException()
    };
    static object? MemoryHealth() { try { return WindowsMemory.Health(); } catch { return null; } }
    static bool IdleApproval() { Console.WriteLine("{\"ready\":true}"); Console.Out.Flush(); return Console.ReadLine() == "trim"; }
    static object Windows()
    {
        string? only = request.TryGetProperty("path", out var p) ? p.GetString() : null;
        var list = new List<object>(); int session = Process.GetCurrentProcess().SessionId;
        foreach (var proc in Process.GetProcesses()) using (proc) try {
            if (proc.SessionId != session || proc.MainWindowHandle == IntPtr.Zero || string.IsNullOrWhiteSpace(proc.MainWindowTitle)) continue;
            string file = proc.MainModule?.FileName ?? "";
            if (file.Length == 0 || (only is not null && !string.Equals(file, only, StringComparison.OrdinalIgnoreCase))) continue;
            list.Add(new { pid = proc.Id, name = proc.ProcessName, title = Clip(proc.MainWindowTitle, 250), path = file });
            if (list.Count >= 100) break;
        } catch { }
        return list;
    }
    static AutomationElement Window()
    {
        using var proc = Process.GetProcessById(request.GetProperty("pid").GetInt32());
        if (proc.SessionId != Process.GetCurrentProcess().SessionId || proc.MainWindowHandle == IntPtr.Zero || !string.Equals(proc.MainModule?.FileName, S("path", 3000), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
        return AutomationElement.FromHandle(proc.MainWindowHandle);
    }
    static IEnumerable<AutomationElement> Elements(AutomationElement root)
    {
        var stack = new Stack<AutomationElement>(); stack.Push(root); var timer = Stopwatch.StartNew(); int count = 0;
        var walker = TreeWalker.ControlViewWalker;
        while (stack.Count > 0 && count++ < 5000 && timer.Elapsed.TotalSeconds < 12) {
            var e = stack.Pop(); bool visible;
            try { visible = !e.Current.IsOffscreen && !e.Current.IsPassword; } catch { continue; }
            if (!visible) continue;
            yield return e;
            try { var child = walker.GetFirstChild(e); int n = 0; var children = new List<AutomationElement>(); while (child is not null && n++ < 1000) { children.Add(child); child = walker.GetNextSibling(child); } for (int i = children.Count - 1; i >= 0; i--) stack.Push(children[i]); } catch { }
        }
    }
    static object ReadVisible(AutomationElement root)
    {
        var parts = new List<string>(); var seen = new HashSet<string>(); int size = 0; bool truncated = false;
        foreach (var e in Elements(root)) try {
            var t = e.Current.ControlType; var chunks = new List<string>();
            if (t == ControlType.Document && e.TryGetCurrentPattern(TextPattern.Pattern, out var pattern)) foreach (var range in ((TextPattern)pattern).GetVisibleRanges()) chunks.Add(range.GetText(50000));
            else if (t == ControlType.Text || t == ControlType.ListItem || t == ControlType.DataItem || t == ControlType.Hyperlink) chunks.Add(e.Current.Name);
            foreach (var chunk in chunks) if (!string.IsNullOrWhiteSpace(chunk) && seen.Add(chunk)) { int left = 50000 - size; if (left <= 0) { truncated = true; break; } string text = Clip(chunk, left); parts.Add(text); size += text.Length + 1; if (chunk.Length > left) truncated = true; }
            if (size >= 50000) { truncated = true; break; }
        } catch { }
        if (parts.Count == 0) throw new InvalidOperationException();
        return new { text = string.Join("\n", parts), truncated };
    }
    static object Fields(AutomationElement root)
    {
        var list = new List<object>();
        foreach (var e in Elements(root)) try { if (e.Current.ControlType == ControlType.Edit && e.TryGetCurrentPattern(ValuePattern.Pattern, out var value) && !((ValuePattern)value).Current.IsReadOnly) { list.Add(new { fieldId = string.Join(".", e.GetRuntimeId()), label = Clip(e.Current.Name, 200) }); if (list.Count >= 30) break; } } catch { }
        return list;
    }
    static object WriteDraft(AutomationElement root)
    {
        string id = S("fieldId", 300), text = S("text");
        foreach (var e in Elements(root)) if (string.Join(".", e.GetRuntimeId()) == id && e.Current.ControlType == ControlType.Edit && e.TryGetCurrentPattern(ValuePattern.Pattern, out var value) && !((ValuePattern)value).Current.IsReadOnly) {
            ((ValuePattern)value).SetValue(text); return new { written = true, sent = false };
        }
        throw new InvalidOperationException();
    }
    static object WhatsAppSnapshot()
    {
        var elements = Elements(Window()).ToList();
        var titles = elements.Where(e => e.Current.AutomationId is "conversation-title" or "chat-title").Select(e => e.Current.Name).Where(n => !string.IsNullOrWhiteSpace(n)).Distinct().ToList();
        var messages = new List<object>(); var groups = new HashSet<string>();
        foreach (var e in elements) {
            var id = e.Current.AutomationId;
            var m = Regex.Match(id, @"^(true|false)_(\d+(?:-\d+)?@g\.us)_([^_]+)(?:_(\d+@(c\.us|s\.whatsapp\.net|lid)))?$");
            if (!m.Success) continue;
            groups.Add(m.Groups[2].Value);
            messages.Add(new { id, groupId = m.Groups[2].Value, sender = m.Groups[4].Value.Replace("@s.whatsapp.net", "@c.us"), senderVerified = m.Groups[4].Success, incoming = m.Groups[1].Value == "false", text = Clip(e.Current.Name, 12000) });
        }
        return new { verified = titles.Count == 1 && groups.Count == 1 && messages.Count > 0, groupName = titles.Count == 1 ? titles[0] : "", groupId = groups.Count == 1 ? groups.First() : "", messages, reason = "Windows intake requires stable accessibility message identifiers. Replies use the separately paired Web fallback." };
    }
    static dynamic Outlook() { var type = Type.GetTypeFromProgID("Outlook.Application") ?? throw new InvalidOperationException(); return Keep(Activator.CreateInstance(type)!); }
    static object Messages()
    {
        dynamic app = Outlook(), ns = Keep(app.GetNamespace("MAPI")), folder = Keep(ns.GetDefaultFolder(6)), items = Keep(folder.Items);
        if (request.TryGetProperty("unread", out var unread) && unread.ValueKind == JsonValueKind.True) items = Keep(items.Restrict("[UnRead] = true"));
        items.Sort("[ReceivedTime]", true); var list = new List<object>(); int n = Math.Min((int)items.Count, 50);
        for (int i = 1; i <= n; i++) { dynamic mail = Keep(items[i]); if ((int)mail.Class != 43) continue; list.Add(new { id = Clip(mail.EntryID, 2000), storeId = Clip(folder.StoreID, 2000), subject = Clip(mail.Subject, 300), sender = Clip(mail.SenderName, 200), received = ((DateTime)mail.ReceivedTime).ToString("s") }); }
        return list;
    }
    static object Message()
    {
        dynamic app = Outlook(), ns = Keep(app.GetNamespace("MAPI")), mail = Keep(ns.GetItemFromID(S("id", 2000), S("storeId", 2000)));
        if ((int)mail.Class != 43) throw new InvalidOperationException();
        return new { text = Clip("Subject: " + Clip(mail.Subject, 1000) + "\nFrom: " + Clip(mail.SenderName, 500) + "\nReceived: " + ((DateTime)mail.ReceivedTime).ToString("s") + "\n\n" + Clip(mail.Body), 50000), attachmentsExcluded = true };
    }
    static object Calendar()
    {
        DateTime start = DateTime.ParseExact(S("start", 10), "yyyy-MM-dd", CultureInfo.InvariantCulture), end = DateTime.ParseExact(S("end", 10), "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(1);
        if (end <= start || end - start > TimeSpan.FromDays(32)) throw new InvalidOperationException();
        dynamic app = Outlook(), ns = Keep(app.GetNamespace("MAPI")), folder = Keep(ns.GetDefaultFolder(9)), items = Keep(folder.Items);
        items.Sort("[Start]"); items.IncludeRecurrences = true;
        dynamic found = Keep(items.Restrict("[Start] < '" + end.ToString("g", CultureInfo.CurrentCulture) + "' AND [End] > '" + start.ToString("g", CultureInfo.CurrentCulture) + "'"));
        var list = new List<object>(); dynamic item = found.GetFirst();
        while (item is not null && list.Count < 200) { Keep((object)item); list.Add(new { subject = Clip(item.Subject, 300), start = ((DateTime)item.Start).ToString("s"), end = ((DateTime)item.End).ToString("s"), location = Clip(item.Location, 300), allDay = (bool)item.AllDayEvent }); item = found.GetNext(); }
        bool truncated = item is not null; if (item is not null) Keep((object)item);
        return new { events = list, truncated };
    }
    static object MailDraft()
    {
        dynamic app = Outlook(), mail = Keep(app.CreateItem(0));
        mail.To = S("to", 2000); mail.Subject = S("subject", 500); mail.Body = S("body"); mail.Save(); mail.Display(false);
        return new { saved = true, sent = false };
    }
    static object Appointment()
    {
        DateTime start = DateTime.ParseExact(S("start", 16), "yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture), end = DateTime.ParseExact(S("end", 16), "yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture);
        if (end <= start || end - start > TimeSpan.FromDays(7)) throw new InvalidOperationException();
        dynamic app = Outlook(), item = Keep(app.CreateItem(1));
        item.Subject = S("subject", 500); item.Start = start; item.End = end; item.Location = S("location", 500); item.Body = S("body"); item.ReminderSet = false; item.Save(); item.Display(false);
        return new { saved = true, invitationsSent = false };
    }
    static object DeleteMessage()
    {
        dynamic app = Outlook(), ns = Keep(app.GetNamespace("MAPI")), mail = Keep(ns.GetItemFromID(S("id", 2000), S("storeId", 2000)));
        if ((int)mail.Class != 43) throw new InvalidOperationException();
        string subject = Clip(mail.Subject, 300);
        mail.Delete();
        return new { deleted = true, subject };
    }
    static object CleanupMessages()
    {
        dynamic app = Outlook(), ns = Keep(app.GetNamespace("MAPI"));
        var ids = request.GetProperty("messageIds");
        int deletedCount = 0;
        foreach (var el in ids.EnumerateArray()) {
            string id = el.GetProperty("id").GetString() ?? "";
            string storeId = el.GetProperty("storeId").GetString() ?? "";
            if (string.IsNullOrEmpty(id)) continue;
            try {
                dynamic mail = Keep(ns.GetItemFromID(id, storeId));
                if ((int)mail.Class == 43) {
                    mail.Delete();
                    deletedCount++;
                }
            } catch { }
        }
        return new { deleted = true, count = deletedCount };
    }
}
