export function createAccessUI(ctx) {
  const { api, form, field, textarea, select, esc, toast } = ctx;
  const check = (label, name, on = false) =>
    `<label class="check"><input type="checkbox" name="${name}" ${on ? "checked" : ""}>${esc(label)}</label>`;
  const button = (act, label, id = "", enabled = true) =>
    `<button data-act="access-${act}" data-id="${id}" ${enabled ? "" : "disabled"}>${label}</button>`;
  const permissions = (r = {}) =>
    check("Read only when I request it", "read", r.read) +
    check("Allow reviewed writes", "write", r.write);
  async function changed() {
    await ctx.refreshApps();
  }
  async function preview(name, text, notice = "") {
    const r = await form(
      name,
      `<p>${esc(notice || "Review this local reference. Nothing goes to OpenAI until you use it in a chat and send a question.")}</p><label class="field">Reference<textarea readonly rows="14">${esc(text)}</textarea></label>`,
      "Use in chat",
    );
    if (r) await ctx.useReference(await api("importReference", { name, text }));
  }
  async function chooseWindow(id) {
    const windows = await api("appWindows", { id });
    if (!windows.length)
      throw Error("Open the approved program in this Windows session first.");
    if (windows.length === 1) return windows[0].pid;
    const r = await form(
      "Choose a window",
      select(
        "Window",
        "pid",
        windows.map((w) => [w.pid, esc(w.title)]),
        windows[0].pid,
      ),
      "Choose",
    );
    return r ? Number(r.pid) : null;
  }
  async function folderBrowser(id, relative = "") {
    const grant = ctx.state().folders.find((f) => f.id === id);
    const entries = await api("folderList", { id, relative });
    if (!entries.length) {
      toast("No supported files or subfolders here.");
      return;
    }
    const r = await form(
      grant.name,
      `<p>${esc(relative || grant.path)}</p>` +
        select(
          "Choose a file or subfolder",
          "entry",
          entries.map((f, i) => [
            i,
            esc((f.directory ? "Folder: " : "") + f.name),
          ]),
          "0",
        ),
      "Open",
    );
    if (!r) return;
    const entry = entries[Number(r.entry)];
    if (!entry) return;
    if (entry.directory) return folderBrowser(id, entry.relative);
    if (grant.write && /\.(txt|md)$/i.test(entry.name)) {
      const choice = await form(
        entry.name,
        select(
          "Action",
          "action",
          [
            ["chat", "Use in a new chat"],
            ["edit", "Edit text file"],
          ],
          "chat",
        ),
        "Continue",
      );
      if (!choice) return;
      if (choice.action === "edit") {
        const loaded = await api("folderReadText", {
          id,
          relative: entry.relative,
        });
        const edited = await form(
          "Review changes",
          textarea(entry.name, "text", loaded.text),
          "Review save",
        );
        if (edited) {
          await api("folderWriteText", {
            id,
            relative: entry.relative,
            text: edited.text,
            version: loaded.version,
          });
          toast("File saved.");
        }
        return;
      }
    }
    await ctx.importFolderFile(id, entry.relative);
  }
  return {
    html() {
      const s = ctx.state(),
        o = {readMessages:false,readCalendar:false,writeDrafts:false,writeCalendar:false,...s.outlook};
      return `<div class="page"><h1>Your apps. Your permission.</h1><p class="subtitle">No background screen or mailbox reading. Choose a source, review it, then send your question.</p>
      <section class="section"><h2>Outlook messages & calendar</h2><p>Connects locally to classic Outlook in your Windows profile. New Outlook: import a saved EML, MSG, or ICS file instead. Email attachments are not read.</p><div class="button-row">${button("outlook-permissions", "Permissions")}${button("outlook-messages", "Read a message", "", o.readMessages)}${button("outlook-calendar", "Read calendar", "", o.readCalendar)}${button("outlook-draft", "Prepare email draft", "", o.writeDrafts)}${button("outlook-appointment", "Create appointment", "", o.writeCalendar)}</div><p>Drafts are never sent. Appointments have no attendees or invitations.</p>${button("health", "Check local app access")}<button data-act="files-import">Import saved message or calendar</button></section>
      <section class="section"><h2>WhatsApp & other chosen programs</h2><p>Read visible text or write into a field you choose, using Windows accessibility. Support depends on the app. No clicking Send, keystrokes, or unattended monitoring. A write replaces that field's current text.</p><div class="button-row">${button("choose-app", "Choose an open app")}<button data-act="app-add">Choose program file (open only)</button></div>${(s.apps || []).map((a) => `<div class="card"><h3>${esc(a.name)}</h3><p>${esc(a.capability)}</p><div class="button-row">${button("app-read", "Read visible text", a.id, a.read)}${button("app-write", "Write a draft", a.id, a.write)}${button("app-permissions", "Permissions", a.id)}<button data-act="app-open" data-id="${a.id}">Open</button><button class="danger" data-act="delete-item" data-kind="app" data-id="${a.id}">Remove access</button></div></div>`).join("")}</section>
      <section class="section"><h2>Allowed folders</h2><p>Allow specific folders, including an organization-approved ShareSync folder. Read and write access are separate. Original documents stay untouched unless you explicitly edit a TXT or Markdown file.</p>${button("folder-add", "Allow a folder")}${(s.folders || []).map((f) => `<div class="card"><h3>${esc(f.name)}</h3><p class="path-display">${esc(f.path)}</p><p>${f.read ? "Read on request" : "No read access"} · ${f.write ? "Reviewed writes" : "No write access"}</p><div class="button-row">${button("folder-browse", "Browse", f.id, f.read)}${button("folder-note", "New text note", f.id, f.write)}${button("folder-export", "Save last answer here", f.id, f.write && !!ctx.answerReference())}${button("folder-permissions", "Permissions", f.id)}<button class="danger" data-act="delete-item" data-kind="folder" data-id="${f.id}">Remove access</button></div></div>`).join("")}</section></div>`;
    },
    async handle(act, id) {
      const s = ctx.state();
      switch (act) {
        case "access-health": {
          const r = await api("accessHealth");
          await form(
            "Local app access",
            `<p>Windows helper: ${r.windows ? "Available" : "Unavailable"}</p><p>Classic Outlook registration: ${r.classicOutlook ? "Found" : "Not found"}</p><p>This check does not read messages, calendar events, or screens. Test with synthetic information before using sensitive content.</p>`,
            "Done",
          );
          break;
        }
        case "access-outlook-permissions": {
          const o = s.outlook || {},
            r = await form(
              "Outlook permissions",
              check(
                "Read messages when requested",
                "readMessages",
                o.readMessages,
              ) +
                check(
                  "Read calendar when requested",
                  "readCalendar",
                  o.readCalendar,
                ) +
                check(
                  "Save reviewed email drafts — never send",
                  "writeDrafts",
                  o.writeDrafts,
                ) +
                check(
                  "Create reviewed appointments — no invitations",
                  "writeCalendar",
                  o.writeCalendar,
                ),
            );
          if (r) {
            await api(
              "outlookPermissions",
              Object.fromEntries(
                [
                  "readMessages",
                  "readCalendar",
                  "writeDrafts",
                  "writeCalendar",
                ].map((k) => [k, r[k] === "on"]),
              ),
            );
            await changed();
          }
          break;
        }
        case "access-outlook-messages": {
          const messages = await api("outlookMessages");
          if (!messages.length) {
            toast("No messages found in the default Inbox.");
            break;
          }
          const r = await form(
            "Choose one Outlook message",
            "<p>Most recent 50 Inbox items. Only the selected message body will be read.</p>" +
              select(
                "Message",
                "index",
                messages.map((m, i) => [
                  i,
                  esc(m.subject + " — " + m.sender + " · " + m.received),
                ]),
                "0",
              ),
            "Read selected message",
          );
          if (r) {
            const m = messages[Number(r.index)],
              result = await api("outlookMessage", {
                id: m.id,
                storeId: m.storeId,
              });
            await preview("Outlook message", result.text);
          }
          break;
        }
        case "access-outlook-calendar": {
          const today = new Date().toLocaleDateString("en-CA"),
            r = await form(
              "Read Outlook calendar",
              "<p>Choose up to 31 days. Only event subjects, times, and locations are read (maximum 200). Times are local to this PC.</p>" +
                field("Start date", "start", today, "date") +
                field("End date", "end", today, "date"),
              "Read events",
            );
          if (r) {
            const result = await api("outlookCalendar", r);
            const text =
              result.events
                .map(
                  (e) => `${e.start} — ${e.end}\n${e.subject}\n${e.location}`,
                )
                .join("\n\n") || "No events in this range.";
            await preview(
              "Outlook calendar",
              text,
              result.truncated
                ? "Showing the first 200 events. Narrow the date range if needed."
                : "",
            );
          }
          break;
        }
        case "access-outlook-draft": {
          const r = await form(
            "Prepare an Outlook draft",
            field("To — check recipients carefully", "to") +
              field("Subject", "subject") +
              textarea("Draft body", "body", ctx.lastAnswer()),
            "Review draft",
          );
          if (r) {
            await api("outlookDraft", r);
            toast("Draft saved in Outlook. Nothing sent.");
          }
          break;
        }
        case "access-outlook-appointment": {
          const r = await form(
            "Create an Outlook appointment",
            "<p>Local PC time. No attendees or invitations.</p>" +
              field("Subject", "subject") +
              field("Start", "start", "", "datetime-local") +
              field("End", "end", "", "datetime-local") +
              field("Location", "location") +
              textarea("Notes", "body"),
            "Review appointment",
          );
          if (r) {
            await api("outlookAppointment", r);
            toast("Appointment saved. No invitations sent.");
          }
          break;
        }
        case "access-choose-app": {
          const choices = await api("appChoices");
          if (!choices.length) {
            toast("Open the program you want to allow first.");
            break;
          }
          const r = await form(
            "Choose an open program",
            select(
              "Program",
              "choiceId",
              choices.map((a) => [a.id, esc(a.name + " — " + a.title)]),
              choices[0].id,
            ) + permissions(),
            "Allow selected program",
          );
          if (r) {
            await api("grantRunningApp", {
              choiceId: r.choiceId,
              read: r.read === "on",
              write: r.write === "on",
            });
            await changed();
          }
          break;
        }
        case "access-app-permissions": {
          const a = s.apps.find((a) => a.id === id),
            r = await form(a.name + " permissions", permissions(a));
          if (r) {
            await api("appPermissions", {
              id,
              read: r.read === "on",
              write: r.write === "on",
            });
            await changed();
          }
          break;
        }
        case "access-app-read": {
          const pid = await chooseWindow(id);
          if (pid) {
            const r = await api("readApp", { id, pid });
            await preview(
              s.apps.find((a) => a.id === id).name + " reference",
              r.text,
              r.truncated
                ? "Visible text was limited. Review this extract before use."
                : "",
            );
          }
          break;
        }
        case "access-app-write": {
          const pid = await chooseWindow(id);
          if (!pid) break;
          const fields = await api("appFields", { id, pid });
          if (!fields.length) {
            toast(
              "This app exposes no supported editable fields. Copy your answer and paste it yourself.",
            );
            break;
          }
          const r = await form(
            "Choose and review the draft field",
            "<p>This replaces the selected field. Private AI will not click Send. Confirm the field in the app before continuing.</p>" +
              select(
                "Editable field",
                "fieldId",
                fields.map((f, i) => [
                  f.fieldId,
                  esc(f.label || "Unlabeled field " + (i + 1)),
                ]),
                fields[0].fieldId,
              ) +
              textarea("Draft text", "text", ctx.lastAnswer()),
            "Review write",
          );
          if (r) {
            await api("writeAppDraft", { id, pid, ...r });
            toast("Text written. Review it in the app; nothing sent.");
          }
          break;
        }
        case "access-folder-add": {
          const r = await form(
            "Allow a folder",
            permissions() +
              "<p>Choose the exact folder next. No scanning or indexing happens automatically.</p>",
            "Choose folder",
          );
          if (r) {
            await api("grantFolder", {
              read: r.read === "on",
              write: r.write === "on",
            });
            await changed();
          }
          break;
        }
        case "access-folder-permissions": {
          const f = s.folders.find((f) => f.id === id),
            r = await form(f.name + " permissions", permissions(f));
          if (r) {
            await api("folderPermissions", {
              id,
              read: r.read === "on",
              write: r.write === "on",
            });
            await changed();
          }
          break;
        }
        case "access-folder-browse":
          await folderBrowser(id);
          break;
        case "access-folder-note": {
          const r = await form(
            "New note",
            field("Filename (.txt or .md)", "relative", "Note.txt") +
              textarea("Text", "text", ctx.lastAnswer()),
            "Review save",
          );
          if (r) {
            await api("folderWriteText", { id, ...r });
            toast("Note saved.");
          }
          break;
        }
        case "access-folder-export": {
          const ref = ctx.answerReference();
          if (!ref) throw Error("Open a chat with an answer first.");
          const r = await form(
            "Save last answer",
            select(
              "Format",
              "format",
              ["docx", "pdf", "xlsx", "csv", "md", "txt"].map((x) => [
                x,
                x.toUpperCase(),
              ]),
              "docx",
            ) +
              "<p>A new report is created. Existing files are never overwritten. Excel and CSV require a Markdown table.</p>",
            "Save report",
          );
          if (r) {
            await api("folderExport", { id, ...ref, format: r.format });
            toast("Report saved in the allowed folder.");
          }
          break;
        }
      }
    },
  };
}
