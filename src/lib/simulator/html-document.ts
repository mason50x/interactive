// The opaque frame receives only its own saved JSON, never auth or application storage.
// Its native keyboard, mouse and wheel events stay inside the document.
export function htmlDocument(
  source: string,
  token: string,
  initialJson: string | null,
) {
  const doc = new DOMParser().parseFromString(source, "text/html");
  // Enforce the policy before any imported content is parsed/executed in the live frame.
  doc
    .querySelectorAll(
      'base, meta[http-equiv="refresh" i], meta[http-equiv="content-security-policy" i]',
    )
    .forEach((e) => e.remove());
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const bootstrap = doc.createElement("script");
  const safe = (value: unknown) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  bootstrap.textContent = `(() => {
    const token = ${safe(token)};
    let state = ${safe(initialJson ? JSON.parse(initialJson) : null)};
    let next = 0;
    const pending = new Map();
    function request(type, value) {
      if (pending.size >= 20) return Promise.reject(new Error('Too many pending saves. Await simulator.save().'));
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Local save timed out.')); }, 15000);
        pending.set(id, {resolve, reject, timer});
        parent.postMessage({channel:'interactive-html', token, id, type, value}, '*');
      });
    }
    addEventListener('message', event => {
      if (event.source !== parent || event.data?.token !== token || event.data?.channel !== 'interactive-html') return;
      const message = event.data;
      if (message.type === 'request-save') {
        dispatchEvent(new CustomEvent('simulator:save-request'));
        return;
      }
      const job = pending.get(message.id);
      if (!job) return;
      clearTimeout(job.timer); pending.delete(message.id);
      if (message.error) job.reject(new Error(message.error)); else job.resolve(message.value);
    });
    Object.defineProperty(window, 'simulator', { value: Object.freeze({
      version: 1,
      async load() { await request('ready'); return structuredClone(state); },
      async save(value) {
        const json = JSON.stringify(value);
        if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > 262144) throw new Error('Progress must be JSON up to 256 KiB.');
        const copy = JSON.parse(json);
        await request('save', copy); state = copy;
      }
    }) });
    addEventListener('click', event => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link && !link.getAttribute('href').startsWith('#')) event.preventDefault();
    }, true);
  })();`;
  doc.head.prepend(policy, bootstrap);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
