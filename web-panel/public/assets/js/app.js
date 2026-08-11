/* ==========================================================================
   پوسته‌ی برنامه: نوار بالا، منوی کناری و مسیریاب
   هر بخش یک ماژول در public/modules/<نام>/<نام>.js است که تابع render(ctx)
   دارد و یک المان برمی‌گرداند. اگر المان متد cleanup داشته باشد، هنگام خروج
   از بخش صدا زده می‌شود تا تایمرها بسته شوند.
   ========================================================================== */

import { el, icon, api, toast, MOCK, q, prefs, prettyNumber } from "./core.js";

const SECTIONS = [
  { id: "desk", label: "میز کار تماس", icon: "headset_mic", group: "کار روزانه", load: () => import("../../modules/desk/desk.js") },
  { id: "calls", label: "گزارش تماس‌ها", icon: "history", group: "کار روزانه", load: () => import("../../modules/calls/calls.js") },
  { id: "contacts", label: "مشتریان", icon: "person", group: "کار روزانه", load: () => import("../../modules/contacts/contacts.js") },
  { id: "extensions", label: "داخلی‌ها", icon: "group", group: "مرکز تلفن", load: () => import("../../modules/extensions/extensions.js") },
  { id: "trunks", label: "ترانک‌ها", icon: "hub", group: "مرکز تلفن", load: () => import("../../modules/trunks/trunks.js") },
  { id: "settings", label: "تنظیمات", icon: "tune", group: "مرکز تلفن", load: () => import("../../modules/settings/settings.js") },
];

// شماره‌ی کاربر یک بار ذخیره می‌شود و منبع اصلی هویت اوست.
// status سرور هرگز نباید رویش را بنویسد، وگرنه هر ۱۵ ثانیه پاک می‌شود.
const savedMe = prefs.get("myNumber", null);
const ctx = {
  me: savedMe ? { ext: savedMe.number, name: savedMe.label, role: "کاربر" } : null,
  status: null,
};

/* ---------------- نوار بالا ---------------- */

function buildTopbar() {
  const state = el("div", { id: "pbx-state", class: "off" }, [
    el("span", { class: "pulse" }),
    el("span", { id: "pbx-text", text: "در حال اتصال…" }),
  ]);

  return el("div", { id: "topbar" }, [
    el("button", {
      class: "top-btn", id: "burger", title: "منو", "aria-label": "باز و بسته کردن منو",
      html: icon("menu", 20), on: { click: () => q("#side").classList.toggle("open") },
    }),
    el("div", { class: "brand-mark" }, [
      el("span", { class: "dot" }, [
        el("img", { src: "assets/img/logo.png", alt: "کاریا", width: "20", height: "20" }),
      ]),
      el("span", { text: "کاریا تلفن" }),
    ]),
    state,
    el("span", { class: "top-spacer" }),
    el("button", { class: "top-btn", title: "تازه‌سازی صفحه", "aria-label": "تازه‌سازی", html: icon("refresh", 19), on: { click: () => route(true) } }),
    el("div", {
      class: "top-user", id: "top-user", style: "cursor:pointer",
      on: { click: () => { location.hash = "#/settings"; } },
    }, [
      el("div", { class: "who" }, [el("b", { text: "…" }), el("span", { text: "" })]),
      el("div", { class: "av", text: "؟" }),
    ]),
  ]);
}

/* ---------------- منوی کناری ---------------- */

function buildSide() {
  const side = el("nav", { id: "side", "aria-label": "منوی اصلی" });
  let lastGroup = null;
  for (const s of SECTIONS) {
    if (s.group !== lastGroup) {
      side.appendChild(el("div", { class: "nav-group", text: s.group }));
      lastGroup = s.group;
    }
    side.appendChild(el("a", {
      class: "nav-item", href: `#/${s.id}`, data: { sec: s.id },
      html: icon(s.icon, 19) + `<span>${s.label}</span>`,
    }));
  }
  side.appendChild(el("div", { class: "side-foot", html: "کاریا حساب · نسخه ۰٫۱" }));
  return side;
}

/* ---------------- مسیریاب ---------------- */

let current = null;

async function route(force = false) {
  const id = (location.hash.replace(/^#\/?/, "") || "desk").split("?")[0];
  const sec = SECTIONS.find(s => s.id === id) || SECTIONS[0];

  if (!force && current?.id === sec.id) return;

  /* بستن تایمرهای بخش قبلی */
  current?.node?.cleanup?.();

  for (const a of document.querySelectorAll(".nav-item")) a.classList.toggle("on", a.dataset.sec === sec.id);
  document.title = `${sec.label} — کاریا تلفن`;

  const view = q("#view");
  view.innerHTML = `<div class="empty">${icon("sync_alt", 30)}<span>در حال بارگذاری…</span></div>`;

  try {
    const mod = await sec.load();
    const node = mod.render(ctx);
    view.innerHTML = "";
    view.appendChild(node);
    current = { id: sec.id, node };
  } catch (err) {
    view.innerHTML = `<div class="empty">${icon("cancel", 34)}<span>خطا در بارگذاری بخش: ${err.message}</span></div>`;
  }
}

/* گوشه‌ی کاربر بالای صفحه — شماره‌ی ذخیره‌شده را نشان می‌دهد و با کلیک به تنظیمات می‌برد */
function drawUser() {
  const user = q("#top-user");
  if (!user) return;
  const me = ctx.me;
  user.querySelector("b").textContent = me?.name || (me?.ext ? "شماره‌ی من" : "شماره ثبت نشده");
  user.querySelector("span").textContent = me?.ext ? prettyNumber(me.ext) : "برای ثبت کلیک کنید";
  user.querySelector(".av").innerHTML = me?.ext ? icon("headset_mic", 14) : icon("edit", 13);
  user.title = me?.ext ? `تماس‌ها اول به ${prettyNumber(me.ext)} وصل می‌شوند — برای تغییر کلیک کنید` : "شماره‌ی خود را ثبت کنید";
}

/* ---------------- وضعیت مرکز تلفن ---------------- */

async function loadStatus() {
  const box = q("#pbx-state");
  const text = q("#pbx-text");
  try {
    const s = await api("status");
    ctx.status = s;
    // شماره‌ی ذخیره‌شده‌ی کاربر همیشه برنده است؛ سرور فقط وقتی چیزی ذخیره نشده حرف می‌زند
    if (!prefs.get("myNumber", null) && s.me?.ext) ctx.me = s.me;
    box.classList.toggle("off", !s.connected);
    text.textContent = s.connected
      ? `${s.pbx} · ${s.channels} تماس فعال · ${s.trunkChannels.used}/${s.trunkChannels.total} کانال`
      : "ارتباط با مرکز تلفن برقرار نیست";

    drawUser();
  } catch {
    box.classList.add("off");
    text.textContent = "ارتباط با مرکز تلفن برقرار نیست";
  }
}

/* ---------------- راه‌اندازی ---------------- */

const shell = el("div", { id: "shell" }, [
  buildTopbar(),
  buildSide(),
  el("main", { id: "main" }, [
    el("div", { id: "view" }),
    el("div", { id: "statusbar" }, [
      el("span", { id: "sb-left", text: "آماده" }),
      el("span", { class: "sp" }),
      MOCK ? el("span", { class: "mock", html: `${icon("block", 13)}<span>حالت نمایشی — به مرکز تلفن وصل نیست</span>` }) : null,
    ]),
  ]),
]);

document.body.appendChild(shell);
document.body.appendChild(el("div", { id: "toasts" }));

window.addEventListener("hashchange", () => route());
// وقتی کاربر شماره‌اش را در تنظیمات ذخیره کرد، گوشه‌ی بالا هم فوری به‌روز شود
window.addEventListener("kariya:me-changed", drawUser);

drawUser();   // همان اول، شماره‌ی ذخیره‌شده را نشان بده

await loadStatus();
setInterval(loadStatus, 15000);
await route();

if (MOCK) toast("حالت نمایشی: داده‌ها نمونه است", "info");
