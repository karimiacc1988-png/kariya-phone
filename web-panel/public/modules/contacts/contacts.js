/* ==========================================================================
   ماژول «مشتریان» — حالت CRM
   فهرست مشتریان، و با باز کردن هر مشتری: پرونده‌اش شامل تاریخچه‌ی همه‌ی
   تماس‌ها، آمار، و یادداشت‌ها. نام‌های اینجا در گزارش تماس‌ها هم می‌نشینند.
   ========================================================================== */

import { el, icon, api, toast, toolBtn, modal, confirmBox, prettyNumber,
         jalali, clock, dur, debounce } from "../../assets/js/core.js";
import { makeTable } from "../../assets/js/table.js";

const DISPO_FA = {
  ANSWERED: ["پاسخ داده", "ok"],
  "NO ANSWER": ["بی‌پاسخ", "no"],
  BUSY: ["مشغول", "wait"],
  FAILED: ["ناموفق", "no"],
};

export function render(ctx) {
  const root = el("div", { class: "fade-in", style: "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0" });

  const searchInput = el("input", { type: "search", placeholder: "جستجو در نام، شرکت یا شماره…", "aria-label": "جستجو" });
  const searchBox = el("div", { class: "search-box" }, [el("span", { html: icon("search", 16) }), searchInput]);

  const delBtn = toolBtn("delete", "حذف انتخاب‌شده‌ها", removeSelected, "danger");
  delBtn.disabled = true;

  const toolbar = el("div", { class: "toolbar" }, [
    toolBtn("add", "افزودن مشتری", () => edit(null), "primary"),
    toolBtn("download", "خروجی اکسل", exportCsv),
    toolBtn("print", "چاپ", () => window.print()),
    delBtn,
    toolBtn("refresh", "تازه‌سازی", () => load()),
    el("span", { class: "grow" }),
    searchBox,
  ]);

  searchInput.addEventListener("input", debounce(() => load(searchInput.value.trim()), 250));

  const cols = [
    { key: "name", title: "نام", width: 180 },
    { key: "company", title: "شرکت", width: 160, render: r => r.company || `<span style="color:var(--muted)">—</span>` },
    { key: "number", title: "شماره", width: 130, render: r => `<span class="num">${prettyNumber(r.number)}</span>`, copy: r => r.number },
    { key: "note", title: "توضیح", width: 200, render: r => r.note || `<span style="color:var(--muted)">—</span>` },
    {
      key: "call", title: "تماس", width: 74, filter: false, sort: false,
      render: () => `<span class="tag ok">${icon("call", 13)}<span>تماس</span></span>`,
      copy: () => "",
    },
  ];

  const table = makeTable(cols, {
    rows: [], idKey: "norm", storageKey: "contacts",
    onOpen: openProfile,
    onSelectionChange: sel => { delBtn.disabled = sel.length === 0; },
    menuItems: row => [
      { label: "پرونده مشتری", icon: "grid_view", onClick: () => openProfile(row) },
      { label: `تماس با ${prettyNumber(row.number)}`, icon: "call", onClick: () => callNow(row.number) },
      { label: "ویرایش", icon: "edit", onClick: () => edit(row) },
      null,
      { label: "حذف", icon: "delete", onClick: () => removeOne(row) },
    ],
  });

  // کلیک روی ستون «تماس» مستقیم زنگ می‌زند
  table.wrap.addEventListener("click", e => {
    const cell = e.target.closest("td");
    if (!cell || cell.cellIndex !== cols.length + 1) return;
    const tr = cell.closest("tr");
    const norm = all[[...tr.parentNode.children].indexOf(tr)];
    if (norm) callNow(norm.number);
  });

  let all = [];

  async function load(term = "") {
    try {
      const res = await api("contacts", term ? { term } : null);
      all = res.rows;
      table.setRows(all);
      delBtn.disabled = true;
    } catch (err) { toast(err.message, "err"); }
  }

  async function callNow(number) {
    if (!ctx.me?.ext) { toast("اول شماره‌ی خود را در تنظیمات ثبت کنید", "err"); return; }
    try {
      await api("originate", { from: ctx.me.ext, number }, { method: "POST" });
      toast(`در حال تماس با ${prettyNumber(number)} — اول به شما زنگ می‌خورد`, "ok");
    } catch (err) { toast(err.message, "err"); }
  }

  /* ---------------- فرم مشتری ---------------- */

  function edit(row) {
    const f = {
      name: el("input", { value: row?.name || "", placeholder: "نام مشتری" }),
      company: el("input", { value: row?.company || "", placeholder: "نام شرکت (اختیاری)" }),
      number: el("input", { value: row?.number || "", inputmode: "tel", placeholder: "09121234567", style: "direction:ltr;text-align:center" }),
      note: el("textarea", { text: row?.note || "", placeholder: "توضیح اختیاری" }),
    };
    if (row) f.number.disabled = true;

    const field = (label, node, hint) => el("div", { class: "field" }, [
      el("label", { text: label }), node, hint ? el("div", { class: "hint", text: hint }) : null,
    ]);

    modal({
      title: row ? `ویرایش ${row.name}` : "افزودن مشتری",
      iconName: row ? "edit" : "add", width: 480,
      body: el("div", {}, [
        el("div", { class: "grid2" }, [field("نام", f.name), field("شرکت", f.company)]),
        field("شماره تماس", f.number, "هر شکلی بنویسید — با ۰ یا بدون ۰ یا با +۹۸ — سیستم خودش یکسان می‌کند."),
        field("توضیح", f.note),
      ]),
      actions: [
        {
          label: row ? "ذخیره" : "ثبت مشتری", kind: "pri", icon: "check_circle",
          onClick: async close => {
            if (!f.name.value.trim()) { toast("نام را وارد کنید", "err"); return; }
            if (f.number.value.replace(/\D/g, "").length < 3) { toast("شماره معتبر نیست", "err"); return; }
            try {
              await api("contacts", {
                act: "save", name: f.name.value.trim(), company: f.company.value.trim(),
                number: f.number.value.trim(), note: f.note.value.trim(),
              }, { method: "POST" });
              close();
              toast("ذخیره شد", "ok");
              load(searchInput.value.trim());
            } catch (err) { toast(err.message, "err"); }
          },
        },
        { label: "انصراف", kind: "plain", onClick: c => c() },
      ],
    });
  }

  /* ---------------- پرونده‌ی مشتری (CRM) ---------------- */

  async function openProfile(row) {
    let data;
    try { data = await api("contacts", { act: "profile", number: row.number }); }
    catch (err) { toast(err.message, "err"); return; }

    const s = data.stats;
    const statBox = (v, k, ic, bg, fg) => el("div", { class: "stat" }, [
      el("div", { class: "bx", style: `background:${bg};color:${fg}`, html: icon(ic, 17) }),
      el("div", {}, [el("div", { class: "v", text: v }), el("div", { class: "k", text: k })]),
    ]);

    const history = el("div", { style: "display:flex;flex-direction:column;gap:5px;max-height:300px;overflow:auto;padding-top:4px" });
    if (!data.calls.length) {
      history.appendChild(el("div", { class: "empty", html: `${icon("history", 30)}<span>تماسی ثبت نشده</span>` }));
    }
    for (const c of data.calls) {
      const [fa, kind] = DISPO_FA[c.dispo] || ["—", "idle"];
      history.appendChild(el("div", {
        style: "display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:var(--r-md);background:var(--surface-2)",
      }, [
        el("span", { class: `dir ${c.dir === "in" ? "in" : "out"}`, html: icon(c.dir === "in" ? "call_received" : "call_made", 16) }),
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", { style: "font-size:11.5px", text: `${jalali(c.start)} — ${clock(c.start)}` }),
          el("div", { style: "font-size:10px;color:var(--muted)", text: c.ext ? `داخلی ${c.ext}${c.extname ? " — " + c.extname : ""}` : "" }),
        ]),
        el("span", { class: `tag ${kind}`, text: fa }),
        el("span", { class: "num", style: "font-size:11px;min-width:44px;text-align:left", text: dur(c.bill) }),
      ]));
    }

    modal({
      title: `${row.name}${row.company ? " — " + row.company : ""}`,
      iconName: "person", width: 620,
      body: el("div", {}, [
        el("div", { style: "display:flex;align-items:center;gap:8px;padding-bottom:12px" }, [
          el("span", { class: "num", style: "font-size:15px;font-weight:700", text: prettyNumber(row.number) }),
          el("span", { style: "flex:1" }),
          el("button", { class: "btn ok", html: icon("call", 16) + "<span>تماس بگیر</span>",
            on: { click: () => callNow(row.number) } }),
        ]),
        el("div", { class: "stat-row", style: "grid-template-columns:repeat(4,1fr);padding-bottom:12px" }, [
          statBox(String(s.total), "کل تماس", "history", "var(--brand-soft)", "var(--brand)"),
          statBox(String(s.answered), "پاسخ داده", "check_circle", "var(--green-soft)", "var(--green)"),
          statBox(dur(s.talk), "مجموع مکالمه", "schedule", "var(--orange-soft)", "#b8570a"),
          statBox(s.last ? jalali(s.last) : "—", "آخرین تماس", "call", "#e7edf5", "var(--muted)"),
        ]),
        row.note ? el("p", { class: "hint", text: row.note, style: "padding-bottom:8px" }) : null,
        el("div", { style: "font-size:12px;font-weight:600;color:var(--navy);padding-bottom:2px" , text: "تاریخچه تماس‌ها" }),
        history,
      ]),
      actions: [
        { label: "ویرایش مشتری", kind: "pri", icon: "edit", onClick: c => { c(); edit(row); } },
        { label: "بستن", kind: "plain", onClick: c => c() },
      ],
    });
  }

  /* ---------------- حذف و خروجی ---------------- */

  function removeOne(row) {
    confirmBox(`${row.name} از دفترچه حذف شود؟ (تماس‌هایش در گزارش می‌ماند)`, async () => {
      try {
        await api("contacts", { act: "delete", number: row.number }, { method: "POST" });
        toast("حذف شد", "ok"); load(searchInput.value.trim());
      } catch (err) { toast(err.message, "err"); }
    }, { danger: true, yes: "حذف کن" });
  }

  function removeSelected() {
    const sel = table.selected;
    confirmBox(`${sel.length} مشتری حذف شود؟`, async () => {
      for (const r of sel) {
        try { await api("contacts", { act: "delete", number: r.number }, { method: "POST" }); } catch {}
      }
      toast(`${sel.length} مشتری حذف شد`, "ok");
      load(searchInput.value.trim());
    }, { danger: true, yes: "حذف کن" });
  }

  function exportCsv() {
    const rows = table.selected.length ? table.selected : table.visibleRows();
    if (!rows.length) { toast("ردیفی برای خروجی نیست", "err"); return; }
    const head = ["نام", "شرکت", "شماره", "توضیح"].join(",");
    const body = rows.map(r => [r.name, r.company, r.number, r.note]
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + [head, ...body].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = el("a", { href: url, download: "مشتریان.csv" });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`${rows.length} ردیف خروجی گرفته شد`, "ok");
  }

  root.append(toolbar, table.wrap, table.foot);
  load();
  return root;
}
