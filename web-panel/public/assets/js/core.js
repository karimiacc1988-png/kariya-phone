/* ==========================================================================
   هسته‌ی مشترک «کاریا تلفن»
   اینجا فقط ابزارهای پایه است: ساخت DOM، تماس با API، قالب‌بندی، پیام، مودال.
   هیچ منطق ماژولی اینجا نوشته نمی‌شود — هر ماژول پوشه‌ی خودش را دارد.
   ========================================================================== */

import { icon } from "./icons.js";
export { icon };

/* ------------------------- ساخت DOM ------------------------- */

/** ساخت المان با ویژگی‌ها و فرزندان. attrs: {class, html, text, on:{click:fn}, ...} */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === "data") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/** دکمه‌ی ابزار استاندارد. متن بلند داخل دکمه ممنوع است — توضیح در title و aria-label. */
export function toolBtn(name, title, onClick, extraClass = "") {
  return el("button", {
    class: `tb ${extraClass}`.trim(),
    title,
    "aria-label": title,
    html: icon(name, 17),
    on: { click: onClick },
  });
}

export function q(sel, root = document) { return root.querySelector(sel); }
export function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/* ------------------------- قالب‌بندی ------------------------- */

const FA_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
                   "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/* تبدیل تاریخ با تقویم شمسی خود مرورگر انجام می‌شود تا کتابخانه‌ی اضافه لازم نباشد. */
const jDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
  year: "numeric", month: "2-digit", day: "2-digit",
});
const jParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
  year: "numeric", month: "numeric", day: "numeric",
});

/** «۱۴۰۵/۰۵/۱۷» با ارقام لاتین: 1405/05/17 */
export function jalali(ts) {
  return jDate.format(new Date(ts * 1000));
}

/** «۱۷ مرداد» برای سرتیتر و گروه‌بندی */
export function jalaliShort(ts) {
  const p = Object.fromEntries(jParts.formatToParts(new Date(ts * 1000)).map(x => [x.type, x.value]));
  return `${p.day} ${FA_MONTHS[Number(p.month) - 1]}`;
}

export function clock(ts) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function clockFull(ts) {
  const d = new Date(ts * 1000);
  return `${clock(ts)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** مدت زمان به شکل mm:ss یا h:mm:ss */
export function dur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function thousands(n) {
  return (n ?? 0).toLocaleString("en-US");
}

/** شماره‌ی تماس را خواناتر می‌کند: 02191001234 → 021 9100 1234 */
export function prettyNumber(v) {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length === 11 && s.startsWith("09")) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  if (s.length === 11 && s.startsWith("0")) return `${s.slice(0, 3)} ${s.slice(3, 7)} ${s.slice(7)}`;
  return v || "";
}

/* ------------------------- لایه‌ی API ------------------------- */

/* وقتی برنامه روی سرور ایزابل سرو شود، MOCK خودکار خاموش می‌شود.
   روی فایل محلی یا پورت پیش‌نمایش، داده‌ی نمونه از mock.js خوانده می‌شود. */
export const MOCK = !location.pathname.startsWith("/api")
  && (location.protocol === "file:" || !!location.port === true || location.hostname === "localhost");

let mockApi = null;
if (MOCK) mockApi = await import("./mock.js");

/** فراخوانی API — همه‌ی ماژول‌ها فقط از این تابع استفاده کنند. */
export async function api(path, params = null, options = {}) {
  if (MOCK) return mockApi.handle(path, params, options);
  const url = new URL(`api/${path}.php`, location.href);
  const init = { headers: { "Accept": "application/json" } };
  if (options.method === "POST") {
    init.method = "POST";
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(params || {});
  } else if (params) {
    for (const [k, v] of Object.entries(params)) if (v !== "" && v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`خطای ${res.status} در ${path}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

/* ------------------------- پیام کوتاه ------------------------- */

export function toast(text, kind = "info") {
  const box = q("#toasts");
  const ico = kind === "ok" ? "check_circle" : kind === "err" ? "cancel" : "fiber_manual_record";
  const t = el("div", { class: `toast ${kind}`, html: `${icon(ico, 18)}<span>${text}</span>` });
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove());
  }, 3400);
}

/* ------------------------- مودال ------------------------- */

/** مودال وسط صفحه. body یک المان است. actions آرایه‌ای از {label, kind, onClick}. */
export function modal({ title, iconName = "tune", body, actions = [], width = 560 }) {
  const veil = el("div", { class: "veil" });
  const close = () => { veil.classList.add("out"); veil.remove(); };

  const win = el("div", { class: "modal", style: `width: min(${width}px, calc(100vw - 32px))` }, [
    el("header", {}, [
      el("span", { html: icon(iconName, 19) }),
      el("span", { text: title }),
      el("button", { class: "tb ghost x", title: "بستن", "aria-label": "بستن", html: icon("close", 18), on: { click: close } }),
    ]),
    el("div", { class: "body" }, [body]),
    actions.length ? el("footer", {}, actions.map(a =>
      el("button", {
        class: `btn ${a.kind || ""}`.trim(),
        html: (a.icon ? icon(a.icon, 17) : "") + `<span>${a.label}</span>`,
        on: { click: () => a.onClick?.(close) },
      })
    )) : null,
  ]);

  veil.appendChild(win);
  veil.addEventListener("mousedown", e => { if (e.target === veil) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(veil);
  win.querySelector("input, select, textarea")?.focus();
  return { close, win };
}

/** تأیید ساده */
export function confirmBox(text, onYes, { danger = false, yes = "بله" } = {}) {
  modal({
    title: "تأیید",
    iconName: danger ? "delete" : "check_circle",
    width: 420,
    body: el("p", { class: "hint", text, style: "font-size:12px;padding:6px 2px 10px" }),
    actions: [
      { label: yes, kind: danger ? "danger" : "pri", icon: danger ? "delete" : "check_circle", onClick: c => { c(); onYes(); } },
      { label: "انصراف", kind: "plain", onClick: c => c() },
    ],
  });
}

/* ------------------------- منوی راست‌کلیک ------------------------- */

/** items: [{label, icon, onClick}] و null برای خط جداکننده */
export function contextMenu(x, y, items) {
  qa(".ctx").forEach(m => m.remove());
  const menu = el("div", { class: "ctx" });
  for (const it of items) {
    if (!it) { menu.appendChild(el("hr")); continue; }
    menu.appendChild(el("button", {
      html: icon(it.icon || "chevron_left", 16) + `<span>${it.label}</span>`,
      on: { click: () => { menu.remove(); it.onClick?.(); } },
    }));
  }
  document.body.appendChild(menu);
  // جای منو طوری تنظیم می‌شود که از لبه‌ی صفحه بیرون نزند
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  const kill = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", kill); } };
  setTimeout(() => document.addEventListener("mousedown", kill), 0);
}

/* ------------------------- باز کردن ردیف ------------------------- */

/* قرارداد پروژه: دبل‌کلیک فقط انتخاب می‌کند.
   باز کردن رکورد فقط با: سه‌کلیک، نگه‌داشتن کلید موس، راست‌کلیک یا Alt+E. */
export function bindRowOpen(tr, { onOpen, menuItems }) {
  let holdTimer = null;

  tr.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    holdTimer = setTimeout(() => { holdTimer = null; onOpen(); }, 520);
  });
  const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
  tr.addEventListener("mouseup", cancelHold);
  tr.addEventListener("mouseleave", cancelHold);

  tr.addEventListener("click", e => { if (e.detail === 3) onOpen(); });

  tr.addEventListener("contextmenu", e => {
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, menuItems ? menuItems() : [{ label: "باز کردن", icon: "grid_view", onClick: onOpen }]);
  });

  tr.addEventListener("keydown", e => {
    if (e.altKey && (e.key === "e" || e.key === "E")) { e.preventDefault(); onOpen(); }
  });
}

/* ------------------------- کمکی‌های ریز ------------------------- */

export function debounce(fn, ms = 220) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function now() { return Math.floor(Date.now() / 1000); }

/** ذخیره‌ی تنظیمات محلی کاربر (عرض ستون، فیلتر آخر و ...) */
export const prefs = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`kv.${key}`)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(`kv.${key}`, JSON.stringify(value)); },
};
