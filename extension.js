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
import Gda from "gi://Gda";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

/**
 * History entry
 * @typedef {Object} HistoryEntry
 * @property {string} uri - The URI of the history entry
 * @property {string} title - The title of the history entry
 * @property {string} remote - The remote of the history entry
 * @property {string} remoteType - The remote of the history entry
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
    return null;
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
    GLib.spawn_command_line_async(`code --folder-uri ${result}`);
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
          description: historyEntry.uri,
          clipboardText: historyEntry.uri,
          createIcon: (size) => {
            return new St.Icon({
              icon_name: "dialog-information",
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
   * Get the history entries.
   *
   * @returns {Promise<HistoryEntry[]>} The history entries
   */
  async _getHistoryEntries(searchTerms) {
    console.debug(`_getHistoryEntries([${searchTerms}])`);
    const globalStorageDir =
      GLib.get_home_dir() + "/.config/Code/User/globalStorage";
    // run a sqlite query to get the history entries
    let conn;
    try {
      conn = conn = new Gda.Connection({
        provider: Gda.Config.get_provider("SQLite"),
        cnc_string: `DB_DIR=${globalStorageDir};DB_NAME=state.vscdb`,
      });
      conn.open();
    } catch (error) {
      console.error(error);
      return [];
    }

    // empty cached history entries
    this._historyEntries.length = 0;

    const dataModel = conn.execute_select_command(
      "SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'"
    );

    const iter = dataModel.create_iter();

    if (!iter.move_next()) return [];

    const result = JSON.parse(iter.get_value_at(0).to_string(0));
    conn.close();

    while (result.entries.length > 0) {
      const entry = result.entries.shift();
      if ("folderUri" in entry) {
        let include = false;
        for (const term of searchTerms) {
          if ('label' in entry && entry.label.includes(term)) {
            include = true;
            break;
          }
          if (entry.folderUri.includes(term)) {
            include = true;
            break;
          }
        }
        if (include) {
          this._historyEntries.push({
            uri: entry.folderUri,
            title: entry?.label || entry.folderUri,
            remote: entry?.remoteAuthority || "local",
            remoteType: entry.remoteAuthority ? "remote" : "local",
          });
        }
      }
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
