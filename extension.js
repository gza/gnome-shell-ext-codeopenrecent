/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

// Based on the example provided by GNOME Shell documentation:
// https://gjs.guide/extensions/topics/search-provider.html

import St from "gi://St";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

/**
 * History entry
 * @typedef {Object} HistoryEntry
 * @property {string} uri - The URI of the history entry
 * @property {string} title - The human-readable label (last path segment)
 * @property {string} description - Human-friendly description line
 * @property {string} iconName - System icon name for the workspace type
 */

class SearchProvider {
  constructor(extension) {
    console.debug("✅ SearchProvider starts");
    this._extension = extension;

    /** @type {HistoryEntry[]} */
    this._historyEntries = [];
  }

  /**
   * The application of the provider.
   *
   * Applications will return a `Gio.AppInfo` representing themselves.
   * Extensions will usually return `null`.
   *
   * @type {Gio.AppInfo}
   */
  get appInfo() {
    return (
      Gio.DesktopAppInfo.new("code.desktop") ??
      Gio.DesktopAppInfo.new("code-oss.desktop") ??
      Gio.DesktopAppInfo.new("visual-studio-code.desktop") ??
      null
    );
  }

  /**
   * Whether the provider offers detailed results.
   *
   * Applications will return `true` if they have a way to display more
   * detailed or complete results. Extensions will usually return `false`.
   *
   * @type {boolean}
   */
  get canLaunchSearch() {
    return false;
  }

  /**
   * The unique ID of the provider.
   *
   * Applications will return their application ID. Extensions will usually
   * return their UUID.
   *
   * @type {string}
   */
  get id() {
    return this._extension.uuid;
  }

  /**
   * Launch the search result.
   *
   * This method is called when a search provider result is activated.
   *
   * @param {string} result - The result identifier
   * @param {string[]} terms - The search terms
   */
  activateResult(result, terms) {
    console.debug(`activateResult(${result}, [${terms}])`);
    GLib.spawn_async(null, ['code', '--folder-uri', result], null, GLib.SpawnFlags.SEARCH_PATH, null);
  }

  /**
   * Launch the search provider.
   *
   * This method is called when a search provider is activated. A provider can
   * only be activated if the `appInfo` property holds a valid `Gio.AppInfo`
   * and the `canLaunchSearch` property is `true`.
   *
   * Applications will typically open a window to display more detailed or
   * complete results.
   *
   * @param {string[]} terms - The search terms
   */
  launchSearch(terms) {
    console.debug(`launchSearch([${terms}])`);
  }

  /**
   * Create a result object.
   *
   * This method is called to create an actor to represent a search result.
   *
   * Implementations may return any `Clutter.Actor` to serve as the display
   * result, or `null` for the default implementation.
   *
   * @param {ResultMeta} meta - A result metadata object
   * @returns {Clutter.Actor|null} An actor for the result
   */
  createResultObject(meta) {
    console.debug(`createResultObject(${meta.id})`);

    return null;
  }

  /**
   * Get result metadata.
   *
   * This method is called to get a `ResultMeta` for each identifier.
   *
   * If @cancellable is triggered, this method should throw an error.
   *
   * @async
   * @param {string[]} results - The result identifiers
   * @param {Gio.Cancellable} cancellable - A cancellable for the operation
   * @returns {Promise<ResultMeta[]>} A list of result metadata objects
   */
  async getResultMetas(results, cancellable) {
    console.debug(`getResultMetas([${results}])`);
    const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

    return new Promise((resolve, reject) => {
      const cancelledId = cancellable.connect(() =>
        reject(Error("Operation Cancelled"))
      );

      const resultMetas = [];

      for (const identifier of results) {
        const historyEntry = this._historyEntries.find(
          (entry) => entry.uri === identifier
        );

        if (!historyEntry) {
          continue;
        }

        const meta = {
          id: identifier,
          name: historyEntry.title,
          description: historyEntry.description,
          clipboardText: historyEntry.uri,
          createIcon: (size) => {
            return new St.Icon({
              icon_name: historyEntry.iconName ?? "dialog-information",
              width: size * scaleFactor,
              height: size * scaleFactor,
            });
          },
        };

        resultMetas.push(meta);
      }

      cancellable.disconnect(cancelledId);
      if (!cancellable.is_cancelled()) resolve(resultMetas);
    });
  }

  /**
   * Decode a hex-encoded UTF-8 string.
   *
   * @param {string} hex - A hex string (even length)
   * @returns {string} The decoded UTF-8 string
   */
  _hexToString(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Build a human-readable label from a VS Code folder URI.
   * Returns the last non-empty path segment.
   *
   * @param {string} uri
   * @returns {string}
   */
  _buildLabelFromUri(uri) {
    return decodeURIComponent(uri).replace(/\/$/, '').split('/').pop() || uri;
  }

  /**
   * Build a type-aware title from a VS Code folder URI.
   *
   * - ssh-remote     → "<host> — <basename>"
   * - dev-container  → "Container — <basename>"
   * - file://        → "<basename>" (last path segment)
   *
   * @param {string} uri
   * @returns {string}
   */
  _buildTitleFromUri(uri) {
    try {
      if (uri.includes('ssh-remote')) {
        const decoded = decodeURIComponent(uri);
        const m = decoded.match(/ssh-remote\+([^/]+)(\/.*)?$/);
        if (m) {
          const basename = (m[2] ?? '/').replace(/\/$/, '').split('/').pop() || m[1];
          return `${m[1]} — ${basename}`;
        }
      }
      if (uri.includes('dev-container')) {
        return `Container — ${this._buildLabelFromUri(uri)}`;
      }
    } catch (_) {
      // fall through
    }
    return this._buildLabelFromUri(uri);
  }

  /**
   * Return a system icon name for the workspace type.
   *
   * @param {string} uri
   * @returns {string}
   */
  _buildIconNameForUri(uri) {
    if (uri.startsWith('file://')) return 'folder';
    if (uri.includes('ssh-remote')) return 'network-server';
    if (uri.includes('dev-container')) return 'computer';
    return 'dialog-information';
  }

  /**
   * Build a human-friendly description line from a VS Code folder URI.
   *
   * - file://        → decoded local path
   * - ssh-remote     → "SSH: <host> — <path>"
   * - dev-container  → "Dev Container — <hostPath>" (hex-decoded from authority)
   *
   * @param {string} uri
   * @returns {string}
   */
  _buildDescriptionFromUri(uri) {
    try {
      if (uri.startsWith('file://')) {
        return decodeURIComponent(uri.slice('file://'.length));
      }
      if (uri.includes('ssh-remote')) {
        const decoded = decodeURIComponent(uri);
        const m = decoded.match(/ssh-remote\+([^/]+)(\/.*)?$/);
        if (m) return m[2] ?? '/';
      }
      if (uri.includes('dev-container')) {
        const decoded = decodeURIComponent(uri);
        const m = decoded.match(/dev-container\+([0-9a-f]+)\//i);
        if (m) {
          const json = JSON.parse(this._hexToString(m[1]));
          if (json.hostPath) return `Dev Container — ${json.hostPath}`;
        }
        return `Dev Container — ${this._buildLabelFromUri(uri)}`;
      }
    } catch (_) {
      // fall through to raw URI
    }
    return uri;
  }

  /**
   * Get the history entries by enumerating workspaceStorage directories.
   * Sorted by mtime descending, capped at 100, filtered case-insensitively.
   *
   * @param {string[]} searchTerms
   * @returns {Promise<HistoryEntry[]>}
   */
  async _getHistoryEntries(searchTerms) {
    console.debug(`_getHistoryEntries([${searchTerms}])`);
    const workspaceStoragePath =
      GLib.get_home_dir() + '/.config/Code/User/workspaceStorage';

    this._historyEntries.length = 0;

    let raw = [];
    try {
      const storageDir = Gio.File.new_for_path(workspaceStoragePath);
      const enumerator = storageDir.enumerate_children(
        'standard::name,standard::type,time::modified',
        Gio.FileQueryInfoFlags.NONE,
        null
      );

      let info;
      while ((info = enumerator.next_file(null)) !== null) {
        if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
        const name = info.get_name();
        const mtime = info.get_attribute_uint64('time::modified');
        try {
          const jsonFile = Gio.File.new_for_path(
            `${workspaceStoragePath}/${name}/workspace.json`
          );
          const [, contents] = jsonFile.load_contents(null);
          const data = JSON.parse(new TextDecoder().decode(contents));
          if (data?.folder) raw.push({ uri: data.folder, mtime });
        } catch (_) {
          // missing or malformed workspace.json — skip silently
        }
      }
      enumerator.close(null);
    } catch (error) {
      console.error(error);
      return [];
    }

    // Sort by mtime descending and keep the 100 most recent
    raw.sort((a, b) => b.mtime - a.mtime);
    raw = raw.slice(0, 100);

    // Build labels/descriptions and filter case-insensitively
    const lowerTerms = searchTerms.map(t => t.toLowerCase());
    for (const { uri } of raw) {
      const title = this._buildTitleFromUri(uri);
      const description = this._buildDescriptionFromUri(uri);
      const iconName = this._buildIconNameForUri(uri);
      const lowerUri = uri.toLowerCase();
      const lowerTitle = title.toLowerCase();
      let include = false;
      for (const term of lowerTerms) {
        if (lowerUri.includes(term) || lowerTitle.includes(term)) {
          include = true;
          break;
        }
      }
      if (include)
        this._historyEntries.push({ uri, title, description, iconName });
    }

    return this._historyEntries;
  }

  /**
   * Initiate a new search.
   *
   * This method is called to start a new search and should return a list of
   * unique identifiers for the results.
   *
   * If @cancellable is triggered, this method should throw an error.
   *
   * @async
   * @param {string[]} terms - The search terms
   * @param {Gio.Cancellable} cancellable - A cancellable for the operation
   * @returns {Promise<string[]>} A list of result identifiers
   */
  getInitialResultSet(terms, cancellable) {
    console.debug(`getInitialResultSet([${terms}])`);
    return new Promise((resolve, reject) => {
      const cancelledId = cancellable.connect(() =>
        reject(Error("Search Cancelled"))
      );

      this._getHistoryEntries(terms)
        .then((entries) => {
          const identifiers = entries.map((entry) => entry.uri);
          cancellable.disconnect(cancelledId);
          if (!cancellable.is_cancelled()) resolve(identifiers);
        })
        .catch((_error) => {
          console.error(_error);
          cancellable.disconnect(cancelledId);
          if (!cancellable.is_cancelled()) resolve([]);
        });
    });
  }

  /**
   * Refine the current search.
   *
   * This method is called to refine the current search results with
   * expanded terms and should return a subset of the original result set.
   *
   * Implementations may use this method to refine the search results more
   * efficiently than running a new search, or simply pass the terms to the
   * implementation of `getInitialResultSet()`.
   *
   * If @cancellable is triggered, this method should throw an error.
   *
   * @async
   * @param {string[]} results - The original result set
   * @param {string[]} terms - The search terms
   * @param {Gio.Cancellable} cancellable - A cancellable for the operation
   * @returns {Promise<string[]>}
   */
  getSubsearchResultSet(results, terms, cancellable) {
    console.debug(`getSubsearchResultSet([${results}], [${terms}])`);
    if (cancellable.is_cancelled()) throw Error("Search Cancelled");

    return this.getInitialResultSet(terms, cancellable);
  }

  /**
   * Filter the current search.
   *
   * This method is called to truncate the number of search results.
   *
   * Implementations may use their own criteria for discarding results, or
   * simply return the first n-items.
   *
   * @param {string[]} results - The original result set
   * @param {number} maxResults - The maximum amount of results
   * @returns {string[]} The filtered results
   */
  filterResults(results, maxResults) {
    console.debug(`filterResults([${results}], ${maxResults})`);

    if (results.length <= maxResults) return results;

    return results.slice(0, maxResults);
  }
}

export default class ExampleExtension extends Extension {
  enable() {
    this._provider = new SearchProvider(this);
    Main.overview.searchController.addProvider(this._provider);
  }

  disable() {
    Main.overview.searchController.removeProvider(this._provider);
    this._provider = null;
  }
}
