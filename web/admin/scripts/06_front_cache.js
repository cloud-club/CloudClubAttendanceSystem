window.AdminFrontCache = (function createAdminFrontCache() {
  'use strict';

  const values = new Map();
  const inflight = new Map();

  function now() {
    return Date.now();
  }

  function normalizeKey(key) {
    return String(key || '').trim();
  }

  function isFresh(entry) {
    return !!entry && entry.expiresAt > now();
  }

  function get(key) {
    const normalized = normalizeKey(key);
    if (!normalized) return null;

    const entry = values.get(normalized);
    if (!isFresh(entry)) {
      values.delete(normalized);
      return null;
    }

    return entry.value;
  }

  function set(key, value, ttlMs) {
    const normalized = normalizeKey(key);
    if (!normalized) return value;

    const ttl = Math.max(0, Number(ttlMs || 0));
    const expiresAt = now() + ttl;
    values.set(normalized, {
      value,
      expiresAt,
      createdAt: now(),
      ttlMs: ttl
    });
    return value;
  }

  function del(key) {
    const normalized = normalizeKey(key);
    if (!normalized) return;
    values.delete(normalized);
    inflight.delete(normalized);
  }

  function invalidate(key) {
    del(key);
  }

  function invalidateStartsWith(prefix) {
    const normalized = normalizeKey(prefix);
    if (!normalized) return;

    Array.from(values.keys()).forEach((key) => {
      if (key.indexOf(normalized) === 0) {
        values.delete(key);
      }
    });

    Array.from(inflight.keys()).forEach((key) => {
      if (key.indexOf(normalized) === 0) {
        inflight.delete(key);
      }
    });
  }

  function clear() {
    values.clear();
    inflight.clear();
  }

  async function remember(key, ttlMs, loader, options) {
    const normalized = normalizeKey(key);
    if (!normalized) {
      return loader();
    }

    const opts = options || {};
    if (!opts.force) {
      const cached = get(normalized);
      if (cached !== null) {
        return cached;
      }
    }

    if (inflight.has(normalized)) {
      return inflight.get(normalized);
    }

    const task = Promise.resolve()
      .then(() => loader())
      .then((value) => {
        if (!opts.skipStore) {
          set(normalized, value, ttlMs);
        }
        return value;
      })
      .finally(() => {
        inflight.delete(normalized);
      });

    inflight.set(normalized, task);
    return task;
  }

  return {
    get,
    set,
    delete: del,
    invalidate,
    invalidateStartsWith,
    clear,
    remember
  };
})();
