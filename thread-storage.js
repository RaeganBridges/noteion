/**
 * Per–genre/track comment threads (localStorage).
 */
(function (global) {
  "use strict";

  var PREFIX = "songShareThreadV1:";

  function key(id, trackIdx) {
    return PREFIX + String(id) + ":" + String(trackIdx);
  }

  function loadThread(id, trackIdx) {
    try {
      var raw = localStorage.getItem(key(id, trackIdx));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveThread(id, trackIdx, items) {
    localStorage.setItem(key(id, trackIdx), JSON.stringify(items));
  }

  function append(id, trackIdx, item) {
    var items = loadThread(id, trackIdx);
    items.push(item);
    saveThread(id, trackIdx, items);
    return items;
  }

  function totalItems(id, trackIdx) {
    return loadThread(id, trackIdx).length;
  }

  global.SongShareThread = {
    loadThread: loadThread,
    saveThread: saveThread,
    append: append,
    totalItems: totalItems,
  };
})(window);
