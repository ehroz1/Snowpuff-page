/* Download links for the visitor's system, the macOS/Windows switch and the language switch. */
(() => {
  "use strict";

  const LINKS = {
    mac: "https://github.com/ehroz1/Snowpuff/releases/latest/download/Snowpuff.dmg",
    win: "https://github.com/ehroz1/Snowpuff/releases/latest/download/Snowpuff-Setup.exe",
  };
  const ua = navigator.userAgent + " " + (navigator.userAgentData?.platform || navigator.platform || "");
  let os = /win/i.test(ua) ? "win" : "mac";

  function render() {
    const t = window.I18N.dyn();
    document.querySelectorAll("[data-download]").forEach((a) => { a.href = LINKS[os]; });
    document.querySelectorAll("[data-dl-label]").forEach((el) => { el.textContent = t.download[os]; });
    document.querySelectorAll("[data-os-other]").forEach((el) => { el.textContent = t.other[os]; });
    document.querySelectorAll("[data-req]").forEach((el) => { el.textContent = t.req[os]; });
    document.querySelectorAll("[data-req-long]").forEach((el) => { el.textContent = t.reqLong[os]; });
    document.querySelectorAll("[data-os]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.os === os)));
    document.querySelectorAll("[data-help]").forEach((p) => { p.hidden = p.dataset.help !== os; });
    document.querySelectorAll("[data-lang-switch]").forEach((b) => {
      b.textContent = b.classList.contains("lang--foot") ? t.switchLong : t.switchShort;
    });
  }

  document.addEventListener("click", (e) => {
    const other = e.target.closest("[data-os-other]");
    const pick = e.target.closest("[data-os]");
    const lang = e.target.closest("[data-lang-switch]");
    if (other) { os = os === "mac" ? "win" : "mac"; render(); }
    if (pick) { os = pick.dataset.os; render(); }
    if (lang) window.I18N.set(window.I18N.lang === "ru" ? "en" : "ru");
  });

  document.addEventListener("langchange", render);

  // the menu bar clock shows the visitor's time
  function tick() {
    const opts = { weekday: "short", hour: "2-digit", minute: "2-digit" };
    const text = new Date().toLocaleString(window.I18N.lang === "ru" ? "ru-RU" : "en-US", opts);
    document.querySelectorAll("[data-clock]").forEach((el) => { el.textContent = text; });
  }
  document.addEventListener("langchange", tick);
  setInterval(tick, 30000);
})();
