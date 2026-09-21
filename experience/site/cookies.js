// Shared by the page and service-worker engines. Keep the existing IndexedDB
// schema so deployed sessions survive the update.
(() => {
  const Base = self.Ultraviolet;
  const domainMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);
  const defaultPath = (pathname) => pathname.slice(0, pathname.lastIndexOf("/")) || "/";
  const expired = (cookie, now = Date.now()) => {
    if (cookie.maxAge !== undefined) {
      return cookie.maxAge <= 0 || new Date(cookie.set).getTime() + cookie.maxAge * 1000 <= now;
    }
    return cookie.expires !== undefined && new Date(cookie.expires).getTime() <= now;
  };

  self.Ultraviolet = class extends Base {
    constructor(...args) {
      super(...args);
      const cookie = this.cookie;
      let visible = Array.isArray(self.__uv$cookieRecords) ? self.__uv$cookieRecords : null;

      cookie.validateCookie = (value, meta, js = false) => {
        if (js && value.httpOnly) return false;
        if (expired(value)) return false;
        const domain = value.domain.replace(/^\./, "").toLowerCase();
        if (value.hostOnly ? meta.url.hostname !== domain : !domainMatches(meta.url.hostname, domain)) return false;
        if (value.secure && !["https:", "wss:"].includes(meta.url.protocol)) return false;
        const path = value.path || "/";
        return meta.url.pathname === path ||
          (meta.url.pathname.startsWith(path) && (path.endsWith("/") || meta.url.pathname[path.length] === "/"));
      };

      cookie.serialize = (values = [], meta, js) => {
        const selected = values.filter((value) => cookie.validateCookie(value, meta, js));
        // Servers take the first cookie with a given name.
        selected.sort((a, b) => b.path.length - a.path.length);
        if (js) visible = selected;
        return selected.map((value) => `${value.name}=${value.value}`).join("; ");
      };

      // Preserve scope metadata alongside the page's existing JS cookie view.
      // It contains only cookies already visible to that page, never HttpOnly.
      const snapshot = () => `self.__uv$cookieRecords=${JSON.stringify(visible || []).replace(/</g, "\\u003c")};`;
      const injectHtml = this.createHtmlInject;
      this.createHtmlInject = (...values) => {
        const nodes = injectHtml(...values);
        nodes[0].childNodes[0].value += snapshot();
        return nodes;
      };
      const injectJs = this.createJsInject;
      this.createJsInject = (...values) => injectJs(...values) + snapshot();

      cookie.updateCookieString = (current, value, meta) => {
        const domain = (value.domain || meta.url.hostname).replace(/^\./, "").toLowerCase();
        const path = value.path?.startsWith("/") ? value.path : defaultPath(meta.url.pathname);
        const stored = { ...value, domain: `.${domain}`, hostOnly: !value.domain, path, set: new Date() };
        // Check scope without expiry: an expired write deletes the old value.
        if (!cookie.validateCookie({ ...stored, maxAge: undefined, expires: undefined }, meta, true)) return current;
        // Older cached documents did not include scope metadata.
        const previous = visible || cookie.setCookie(current.split(/;\s*/), { decodeValues: false })
          .map((entry) => ({ ...entry, domain: `.${domain}`, path }));
        const next = previous.filter((entry) => entry.name !== stored.name ||
          entry.domain.replace(/^\./, "") !== domain || entry.path !== path);
        if (!expired(stored)) next.push(stored);
        return cookie.serialize(next, meta, true);
      };

      cookie.getCookies = async (db) => {
        const values = await db.getAll("cookies");
        const stale = values.filter((value) => expired(value));
        await Promise.all(stale.map((value) => db.delete("cookies", value.id)));
        return values.filter((value) => !expired(value));
      };

      cookie.setCookies = async (data, db, meta) => {
        if (!db) return false;
        await Promise.all(cookie.setCookie(data, { decodeValues: false }).map(async (value) => {
          const hostOnly = !value.domain;
          const domain = (value.domain || meta.url.hostname).replace(/^\./, "").toLowerCase();
          if (!domainMatches(meta.url.hostname, domain)) return;
          const path = value.path?.startsWith("/") ? value.path : defaultPath(meta.url.pathname);
          const id = `.${domain}@${path}@${value.name}`;
          const stored = { ...value, domain: `.${domain}`, hostOnly, path, id, set: new Date() };
          if (expired(stored)) await db.delete("cookies", id);
          else await db.put("cookies", stored);
        }));
        return true;
      };
    }
  };
})();
