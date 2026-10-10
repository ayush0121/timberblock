/** Social share row. Every network plus a copy fallback that always works. */
import { SHARE_URL, APP_NAME } from "../config.js";

const ICONS = {
  WhatsApp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.3 1.3-1.9 1.3-.5 0-1.1.2-3.6-.8-3-1.3-5-4.4-5.1-4.6-.2-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.9 2c.1.2.1.4 0 .6l-.4.5-.3.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1c.2-.2.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z"/></svg>',
  X: '<svg viewBox="0 0 24 24"><path d="M17.5 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.1 21H2l7.3-8.3L2 3h6.4l4.4 5.9L17.5 3Zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3Z"/></svg>',
  Telegram: '<svg viewBox="0 0 24 24"><path d="M21.9 4.3 18.9 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-.9.5l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7.3 13.1l-4.5-1.4c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.3 1.3Z"/></svg>',
  Reddit: '<svg viewBox="0 0 24 24"><path d="M22 12a2.1 2.1 0 0 0-3.5-1.5 10.2 10.2 0 0 0-5.2-1.6l.9-4.1 2.9.6a1.7 1.7 0 1 0 .2-1.2l-3.5-.7a.6.6 0 0 0-.7.5l-1 4.9a10.3 10.3 0 0 0-5.3 1.6A2.1 2.1 0 1 0 4.2 15a4 4 0 0 0 0 .6c0 3 3.5 5.4 7.8 5.4s7.8-2.4 7.8-5.4a4 4 0 0 0 0-.6A2.1 2.1 0 0 0 22 12ZM8.2 13.4a1.4 1.4 0 1 1 1.4 1.4 1.4 1.4 0 0 1-1.4-1.4Zm7.8 3.9a5.4 5.4 0 0 1-4 1.2 5.4 5.4 0 0 1-4-1.2.5.5 0 0 1 .7-.7 4.5 4.5 0 0 0 3.3.9 4.5 4.5 0 0 0 3.3-.9.5.5 0 0 1 .7.7Zm-.6-2.5a1.4 1.4 0 1 1 1.4-1.4 1.4 1.4 0 0 1-1.4 1.4Z"/></svg>',
  Facebook: '<svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"/></svg>',
};

export function renderShare(host, message) {
  host.textContent = "";
  const url = SHARE_URL;
  const full = url ? message + " " + url : message;
  const enc = encodeURIComponent;

  const links = [
    ["WhatsApp", `https://wa.me/?text=${enc(full)}`],
    ["X", `https://twitter.com/intent/tweet?text=${enc(message)}${url ? `&url=${enc(url)}` : ""}`],
    ["Telegram", `https://t.me/share/url?url=${enc(url || message)}&text=${enc(message)}`],
    // Reddit titles are one line; the daily mosaic would be flattened into noise
    ["Reddit", `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(message.split("\n")[0])}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
  ];

  for (const [name, href] of links) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = ICONS[name] + `<span>${name}</span>`;
    host.appendChild(a);
  }

  if (navigator.share) {
    const b = document.createElement("button");
    b.textContent = "More";
    b.onclick = () =>
      navigator.share({ title: APP_NAME, text: message, url }).catch(() => {});
    host.appendChild(b);
  }

  const cp = document.createElement("button");
  cp.textContent = "Copy";
  cp.onclick = () => copy(full, cp);
  host.appendChild(cp);
}

export function copy(text, btn) {
  const done = () => {
    const was = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = was; btn.classList.remove("copied"); }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => legacy(text, done));
  } else legacy(text, done);
}

function legacy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
  ta.remove();
}
