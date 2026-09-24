// DDLC asks the player to manage files outside the game window. Ren'Py Web
// keeps those files in an in-memory filesystem, so expose that directory here.
(() => {
  const files = ["monika.chr", "natsuki.chr", "sayori.chr", "yuri.chr"];
  const storageKey = "ddlc-deleted-characters";
  const deleted = new Set(
    JSON.parse(localStorage.getItem(storageKey) || "[]").filter((name) =>
      files.includes(name),
    ),
  );

  function fileSystemReady() {
    try {
      return files.every(
        (name) => FS.readdir("/characters").includes(name) || deleted.has(name),
      );
    } catch {
      return false;
    }
  }

  function exists(name) {
    try {
      return FS.readdir("/characters").includes(name);
    } catch {
      return false;
    }
  }

  function saveDeleted() {
    localStorage.setItem(storageKey, JSON.stringify([...deleted]));
  }

  const style = document.createElement("style");
  style.textContent = `
    #character-files-toggle { position: fixed; z-index: 30; top: 10px; right: 12px;
      padding: 7px 12px; border: 1px solid #f38cba; border-radius: 8px;
      background: #fff; color: #713852; font: 600 14px sans-serif; cursor: pointer; }
    #character-files-panel { position: fixed; z-index: 31; top: 52px; right: 12px;
      width: min(320px, calc(100vw - 24px)); padding: 16px; border-radius: 12px;
      border: 2px solid #f38cba; background: #fff; color: #402739;
      box-shadow: 0 12px 32px #0008; font: 14px sans-serif; }
    #character-files-panel[hidden] { display: none; }
    #character-files-panel h2 { margin: 0 0 6px; font-size: 17px; }
    #character-files-panel p { margin: 0 0 12px; line-height: 1.35; }
    #character-files-panel ul { list-style: none; padding: 0; margin: 0 0 12px; }
    #character-files-panel li { display: flex; justify-content: space-between;
      align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid #f5dae7; }
    #character-files-panel button { border: 1px solid #d87ba5; border-radius: 6px;
      padding: 5px 8px; background: #ffebf4; color: #713852; cursor: pointer; }
    #character-files-panel button:disabled { opacity: .55; cursor: default; }
    #character-files-panel .file-actions { display: flex; justify-content: flex-end; gap: 8px; }
  `;
  document.head.append(style);

  const toggle = document.createElement("button");
  toggle.id = "character-files-toggle";
  toggle.type = "button";
  toggle.textContent = "Character files";
  toggle.setAttribute("aria-controls", "character-files-panel");
  toggle.setAttribute("aria-expanded", "false");

  const panel = document.createElement("section");
  panel.id = "character-files-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Character files");

  function render() {
    panel.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Character files";
    panel.append(heading);
    const hint = document.createElement("p");
    hint.textContent = "Files in the game's characters folder.";
    panel.append(hint);

    const list = document.createElement("ul");
    for (const name of files) {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = exists(name) ? "Delete" : "Deleted";
      remove.disabled = !exists(name);
      remove.setAttribute("aria-label", `Delete ${name}`);
      remove.addEventListener("click", () => {
        FS.unlink(`/characters/${name}`);
        deleted.add(name);
        saveDeleted();
        render();
      });
      row.append(label, remove);
      list.append(row);
    }
    panel.append(list);

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Restore files and reload";
    restore.disabled = deleted.size === 0;
    restore.addEventListener("click", () => {
      deleted.clear();
      saveDeleted();
      location.reload();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => toggle.click());
    actions.append(restore, close);
    panel.append(actions);
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) render();
  });

  document.body.append(toggle, panel);
  const ready = setInterval(() => {
    if (!fileSystemReady()) return;
    clearInterval(ready);
    for (const name of deleted) {
      if (exists(name)) FS.unlink(`/characters/${name}`);
    }
    if (!panel.hidden) render();
  }, 250);
})();
