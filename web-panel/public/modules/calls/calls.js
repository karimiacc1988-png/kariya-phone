/* ==========================================================================
   ماژول «گزارش تماس‌ها» — خواندن CDR
   نوار ابزار: خروجی اکسل، چاپ، تازه‌سازی + بازه، جهت، نتیجه، داخلی، جستجو.
   افزودن دستی معنا ندارد، پس دکمه‌ی + در این بخش نیست.
   ========================================================================== */

import { el, icon, api, toast, toolBtn, jalali, clock, dur, prettyNumber, debounce, modal, contextMenu }
  from "../../assets/js/core.js";
import { makeTable } from "../../assets/js/table.js";

const DAY = 86400;

const DISPO_FA = {
  ANSWERED: ["پاسخ داده", "ok"],
  "NO ANSWER": ["بی‌پاسخ", "no"],
  BUSY: ["مشغول", "wait"],
  FAILED: ["ناموفق", "no"],
};

export function render(ctx) {
  const root = el("div", { class: "fade-in", style: "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0" });

  const filters = { range: "30", dir: "", dispo: "", ext: "", term: "" };

  /* ---------------- نوار ابزار ---------------- */

  const rangeSel = el("select", { class: "pill-select", "aria-label": "بازه زمانی" }, [
    el("option", { value: "1", text: "امروز" }),
    el("option", { value: "7", text: "۷ روز گذشته" }),
    el("option", { value: "30", text: "۳۰ روز گذشته", selected: true }),
    el("option", { value: "90", text: "۹۰ روز گذشته" }),
    el("option", { value: "0", text: "همه" }),
  ]);

  const dirSel = el("select", { class: "pill-select", "aria-label": "جهت تماس" }, [
    el("option", { value: "", text: "همه جهت‌ها" }),
    el("option", { value: "in", text: "ورودی" }),
    el("option", { value: "out", text: "خروجی" }),
  ]);

  const dispoSel = el("select", { class: "pill-select", "aria-label": "نتیجه تماس" }, [
    el("option", { value: "", text: "همه نتایج" }),
    el("option", { value: "ANSWERED", text: "پاسخ داده" }),
    el("option", { value: "NO ANSWER", text: "بی‌پاسخ" }),
    el("option", { value: "BUSY", text: "مشغول" }),
    el("option", { value: "FAILED", text: "ناموفق" }),
  ]);

  const extSel = el("select", { class: "pill-select", "aria-label": "داخلی" }, [
    el("option", { value: "", text: "همه داخلی‌ها" }),
  ]);

  const searchInput = el("input", { type: "search", placeholder: "جستجو در شماره، نام یا داخلی…", "aria-label": "جستجو" });
  const searchBox = el("div", { class: "search-box" }, [el("span", { html: icon("search", 16) }), searchInput]);

  const toolbar = el("div", { class: "toolbar" }, [
    toolBtn("download", "خروجی اکسل", exportExcel),
    toolBtn("print", "چاپ گزارش", () => window.print()),
    toolBtn("refresh", "تازه‌سازی", () => load()),
    el("span", { class: "sep" }),
    rangeSel, dirSel, dispoSel, extSel,
    el("span", { class: "grow" }),
    searchBox,
    el("span", { class: "sep" }),
    toolBtn("table_view", "نمای فشرده/عادی", toggleDense, "ghost"),
  ]);

  for (const s of [rangeSel, dirSel, dispoSel, extSel]) s.addEventListener("change", () => load());
  searchInput.addEventListener("input", debounce(() => { filters.term = searchInput.value.trim(); table.setRows(filterLocal()); }, 200));

  /* ---------------- ستون‌ها ---------------- */

  const cols = [
    { key: "date", title: "تاریخ", width: 84, value: r => r.start, render: r => jalali(r.start), copy: r => jalali(r.start) },
    { key: "time", title: "ساعت", width: 62, value: r => r.start % DAY, render: r => `<span class="num">${clock(r.start)}</span>` },
    {
      key: "dir", title: "جهت", width: 74,
      value: r => (r.dir === "in" ? "ورودی" : "خروجی"),
      render: r => `<span class="dir ${r.dir === "in" ? "in" : "out"}">${icon(r.dir === "in" ? "call_received" : "call_made", 15)}<span>${r.dir === "in" ? "ورودی" : "خروجی"}</span></span>`,
    },
    { key: "peer", title: "شماره طرف مقابل", width: 128, render: r => `<span class="num">${prettyNumber(r.peer)}</span>`, copy: r => r.peer },
    { key: "name", title: "نام", width: 168, render: r => r.name || `<span style="color:var(--muted)">—</span>` },
    { key: "ext", title: "داخلی", width: 60, type: "num", summary: false, render: r => `<span class="num">${r.ext}</span>` },
    { key: "extname", title: "کاربر داخلی", width: 116 },
    {
      key: "dispo", title: "نتیجه", width: 92,
      value: r => DISPO_FA[r.dispo][0],
      render: r => { const [fa, k] = DISPO_FA[r.dispo]; return `<span class="tag ${k}">${fa}</span>`; },
    },
    { key: "ring", title: "انتظار", width: 66, type: "num", format: n => dur(n), render: r => `<span class="num">${dur(r.ring)}</span>`, copy: r => r.ring },
    { key: "bill", title: "مکالمه", width: 72, type: "num", format: n => dur(n), render: r => `<span class="num">${dur(r.bill)}</span>`, copy: r => r.bill },
    { key: "trunk", title: "ترانک", width: 100 },
    {
      key: "recording", title: "فایل صوتی", width: 78, filter: false,
      value: r => (r.recording ? "دارد" : ""),
      render: r => r.recording
        ? `<span class="tag info">${icon("play_arrow", 13)}<span>پخش</span></span>`
        : `<span style="color:var(--muted)">—</span>`,
    },
  ];

  const table = makeTable(cols, {
    rows: [],
    idKey: "id",
    storageKey: "calls",
    onOpen: openCall,
    menuItems: row => [
      { label: "جزئیات تماس", icon: "grid_view", onClick: () => openCall(row) },
      { label: `تماس با ${prettyNumber(row.peer)}`, icon: "call", onClick: () => callBack(row) },
      row.recording ? { label: "پخش فایل صوتی", icon: "play_arrow", onClick: () => toast("پخش فایل پس از اتصال به سرور فعال می‌شود", "info") } : null,
      null,
      { label: "کپی شماره", icon: "content_copy", onClick: () => { navigator.clipboard?.writeText(row.peer); toast("شماره کپی شد", "ok"); } },
    ].filter(Boolean),
  });

  /* ---------------- داده ---------------- */

  let all = [];

  function filterLocal() {
    if (!filters.term) return all;
    const t = filters.term.toLowerCase();
    return all.filter(r => (r.peer + r.name + r.ext + r.extname).toLowerCase().includes(t));
  }

  async function load() {
    filters.range = rangeSel.value;
    filters.dir = dirSel.value;
    filters.dispo = dispoSel.value;
    filters.ext = extSel.value;

    const params = { dir: filters.dir, dispo: filters.dispo, ext: filters.ext };
    if (filters.range !== "0") params.from = Math.floor(Date.now() / 1000) - Number(filters.range) * DAY;

    try {
      const res = await api("cdr", params);
      all = res.rows;
      table.setRows(filterLocal());
    } catch (err) {
      toast(err.message, "err");
    }
  }

  /* پرکردن فهرست داخلی‌ها */
  api("extensions").then(res => {
    for (const e of res.rows) extSel.appendChild(el("option", { value: e.ext, text: `${e.ext} — ${e.name}` }));
  }).catch(() => {});

  /* ---------------- عملیات ---------------- */

  function openCall(row) {
    const [fa] = DISPO_FA[row.dispo];
    const line = (k, v) => el("div", { style: "display:flex;gap:8px;padding:6px 2px;font-size:12px" }, [
      el("span", { style: "color:var(--muted);min-width:96px", text: k }),
      el("b", { style: "font-weight:600", html: v }),
    ]);

    modal({
      title: "جزئیات تماس",
      iconName: "phone_in_talk",
      width: 470,
      body: el("div", {}, [
        line("تاریخ و ساعت", `${jalali(row.start)} — ${clock(row.start)}`),
        line("جهت", row.dir === "in" ? "ورودی" : "خروجی"),
        line("طرف مقابل", `<span class="num">${prettyNumber(row.peer)}</span>${row.name ? ` — ${row.name}` : ""}`),
        line("داخلی", `${row.ext} — ${row.extname}`),
        line("ترانک", row.trunk),
        line("نتیجه", fa),
        line("مدت انتظار", dur(row.ring)),
        line("مدت مکالمه", dur(row.bill)),
        line("فایل صوتی", row.recording ? "دارد" : "ندارد"),
      ]),
      actions: [
        { label: "تماس مجدد", kind: "ok", icon: "call", onClick: close => { close(); callBack(row); } },
        { label: "بستن", kind: "plain", onClick: close => close() },
      ],
    });
  }

  async function callBack(row) {
    try {
      await api("originate", { ext: ctx.me?.ext, number: row.peer }, { method: "POST" });
      toast(`در حال برقراری تماس با ${prettyNumber(row.peer)}`, "ok");
    } catch (err) { toast(err.message, "err"); }
  }

  /* خروجی اکسل بدون کتابخانه: CSV با BOM تا فارسی در اکسل درست باز شود */
  function exportExcel() {
    const rows = table.selected.length ? table.selected : table.visibleRows();
    if (!rows.length) { toast("ردیفی برای خروجی نیست", "err"); return; }
    const head = cols.map(c => c.title);
    const body = rows.map(r => cols.map(c => {
      const v = c.copy ? c.copy(r) : (c.value ? c.value(r) : r[c.key]);
      return `"${String(v ?? "").replace(/"/g, '""')}"`;
    }).join(","));
    const csv = "﻿" + [head.join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = el("a", { href: url, download: `گزارش-تماس-${jalali(Math.floor(Date.now() / 1000)).replace(/\//g, "-")}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`${rows.length} ردیف خروجی گرفته شد`, "ok");
  }

  let dense = false;
  function toggleDense() {
    dense = !dense;
    table.wrap.style.setProperty("--row-h", dense ? "28px" : "34px");
    table.wrap.querySelectorAll("tbody td").forEach(td => { td.style.height = dense ? "28px" : "34px"; });
    toast(dense ? "نمای فشرده" : "نمای عادی", "info");
  }

  root.append(toolbar, table.wrap, table.foot);
  load();
  return root;
}
