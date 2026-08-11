/* ==========================================================================
   ماژول «داخلی‌ها»
   فهرست داخلی‌ها با وضعیت لحظه‌ای، ویرایش، Follow-Me و صندوق صوتی.
   نوشتن روی مرکز تلفن از طریق api/saveExtension انجام می‌شود؛ تا وقتی سرور
   وصل نشده، فقط داده‌ی نمونه تغییر می‌کند.
   ========================================================================== */

import { el, icon, api, toast, toolBtn, modal, confirmBox, prettyNumber }
  from "../../assets/js/core.js";
import { makeTable } from "../../assets/js/table.js";

const STATUS_FA = {
  online: ["در دسترس", "ok"],
  busy: ["مشغول", "wait"],
  offline: ["خاموش", "idle"],
};

export function render(ctx) {
  const root = el("div", { class: "fade-in", style: "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0" });

  const searchInput = el("input", { type: "search", placeholder: "جستجو در داخلی‌ها…", "aria-label": "جستجو" });
  const searchBox = el("div", { class: "search-box" }, [el("span", { html: icon("search", 16) }), searchInput]);

  const delBtn = toolBtn("delete", "حذف انتخاب‌شده‌ها", removeSelected, "danger");
  delBtn.disabled = true;

  const toolbar = el("div", { class: "toolbar" }, [
    toolBtn("add", "افزودن داخلی", () => edit(null), "primary"),
    toolBtn("download", "خروجی اکسل", exportCsv),
    toolBtn("print", "چاپ", () => window.print()),
    delBtn,
    toolBtn("refresh", "تازه‌سازی", () => load()),
    el("span", { class: "grow" }),
    searchBox,
  ]);

  searchInput.addEventListener("input", () => {
    const t = searchInput.value.trim().toLowerCase();
    table.setRows(!t ? all : all.filter(r => (r.ext + r.name + r.dept + (r.followme || "")).toLowerCase().includes(t)));
  });

  const cols = [
    { key: "ext", title: "داخلی", width: 62, type: "num", summary: false, render: r => `<span class="num">${r.ext}</span>` },
    { key: "name", title: "نام", width: 160 },
    { key: "dept", title: "واحد", width: 100 },
    {
      key: "status", title: "وضعیت", width: 92,
      value: r => STATUS_FA[r.status][0],
      render: r => { const [fa, k] = STATUS_FA[r.status]; return `<span class="tag ${k}">${icon("fiber_manual_record", 11)}<span>${fa}</span></span>`; },
    },
    { key: "tech", title: "پروتکل", width: 74 },
    {
      key: "followme", title: "انتقال به موبایل", width: 128,
      render: r => r.followme ? `<span class="num">${prettyNumber(r.followme)}</span>` : `<span style="color:var(--muted)">—</span>`,
    },
    {
      key: "voicemail", title: "صندوق صوتی", width: 92, filter: false,
      value: r => (r.voicemail ? "دارد" : "ندارد"),
      render: r => r.voicemail ? `<span class="tag ok">دارد</span>` : `<span class="tag idle">ندارد</span>`,
    },
    { key: "cid", title: "شماره نمایشی", width: 118, render: r => `<span class="num">${r.cid || "—"}</span>` },
    { key: "note", title: "توضیح", width: 150, render: r => r.note || `<span style="color:var(--muted)">—</span>` },
  ];

  const table = makeTable(cols, {
    rows: [],
    idKey: "ext",
    storageKey: "ext",
    onOpen: edit,
    onSelectionChange: sel => { delBtn.disabled = sel.length === 0; },
    menuItems: row => [
      { label: "ویرایش داخلی", icon: "edit", onClick: () => edit(row) },
      { label: `تماس با داخلی ${row.ext}`, icon: "call", onClick: () => callExt(row) },
      null,
      { label: "حذف داخلی", icon: "delete", onClick: () => removeOne(row) },
    ],
  });

  let all = [];

  async function load() {
    try {
      const res = await api("extensions");
      all = res.rows;
      table.setRows(all);
      delBtn.disabled = true;
    } catch (err) { toast(err.message, "err"); }
  }

  /* ---------------- فرم افزودن و ویرایش ---------------- */

  function edit(row) {
    const isNew = !row;
    const f = {
      ext: el("input", { value: row?.ext || "", inputmode: "numeric", placeholder: "مثلاً 707" }),
      name: el("input", { value: row?.name || "", placeholder: "نام کاربر یا عنوان" }),
      dept: el("input", { value: row?.dept || "", placeholder: "پشتیبانی، فروش، …" }),
      cid: el("input", { value: row?.cid || "", placeholder: "021-91001100" }),
      followme: el("input", { value: row?.followme || "", inputmode: "tel", placeholder: "09121234567" }),
      voicemail: el("select", {}, [
        el("option", { value: "1", text: "دارد" }),
        el("option", { value: "0", text: "ندارد" }),
      ]),
      note: el("textarea", { text: row?.note || "", placeholder: "توضیح اختیاری" }),
    };
    f.voicemail.value = row?.voicemail === false ? "0" : "1";
    if (!isNew) f.ext.disabled = true;

    const field = (label, node, hint) => el("div", { class: "field" }, [
      el("label", { text: label }), node, hint ? el("div", { class: "hint", text: hint }) : null,
    ]);

    modal({
      title: isNew ? "افزودن داخلی" : `ویرایش داخلی ${row.ext}`,
      iconName: isNew ? "add" : "edit",
      width: 520,
      body: el("div", {}, [
        el("div", { class: "grid2" }, [
          field("شماره داخلی", f.ext),
          field("نام", f.name),
          field("واحد", f.dept),
          field("شماره نمایشی خروجی", f.cid),
        ]),
        field("انتقال به موبایل (Follow-Me)", f.followme,
          "اگر پر شود، تماس بی‌پاسخ به این موبایل می‌رود. تأیید تماس روشن است تا صندوق صوتی اپراتور جواب ندهد."),
        el("div", { class: "grid2" }, [field("صندوق صوتی", f.voicemail), el("div")]),
        field("توضیح", f.note),
      ]),
      actions: [
        {
          label: isNew ? "ثبت داخلی" : "ذخیره تغییرات", kind: "pri", icon: "check_circle",
          onClick: async close => {
            const ext = f.ext.value.trim();
            if (!/^\d{3,6}$/.test(ext)) { toast("شماره داخلی باید ۳ تا ۶ رقم باشد", "err"); return; }
            if (!f.name.value.trim()) { toast("نام داخلی را وارد کنید", "err"); return; }
            try {
              await api("saveExtension", {
                ext, name: f.name.value.trim(), dept: f.dept.value.trim(), cid: f.cid.value.trim(),
                followme: f.followme.value.trim(), voicemail: f.voicemail.value === "1",
                note: f.note.value.trim(), tech: row?.tech || "PJSIP",
              }, { method: "POST" });
              close();
              toast(isNew ? `داخلی ${ext} ساخته شد` : `داخلی ${ext} ذخیره شد`, "ok");
              load();
            } catch (err) { toast(err.message, "err"); }
          },
        },
        { label: "انصراف", kind: "plain", onClick: close => close() },
      ],
    });
  }

  async function callExt(row) {
    try {
      await api("originate", { ext: ctx.me?.ext, number: row.ext }, { method: "POST" });
      toast(`در حال تماس با داخلی ${row.ext}`, "ok");
    } catch (err) { toast(err.message, "err"); }
  }

  function removeOne(row) {
    confirmBox(`داخلی ${row.ext} — ${row.name} حذف شود؟`, () => {
      toast("حذف داخلی پس از اتصال به مرکز تلفن انجام می‌شود", "info");
    }, { danger: true, yes: "حذف کن" });
  }

  function removeSelected() {
    const sel = table.selected;
    confirmBox(`${sel.length} داخلی انتخاب‌شده حذف شود؟`, () => {
      toast("حذف داخلی پس از اتصال به مرکز تلفن انجام می‌شود", "info");
    }, { danger: true, yes: "حذف کن" });
  }

  function exportCsv() {
    const rows = table.selected.length ? table.selected : table.visibleRows();
    const head = cols.map(c => c.title).join(",");
    const body = rows.map(r => cols.map(c => `"${String(c.value ? c.value(r) : r[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + [head, ...body].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = el("a", { href: url, download: "داخلی‌ها.csv" });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`${rows.length} ردیف خروجی گرفته شد`, "ok");
  }

  root.append(toolbar, table.wrap, table.foot);
  load();
  return root;
}
