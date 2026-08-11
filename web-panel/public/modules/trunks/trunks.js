/* ==========================================================================
   ماژول «ترانک‌ها»
   وضعیت خطوط بیرونی و مصرف کانال. ظرفیت هم‌زمان اینجا دیده می‌شود چون هر
   تماس click-to-call در حالت انتقال به موبایل، دو کانال ترانک می‌گیرد.
   ========================================================================== */

import { el, icon, api, toast, toolBtn, modal } from "../../assets/js/core.js";
import { makeTable } from "../../assets/js/table.js";

export function render() {
  const root = el("div", { class: "fade-in", style: "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0" });

  const capBar = el("div", { class: "stat-row", style: "grid-template-columns:repeat(3,1fr)" });

  const toolbar = el("div", { class: "toolbar" }, [
    toolBtn("refresh", "تازه‌سازی", () => load()),
    toolBtn("print", "چاپ", () => window.print()),
    el("span", { class: "grow" }),
    el("span", { class: "hint", text: "هر تماس click-to-call در حالت انتقال به موبایل، دو کانال ترانک می‌گیرد." }),
  ]);

  const cols = [
    { key: "name", title: "نام ترانک", width: 140 },
    { key: "tech", title: "پروتکل", width: 78 },
    { key: "host", title: "میزبان", width: 165 },
    {
      key: "status", title: "وضعیت", width: 92,
      value: r => (r.status === "online" ? "متصل" : "قطع"),
      render: r => r.status === "online"
        ? `<span class="tag ok">${icon("fiber_manual_record", 11)}<span>متصل</span></span>`
        : `<span class="tag no">${icon("fiber_manual_record", 11)}<span>قطع</span></span>`,
    },
    {
      key: "usage", title: "کانال در حال استفاده", width: 168, filter: false,
      value: r => r.inuse,
      render: r => {
        const pct = r.channels ? Math.round((r.inuse / r.channels) * 100) : 0;
        const color = pct >= 80 ? "var(--red)" : pct >= 50 ? "var(--orange)" : "var(--green)";
        return `<div style="display:flex;align-items:center;gap:7px;width:100%">
          <div style="flex:1;height:6px;border-radius:999px;background:#e7edf5;overflow:hidden">
            <div style="width:${pct}%;height:100%;border-radius:999px;background:${color};transition:width .5s cubic-bezier(.22,.9,.3,1)"></div>
          </div>
          <span class="num" style="font-size:10.5px;color:var(--muted)">${r.inuse}/${r.channels}</span>
        </div>`;
      },
      copy: r => `${r.inuse}/${r.channels}`,
    },
    { key: "channels", title: "ظرفیت", width: 66, type: "num", render: r => `<span class="num">${r.channels}</span>` },
    { key: "cid", title: "شماره نمایشی", width: 122, render: r => `<span class="num">${r.cid}</span>` },
    { key: "note", title: "توضیح", width: 160 },
  ];

  const table = makeTable(cols, {
    rows: [], idKey: "name", storageKey: "trunks",
    onOpen: row => modal({
      title: `ترانک ${row.name}`, iconName: "hub", width: 440,
      body: el("div", { class: "hint", html: `
        <p>پروتکل: <b>${row.tech}</b></p>
        <p>میزبان: <b>${row.host}</b></p>
        <p>ظرفیت هم‌زمان: <b>${row.channels}</b> کانال — الان <b>${row.inuse}</b> کانال در حال استفاده است.</p>
        <p>${row.note || ""}</p>
        <p style="margin-top:10px;color:var(--orange)">ویرایش ترانک پس از اتصال به مرکز تلفن فعال می‌شود.</p>` }),
      actions: [{ label: "بستن", kind: "plain", onClick: c => c() }],
    }),
  });

  function drawCapacity(rows) {
    const online = rows.filter(r => r.status === "online");
    const used = online.reduce((a, r) => a + r.inuse, 0);
    const total = online.reduce((a, r) => a + r.channels, 0);
    const items = [
      { v: `${used} از ${total}`, k: "کانال در حال استفاده", ic: "signal_cellular_alt", bg: "var(--brand-soft)", fg: "var(--brand)" },
      { v: String(online.length), k: "ترانک متصل", ic: "hub", bg: "var(--green-soft)", fg: "var(--green)" },
      { v: String(Math.floor((total - used) / 2)), k: "تماس click-to-call ممکن", ic: "swap_calls", bg: "var(--orange-soft)", fg: "#b8570a" },
    ];
    capBar.innerHTML = "";
    for (const s of items) {
      capBar.appendChild(el("div", { class: "stat" }, [
        el("div", { class: "bx", style: `background:${s.bg};color:${s.fg}`, html: icon(s.ic, 18) }),
        el("div", {}, [el("div", { class: "v", text: s.v }), el("div", { class: "k", text: s.k })]),
      ]));
    }
  }

  async function load() {
    try {
      const res = await api("trunks");
      table.setRows(res.rows);
      drawCapacity(res.rows);
    } catch (err) { toast(err.message, "err"); }
  }

  root.append(toolbar, capBar, table.wrap, table.foot);
  load();
  return root;
}
