# Project Overview

`vscode-workspace-search@gza.github.com` is a pure-GJS GNOME Shell extension that registers a **Search
Provider** in the GNOME Overview. It enumerates `~/.config/Code/User/workspaceStorage/` to
expose recently-opened VS Code folder URIs (local, SSH, Dev Container) as search results,
letting users open any recent workspace directly from GNOME Overview without launching VS Code.

---

## Repository Structure

```
vscode-workspace-search@gza.github.com/
├── extension.js   – All logic: SearchProvider class + Extension entry point
├── metadata.json  – UUID, name, description, shell-version list
├── README.md      – Status notes and contribution guidelines
├── specs/         – Specification documents (not user-facing)
└── LICENSE        – GNU GPL-2.0-or-later
```

---

## Build & Development Commands

No build step — plain GJS ES modules.

```bash
gnome-extensions enable vscode-workspace-search@gza.github.com
gnome-extensions disable vscode-workspace-search@gza.github.com

# Reload (X11)
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s \
  'Meta.restart("Restarting…", global.context)'

# Reload (Wayland — nested session)
dbus-run-session -- gnome-shell --nested --wayland

# Live logs
journalctl -fo cat /usr/bin/gnome-shell | grep -i "vscode-workspace-search\|SearchProvider"

npx eslint extension.js
```

---

## Code Style & Conventions

- GJS ES modules, 2-space indent, double quotes for imports, template literals for logs.
- `camelCase` for variables/methods, `PascalCase` for classes; private helpers prefixed `_`.
- Wrap all file I/O in `try/catch`; log with `console.error()` and return `[]` as fallback.
- Commit messages: `<type>: <short description>`.

```js
// ✅ Good — safe fallback
_getHistoryEntries(searchTerms) {
  try {
    const enumerator = workspaceStorageDir.enumerate_children(…);
    // …
    return this._historyEntries;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 🚫 Bad — no error handling
_getHistoryEntries(searchTerms) {
  const enumerator = workspaceStorageDir.enumerate_children(…);
  return this._historyEntries; // throws → crash
}
```

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

| URI scheme                                             | Label             | Description                  | Icon             |
| ------------------------------------------------------ | ----------------- | ---------------------------- | ---------------- |
| `file:///path/foo`                                     | `foo`             | `/path/foo`                  | `folder`         |
| `vscode-remote://ssh-remote%2Bhost/path`               | `host — path`     | `/path`                      | `network-server` |
| `vscode-remote://dev-container%2B<HEX>/workspaces/foo` | `Container — foo` | `Dev Container — <hostPath>` | `computer`       |

Key helpers: `_hexToString(hex)` (TextDecoder, GNOME Shell 45+), `_buildLabelFromUri`,
`_buildDescriptionFromUri`.

---

## Testing Strategy

No automated suite. Manual checklist:

1. Local / SSH / Dev Container entries appear and open correctly.
2. Most-recently-used workspace appears first.
3. Case-insensitive search works (`ZTK` finds `ztk`).
4. Missing `workspaceStorage` dir or malformed `workspace.json` → no crash.
5. URIs with special characters open without shell-expansion issues.

```bash
journalctl -fo cat /usr/bin/gnome-shell | grep -E "SearchProvider|vscode-workspace-search|Error"
```

---

## Security & Compliance

- License: GPL-2.0-or-later.
- Read-only access to `workspaceStorage`; never writes to VS Code state files.
- `activateResult` uses `GLib.spawn_async` with explicit argv — no shell expansion.
- No `eval`; `_hexToString` uses `parseInt` + `TextDecoder` only.
- No npm/pip deps; only system GNOME platform libraries (`GLib`, `Gio`, `St`).

---

## Agent Guardrails

- ✅ **Always:** Keep `metadata.json` `shell-version` in sync with tested GNOME Shell versions.
- ✅ **Always:** Keep `README.md` and `AGENTS.md` in sync with behaviour/architecture changes.
- ✅ **Always:** Review any `spawn`/`exec` call for command-injection risk before modifying.
- ✅ **Always:** Report context coverage at the end of the first response.
- ⚠️ **Ask first:** Adding new GI imports — confirm availability on the target GNOME Shell version.
- ⚠️ **Ask first:** Changing `workspaceStorage` path — could break non-standard VS Code installs.
- ⚠️ **Ask first:** Publishing to extensions.gnome.org.
- 🚫 **Never:** Write to any VS Code configuration or state file.
- 🚫 **Never:** Introduce a bundler, transpiler, or npm dependency — keep pure GJS.
- 🚫 **Never:** Remove or change the GPL licence header.

**When uncertain, propose a plan or ask — don't guess.**

---

## Golden Rules

- **KISS:** Single `.js` file, no build step, no external deps. If a feature can't be done
  cleanly in plain GJS, reconsider the feature.
- **Security first:** All spawn/filesystem paths must be reviewed for injection risk. Never
  write to VS Code state files.
- **Test before claiming compatibility:** Don't add a GNOME Shell version to `metadata.json`
  without verifying the extension loads and functions on that version.

---

## Extensibility Hooks

| Hook                                           | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `shell-version` in `metadata.json`             | Controls which GNOME Shell versions load the extension         |
| `workspaceStoragePath` in `_getHistoryEntries` | Configurable via `GSettings` to support Cursor, VSCodium, etc. |
| `['code', '--folder-uri']` in `activateResult` | Configurable to support alternative editors                    |
| `slice(0, 100)` cap in `_getHistoryEntries`    | Tune history depth vs. search latency                          |

---

## Further Reading

- [GJS GNOME Shell Extensions Guide](https://gjs.guide/extensions/)
- [GNOME Search Provider docs](https://gjs.guide/extensions/topics/search-provider.html)
- [README.md](README.md)
