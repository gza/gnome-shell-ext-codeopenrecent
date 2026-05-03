# Project Overview

`codeopenrecent@webgr.fr` is a pure-GJS GNOME Shell extension that registers a
**Search Provider** in the GNOME Overview. It queries VS Code's SQLite state
database (`state.vscdb`) to expose recently-opened folder URIs as search results,
letting users open any recent VS Code workspace directly from the GNOME Overview
search bar without launching VS Code first.

---

## Repository Structure

```
codeopenrecent@webgr.fr/
├── extension.js   – Entire extension: SearchProvider class + Extension entry point
├── metadata.json  – UUID, name, description, supported shell-version list
├── README.md      – Status notes and contribution guidelines
├── specs/         - Specification documents and design notes (not user-facing)
└── LICENSE        – GNU GPL-2.0-or-later
```

- **extension.js** – All logic lives here; no build step required.
- **metadata.json** – Must stay in sync with the UUID used in the directory name
  (`codeopenrecent@webgr.fr`).

---

## Build & Development Commands

This extension has no build step — it is plain GJS (ES module syntax).

```bash
# Install / reload during development (GNOME Shell 45+)
gnome-extensions enable codeopenrecent@webgr.fr

# Disable
gnome-extensions disable codeopenrecent@webgr.fr

# Reload after editing extension.js (X11 only — restarts Shell in-place)
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s \
  'Meta.restart("Restarting…", global.context)'

# On Wayland, log out and back in to reload, or use:
dbus-run-session -- gnome-shell --nested --wayland   # nested Wayland session for testing

# Stream live logs (filter to this extension)
journalctl -fo cat /usr/bin/gnome-shell | grep -i "codeopenrecent\|SearchProvider"

# Lint / style check (if eslint is available)
npx eslint extension.js
```

> TODO: Add a `package.json` or `Makefile` with standard targets if the project
> grows beyond a single file.

---

## Code Style & Conventions

- **Language:** GJS ES modules (`import … from "gi://…"`). No transpilation.
- **Indentation:** 2 spaces.
- **Quotes:** Double quotes for import paths; template literals for log messages.
- **Naming:** `camelCase` for variables/methods, `PascalCase` for classes.
- **JSDoc:** Public methods and `@typedef` blocks are documented; private helpers
  prefixed with `_`.
- **Error handling:** Wrap Gda/SQLite calls in `try/catch`; log with
  `console.error()` and return safe fallback (`[]`).

**Good vs bad patterns:**

```js
// ✅ Good — descriptive JSDoc, safe fallback, explicit close
async _getHistoryEntries(searchTerms) {
  let conn;
  try {
    conn = new Gda.Connection({ … });
    conn.open();
  } catch (error) {
    console.error(error);
    return [];
  }
  // … query …
  conn.close();
  return this._historyEntries;
}

// 🚫 Bad — no error handling, connection never closed
_getHistoryEntries(searchTerms) {
  const conn = new Gda.Connection({ … });
  conn.open();
  // if this throws, conn leaks
  return this._historyEntries;
}
```

- Commit messages: `<type>: <short description>` (e.g., `fix: handle missing label in entry`).
- No bundler, no TypeScript; keep the extension a single `.js` file.

---

## Architecture Notes

```
GNOME Overview search bar
        │  search terms
        ▼
  SearchProvider (extension.js)
        │
        ├─ getInitialResultSet(terms)
        │       └─ _getHistoryEntries(terms)
        │               └─ Gio.File.enumerate_children
        │                  ~/.config/Code/User/workspaceStorage/*/
        │                  ↳ read workspace.json → { folder: URI }
        │                  ↳ sort by mtime desc, slice top 100
        │                  ↳ _buildLabelFromUri / _buildDescriptionFromUri
        │                  ↳ filter case-insensitively by terms
        │
        ├─ getResultMetas(results) → ResultMeta[]  (name, description, icon)
        │
        └─ activateResult(result)
                └─ GLib.spawn_async(['code', '--folder-uri', uri])
```

**Components:**

| Class / Object | Role |
|---|---------|
| `SearchProvider` | Implements GNOME Search Provider protocol; caches `_historyEntries` |
| `ExampleExtension` | GNOME `Extension` base class; registers/unregisters the provider |
| `_hexToString(hex)` | Decodes hex-encoded UTF-8 (used for devcontainer authority JSON) |
| `_buildLabelFromUri(uri)` | Returns last path segment as human-readable label |
| `_buildDescriptionFromUri(uri)` | Returns type-prefixed description (SSH / Dev Container / local path) |

**Data flow:**
1. User types in GNOME Overview → Shell calls `getInitialResultSet`.
2. `_getHistoryEntries` enumerates `~/.config/Code/User/workspaceStorage/`, reads
   each `workspace.json`, sorts by directory mtime (most recent first), slices to
   top 100, builds labels/descriptions, and filters case-insensitively.
3. Matching folder URIs are returned as identifiers; `getResultMetas` builds
   display objects with human-friendly name and description.
4. On activation, VS Code is launched with `GLib.spawn_async(['code', '--folder-uri', uri])`
   — no shell expansion.

**URI types handled:**

| URI scheme | Title | Description | Icon |
|---|---|---|---|
| `file:///path/to/foo` | `foo` | `/path/to/foo` | `folder` |
| `vscode-remote://ssh-remote%2Bhost/path` | `host — path` | `/path` | `network-server` |
| `vscode-remote://dev-container%2B<HEX>/workspaces/foo` | `Container — foo` | `Dev Container — <hostPath>` | `computer` |

---

## Testing Strategy

There is currently **no automated test suite**.

**Manual testing steps:**

1. Enable the extension and open GNOME Overview.
2. Type a partial folder name or URI fragment → results should appear.
3. Click/Enter on a result → VS Code should open the matching folder.
4. Test SSH remote: result description should show `SSH: <host> — <path>`.
5. Test Dev Container: result description should show `Dev Container — <hostPath>`.
6. Test with a missing or renamed `workspaceStorage` dir → no crash, empty results.
7. Test case-insensitive search: typing `ZTK` should find `ztk` entries.
8. Verify the most-recently-opened workspace appears first.

```bash
# Watch logs while manually testing
journalctl -fo cat /usr/bin/gnome-shell | grep -E "SearchProvider|codeopenrecent|Error"
```

> TODO: Consider adding a GJS test harness (e.g., `jasmine-gjs`) for unit-testing
> `_getHistoryEntries` with a fixture `workspaceStorage` directory tree.

---

## Security & Compliance

- **License:** GNU GPL-2.0-or-later (see [LICENSE](LICENSE)).
- **No secrets / credentials** are stored or transmitted.
- **File access:** Read-only access to the user's local VS Code workspace storage.
  Paths are derived from `GLib.get_home_dir()` — no user-controlled path is evaluated.
- **Command injection risk:** `activateResult` uses `GLib.spawn_async` with an explicit
  argv array `['code', '--folder-uri', uri]` — no shell expansion occurs.
- **Hex decoding:** `_hexToString` uses `parseInt` + `TextDecoder` — no `eval`, no
  dynamic code execution.
- **Dependency scanning:** No npm/pip dependencies. The only external libraries
  are GNOME platform libraries (`GLib`, `Gio`, `St`) — system-managed.
- **GNOME `shell-version`:** Keep `metadata.json` up-to-date as new GNOME Shell
  releases are tested; never claim compatibility without testing.

---

## Agent Guardrails

- ✅ **Always:** Keep `metadata.json` `shell-version` list in sync with tested
  GNOME Shell versions.
- ✅ **Always:** Keep `README.md` and `AGENTS.md` in sync when behaviour,
  architecture, commands, or guardrails change.
- ✅ **Always:** Maintain GPL-2.0-or-later licence header in `extension.js` for
  any new files added.
- ✅ **Always:** Review `activateResult` and any `spawn`/`exec` call for
  command-injection risk before modifying.
- ✅ **Always:** Report context coverage at the end of the first response:
  percentage of information present in the initial context versus percentage
  sourced from codebase search.
- ⚠️ **Ask first:** Adding new GI imports (e.g., `gi://Soup`) — confirm the
  library is available on the target GNOME Shell version.
- ⚠️ **Ask first:** Changing the DB query or DB path — could break for users
  with non-standard VS Code installations.
- ⚠️ **Ask first:** Publishing to extensions.gnome.org — requires review policy
  compliance and thorough testing.
- 🚫 **Never:** Write to the user's `state.vscdb` or any VS Code configuration
  file.
- 🚫 **Never:** Hard-code or log user paths beyond debug-level `console.debug`.
- 🚫 **Never:** Introduce a bundler, transpiler, or npm dependency without
  explicit user approval — the extension must remain pure GJS.
- 🚫 **Never:** Remove the GPL licence header or change the licence.

**When uncertain, propose a plan or ask — don't guess.**

---

## Golden Rules

- **KISS:** Keep the extension a single `.js` file with no build step, no
  transpiler, and no external dependencies. If a feature can't be implemented
  cleanly in plain GJS, reconsider the feature.
- **Security first:** Any code path that spawns a process or accesses the
  filesystem must be reviewed for injection and path-traversal risk before
  merging. Read-only DB access; never write to VS Code state files.
- **Test before claiming compatibility:** Do not add a GNOME Shell version to
  `metadata.json` without manually verifying the extension loads and functions
  correctly on that version.

---

## Extensibility Hooks

| Hook / Variable | Purpose |
|---|---|
| `shell-version` in `metadata.json` | Controls which GNOME Shell versions load the extension |
| `workspaceStoragePath` in `_getHistoryEntries` | Could be made configurable via `GSettings` to support VS Code Insiders, Cursor, or VSCodium |
| `['code', '--folder-uri']` argv in `activateResult` | Could be made configurable to support alternative editors |
| `raw.slice(0, 100)` cap in `_getHistoryEntries` | Adjustable constant to tune history depth vs. search latency |
| `console.debug(…)` calls | Controlled by GNOME Shell debug level; no extra flags needed |

> TODO: Add a `GSettings` schema if per-user configuration (editor binary, storage
> path) is desired in the future.

---

## Further Reading

- [GJS GNOME Shell Extensions Guide](https://gjs.guide/extensions/)
- [GNOME Search Provider documentation](https://gjs.guide/extensions/topics/search-provider.html)
- [GNOME Extensions review guidelines](https://wiki.gnome.org/Projects/GnomeShell/Extensions/ReviewGuidelines)
- [README.md](README.md) – current project status and contribution notes

