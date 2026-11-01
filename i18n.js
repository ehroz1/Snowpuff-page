/* Language: ?lang= in the address, then the visitor's earlier choice, then the system language.
   Russian is written into the page; English replaces it by data-i18n keys. */
(() => {
  "use strict";

  const RU_FAMILY = ["ru", "uk", "be", "kk", "ky", "uz", "tg", "hy", "az", "ka"];

  function pick() {
    const asked = new URLSearchParams(location.search).get("lang");
    if (asked === "ru" || asked === "en") return asked;
    try {
      const saved = localStorage.getItem("snowpuff-lang");
      if (saved === "ru" || saved === "en") return saved;
    } catch {}
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (const l of langs) {
      const base = String(l).toLowerCase().split("-")[0];
      if (RU_FAMILY.includes(base)) return "ru";
      if (base === "en") return "en";
    }
    return "en";
  }

  const EN = {
    "meta.title": "Snowpuff — it’s snowing on your desktop",
    "meta.description": "Snowpuff for macOS and Windows: quiet, warm snow over all your windows. It settles on their edges, piles into drifts and scatters from your cursor.",
    "hero.title": "It’s snowing <em>on your desktop</em>",
    "hero.lead": "Quiet, warm snow over all your windows. It settles on their edges, piles up into drifts and scatters when you sweep the mouse through it.",
    "hero.free": "free",
    "hero.source": "open source",
    "hero.aside": "And here’s a snowdrift.<br>Sweep your cursor through it",
    "win.kicker": "On your windows",
    "win.title": "It settles where it lands",
    "win.body": "Snow gathers on the edges of windows, on the Dock and the taskbar. Jerk a window by its title bar and the snow slides off, icicles and all.",
    "win.file": "tangerines.txt",
    "win.hint": "give me a shake",
    "win.note": "<p>— buy tangerines</p><p>— find the fairy lights</p><p>— <s>clear the snow off the window</s> let it be</p>",
    "win.menuNote": "This is the real menu, same as in the app. Pick Heavy, switch off Melt Snow and watch the drift grow.",
    "m.snowfall": "Snowfall",
    "m.off": "Off",
    "m.light": "Light",
    "m.steady": "Steady",
    "m.heavy": "Heavy",
    "m.variable": "Variable",
    "m.accumulate": "Accumulate",
    "m.melt": "Melt Snow",
    "m.onWindows": "Snow on Windows",
    "m.icicles": "Icicles",
    "m.warm": "Warm Window Light",
    "m.clear": "Clear Snow",
    "m.puff": "Blow on the Snow (Microphone)",
    "m.support": "Support the Author ♥",
    "m.more": "More Apps — ehroz.pro",
    "m.quit": "Quit Snowpuff",
    "f.title": "What else it does",
    "f.sweep.title": "It scatters",
    "f.sweep.body": "Sweep through the drift. Yes, this one right here.",
    "f.ice.title": "It grows icicles",
    "f.ice.body": "Under windows with snow on them, icicles slowly grow. Jerk the window and they snap off and shatter.",
    "f.mic.title": "It listens.",
    "f.mic.body": "Blow at the screen and the snow flies. The microphone only listens for a breath and records nothing.",
    "f.mic.try": "Blow",
    "f.spec": "Five kinds of snowfall · drifts on the Dock and taskbar · warm light from the active window · wind and fireplace sounds · hides during calls and in screenshots · melts instead of burying your screen · easy on the battery · updates itself",
    "end.title": "It piled up while you scrolled",
    "end.sub": "The cat’s already asleep. Take the snow home.",
    "help.summary": "Won’t open?",
    "help.mac": "The app isn’t signed with an Apple certificate, so macOS stops it the first time. Open System Settings → Privacy &amp; Security and click “Open Anyway”. You only need to do this once.",
    "help.win": "No admin rights needed. If SmartScreen warns about an unknown publisher, click “More info → Run anyway”.",
    "foot.support": "Support the author ♥",
    "foot.more": "More apps — ehroz.pro",
    "foot.source": "Source on GitHub",
    "foot.credit": "Made by <a href=\"https://ehroz.pro\">ehroz.pro</a> · based on <a href=\"https://github.com/mbezruchko/Snowhush\">Snowhush</a> (MIT)",
  };

  // Strings that change with the chosen system.
  const DYN = {
    ru: {
      download: { mac: "Скачать для macOS", win: "Скачать для Windows" },
      other: { mac: "или для Windows", win: "или для macOS" },
      req: { mac: "macOS 14+", win: "Windows 10 и 11" },
      reqLong: { mac: "macOS 14 и новее, Apple Silicon и Intel", win: "Windows 10 и 11, без прав администратора" },
      switchShort: "EN",
      switchLong: "English",
    },
    en: {
      download: { mac: "Download for macOS", win: "Download for Windows" },
      other: { mac: "or for Windows", win: "or for macOS" },
      req: { mac: "macOS 14+", win: "Windows 10 and 11" },
      reqLong: { mac: "macOS 14 or later, Apple Silicon and Intel", win: "Windows 10 and 11, no admin rights needed" },
      switchShort: "RU",
      switchLong: "Русский",
    },
  };

  const lang = pick();
  document.documentElement.lang = lang;
  if (lang === "en") document.documentElement.classList.add("i18n-pending");

  const original = new Map();

  function apply(to) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (!original.has(el)) original.set(el, el.innerHTML);
      el.innerHTML = to === "en" && EN[key] ? EN[key] : original.get(el);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      const [attr, key] = el.dataset.i18nAttr.split(":");
      const store = "orig" + attr;
      if (!(store in el.dataset)) el.dataset[store] = el.getAttribute(attr) || "";
      el.setAttribute(attr, to === "en" && EN[key] ? EN[key] : el.dataset[store]);
    });
    document.documentElement.lang = to;
    document.documentElement.classList.remove("i18n-pending");
    window.I18N.lang = to;
    document.dispatchEvent(new CustomEvent("langchange", { detail: to }));
  }

  window.I18N = {
    lang,
    dyn: () => DYN[window.I18N.lang],
    set(to) {
      try { localStorage.setItem("snowpuff-lang", to); } catch {}
      apply(to);
    },
  };

  document.addEventListener("DOMContentLoaded", () => apply(lang));
})();
