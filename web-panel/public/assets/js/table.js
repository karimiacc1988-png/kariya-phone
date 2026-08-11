/* ==========================================================================
   جدول استاندارد برنامه
   قوانین از UI-STANDARDS-FA.txt: ارتفاع ردیف ۳۴px، متن ۱۱px، سرستون سرمه‌ای،
   ردیف یکی‌درمیان، ستون انتخاب و ردیف باریک، تک‌خطی بودن سلول‌ها، جستجوی زیر
   هر سرستون، مرتب‌سازی، انتخاب چندتایی، جمع/میانگین/تعداد در پانویس، Ctrl+C.
   ========================================================================== */

import { el, icon, bindRowOpen, prefs } from "./core.js";

/**
 * ساخت جدول.
 * cols: [{ key, title, width, align, type:'text'|'num', filter:true, sort:true,
 *          render:(row)=>string|Node, value:(row)=>مقدار خام برای مرتب‌سازی و جستجو }]
 * options: { rows, idKey, onOpen, menuItems, onSelectionChange, storageKey }
 */
export function makeTable(cols, options = {}) {
  const {
    rows = [],
    idKey = "id",
    onOpen = null,
    menuItems = null,
    onSelectionChange = null,
    storageKey = null,
  } = options;

  const state = {
    rows,
    cols,
    sortKey: storageKey ? prefs.get(`${storageKey}.sortKey`, null) : null,
    sortDir: storageKey ? prefs.get(`${storageKey}.sortDir`, 1) : 1,
    filters: {},
    selected: new Set(),
  };

  const wrap = el("div", { class: "table-wrap" });
  const foot = el("div", { class: "grid-foot" });
  const table = el("table", { class: "grid" });
  const thead = el("thead");
  const tbody = el("tbody");
  table.append(thead, tbody);
  wrap.appendChild(table);

  /* ---------- مقدار خام یک سلول (برای مرتب‌سازی و جستجو) ---------- */
  const raw = (row, col) => (col.value ? col.value(row) : row[col.key]);

  /* ---------- سرستون‌ها ---------- */
  function drawHead() {
    thead.innerHTML = "";

    const hr = el("tr");
    hr.appendChild(el("th", { class: "c-pick nosort", html: `<input class="pick" type="checkbox" title="انتخاب همه" aria-label="انتخاب همه">` }));
    hr.appendChild(el("th", { class: "c-idx nosort", text: "ردیف" }));

    for (const col of cols) {
      const sortable = col.sort !== false;
      const on = state.sortKey === col.key;
      const th = el("th", {
        class: [col.key === "name" ? "c-name" : "", sortable ? "" : "nosort", on ? "sorted" : ""].filter(Boolean).join(" "),
        style: col.width ? `min-width:${col.width}px` : "",
        title: col.title,
        html: `<span class="th-in"><span>${col.title}</span>${sortable
          ? `<span class="sort">${icon(on && state.sortDir < 0 ? "arrow_downward" : "arrow_upward", 13)}</span>` : ""}</span>`,
      });
      if (sortable) th.addEventListener("click", () => {
        state.sortDir = state.sortKey === col.key ? -state.sortDir : 1;
        state.sortKey = col.key;
        if (storageKey) { prefs.set(`${storageKey}.sortKey`, state.sortKey); prefs.set(`${storageKey}.sortDir`, state.sortDir); }
        drawHead(); drawBody();
      });
      hr.appendChild(th);
    }
    thead.appendChild(hr);

    /* ردیف جستجوی ستونی — ستون انتخاب و ردیف فیلتر ندارند */
    const fr = el("tr", { class: "filters" });
    fr.appendChild(el("th", { class: "c-pick" }));
    fr.appendChild(el("th", { class: "c-idx" }));
    for (const col of cols) {
      const th = el("th");
      if (col.filter !== false) {
        const inp = el("input", {
          type: "search", value: state.filters[col.key] || "",
          placeholder: "…", "aria-label": `جستجو در ${col.title}`,
        });
        inp.addEventListener("input", () => { state.filters[col.key] = inp.value.trim(); drawBody(); });
        th.appendChild(inp);
      }
      fr.appendChild(th);
    }
    thead.appendChild(fr);

    /* انتخاب همه */
    hr.querySelector(".pick").addEventListener("change", e => {
      const visible = filtered();
      if (e.target.checked) visible.forEach(r => state.selected.add(r[idKey]));
      else visible.forEach(r => state.selected.delete(r[idKey]));
      drawBody();
    });
  }

  /* ---------- فیلتر و مرتب‌سازی ---------- */
  function filtered() {
    let out = state.rows;

    for (const [key, term] of Object.entries(state.filters)) {
      if (!term) continue;
      const col = cols.find(c => c.key === key);
      const t = term.toLowerCase();
      out = out.filter(r => String(raw(r, col) ?? "").toLowerCase().includes(t));
    }

    if (state.sortKey) {
      const col = cols.find(c => c.key === state.sortKey);
      out = [...out].sort((a, b) => {
        const va = raw(a, col), vb = raw(b, col);
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * state.sortDir;
        return String(va ?? "").localeCompare(String(vb ?? ""), "fa") * state.sortDir;
      });
    }
    return out;
  }

  /* ---------- بدنه ---------- */
  function drawBody() {
    const list = filtered();
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.appendChild(el("tr", {}, [
        el("td", { colspan: cols.length + 2, html: `<div class="empty">${icon("search", 34)}<span>رکوردی یافت نشد</span></div>` }),
      ]));
      drawFoot(list);
      return;
    }

    list.forEach((row, i) => {
      const id = row[idKey];
      const tr = el("tr", { class: state.selected.has(id) ? "sel" : "", tabindex: "0" });

      const box = el("input", { class: "pick", type: "checkbox", "aria-label": "انتخاب ردیف" });
      box.checked = state.selected.has(id);
      box.addEventListener("click", e => e.stopPropagation());
      box.addEventListener("change", () => {
        box.checked ? state.selected.add(id) : state.selected.delete(id);
        tr.classList.toggle("sel", box.checked);
        onSelectionChange?.(selectedRows());
      });
      tr.appendChild(el("td", { class: "c-pick" }, [box]));
      tr.appendChild(el("td", { class: "c-idx num", text: String(i + 1) }));

      for (const col of cols) {
        const td = el("td", {
          class: [col.key === "name" ? "c-name" : "", col.type === "num" ? "num" : ""].filter(Boolean).join(" "),
        });
        const out = col.render ? col.render(row) : raw(row, col);
        if (out instanceof Node) td.appendChild(out);
        else td.innerHTML = out ?? "";
        td.title = td.textContent;
        tr.appendChild(td);
      }

      /* دبل‌کلیک فقط انتخاب می‌کند — باز کردن با سه‌کلیک/نگه‌داشتن/راست‌کلیک/Alt+E */
      tr.addEventListener("dblclick", () => {
        box.checked = !box.checked;
        box.dispatchEvent(new Event("change"));
      });
      if (onOpen) bindRowOpen(tr, { onOpen: () => onOpen(row), menuItems: menuItems ? () => menuItems(row) : null });

      tbody.appendChild(tr);
    });

    drawFoot(list);
    onSelectionChange?.(selectedRows());
  }

  /* ---------- پانویس: تعداد، جمع و میانگین ستون‌های عددی ---------- */
  function drawFoot(list) {
    const bits = [`تعداد ردیف: <b>${list.length.toLocaleString("en-US")}</b>`];
    if (state.selected.size) bits.push(`انتخاب‌شده: <b>${state.selected.size}</b>`);

    for (const col of cols.filter(c => c.type === "num" && c.summary !== false)) {
      const nums = list.map(r => Number(raw(r, col))).filter(n => Number.isFinite(n));
      if (!nums.length) continue;
      const sum = nums.reduce((a, b) => a + b, 0);
      const fmt = col.format || (n => n.toLocaleString("en-US"));
      bits.push(`${col.title} — جمع: <b>${fmt(sum)}</b> · میانگین: <b>${fmt(Math.round(sum / nums.length))}</b>`);
    }
    foot.innerHTML = bits.join("<span style='opacity:.4'>|</span>");
  }

  /* ---------- Ctrl+C: کپی برای اکسل ---------- */
  wrap.addEventListener("keydown", e => {
    if (!(e.ctrlKey && (e.key === "c" || e.key === "C"))) return;
    const list = selectedRows().length ? selectedRows() : filtered();
    const head = cols.map(c => c.title).join("\t");
    const body = list.map(r => cols.map(c => {
      const v = c.copy ? c.copy(r) : raw(r, c);
      return String(v ?? "").replace(/\t|\n/g, " ");
    }).join("\t")).join("\n");
    navigator.clipboard?.writeText(`${head}\n${body}`);
    wrap.style.outline = "2px dashed var(--brand)";
    setTimeout(() => { wrap.style.outline = ""; }, 500);
  });
  wrap.tabIndex = 0;

  function selectedRows() { return state.rows.filter(r => state.selected.has(r[idKey])); }

  drawHead();
  drawBody();

  return {
    wrap, foot,
    get selected() { return selectedRows(); },
    clearSelection() { state.selected.clear(); drawBody(); },
    setRows(next) { state.rows = next; state.selected.clear(); drawBody(); },
    refresh() { drawBody(); },
    visibleRows: filtered,
  };
}
