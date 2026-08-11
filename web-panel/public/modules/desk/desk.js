/* ==========================================================================
   ماژول «میز کار تماس»
   چپ: تلفن نرم‌افزاری (شماره‌گیر). راست: آمار امروز + تماس‌های زنده.
   تماس‌های زنده هر ۳ ثانیه از api/live گرفته می‌شوند و شمارنده هر ثانیه جلو می‌رود.
   ========================================================================== */

import { el, icon, api, toast, dur, now, clockFull, prettyNumber, confirmBox, modal, prefs } from "../../assets/js/core.js";

const KEYS = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
];

export function render(ctx) {
  const root = el("div", { id: "desk", class: "fade-in" });

  /* ======================= تلفن نرم‌افزاری ======================= */

  const numInput = el("input", {
    type: "tel", placeholder: "شماره را وارد کنید", "aria-label": "شماره مقصد", inputmode: "tel",
  });

  const dialDisplay = el("div", { class: "dial-display" }, [
    numInput,
    el("button", {
      title: "حذف رقم آخر", "aria-label": "حذف رقم آخر", html: icon("backspace", 18),
      on: { click: () => { numInput.value = numInput.value.slice(0, -1); numInput.focus(); } },
    }),
  ]);

  const keypad = el("div", { class: "keypad" }, KEYS.map(([d, sub]) =>
    el("button", {
      class: "key", "aria-label": `شماره ${d}`,
      html: `<span>${d}</span>${sub ? `<small>${sub}</small>` : ""}`,
      on: { click: () => { numInput.value += d; numInput.focus(); } },
    })
  ));

  const callBtn = el("button", {
    class: "call-btn", html: icon("call", 20) + "<span>تماس بگیر</span>",
    on: { click: dial },
  });

  /* ---------- شماره‌ی خودِ کاربر ----------
     هر تماس دو پا دارد: اول به این شماره زنگ می‌خورد، بعد به مقصد وصل می‌شود.
     می‌تواند موبایل باشد (از ترانک می‌رود و در CDR ثبت می‌شود) یا داخلی. */
  const saved = prefs.get("myNumber", null);
  if (saved) ctx.me = { ext: saved.number, name: saved.label, role: "کاربر" };

  const myExtN = el("div", { class: "n", text: ctx.me?.ext ? prettyNumber(ctx.me.ext) : "شماره‌ی من" });
  const myExtL = el("div", { class: "l", text: ctx.me?.ext ? (ctx.me.name || "اول به این زنگ می‌خورد") : "برای ثبت بزنید" });

  const myExt = el("div", {
    class: "my-ext", style: "cursor:pointer",
    title: "شماره‌ی من — برای تغییر کلیک کنید", on: { click: chooseMyNumber },
  }, [
    el("div", { html: icon("headset_mic", 20), style: "color:#b9d3f2" }),
    el("div", { style: "min-width:0" }, [myExtN, myExtL]),
    el("span", { class: ctx.me?.ext ? "tag ok st" : "tag wait st", html: icon("edit", 14) }),
  ]);

  function setMyNumber(number, label) {
    ctx.me = { ext: number, name: label, role: "کاربر" };
    prefs.set("myNumber", { number, label });
    myExtN.textContent = prettyNumber(number);
    myExtL.textContent = label || "اول به این زنگ می‌خورد";
    myExt.querySelector(".st").className = "tag ok st";
    window.dispatchEvent(new Event("kariya:me-changed"));
  }

  async function chooseMyNumber() {
    const inp = el("input", {
      type: "tel", inputmode: "tel", placeholder: "09121881481",
      value: ctx.me?.ext || "", style: "direction:ltr;text-align:center;font-size:15px;font-weight:600",
    });
    const lbl = el("input", { type: "text", placeholder: "مثلاً موبایل من", value: ctx.me?.name || "" });

    // میان‌بر: داخلی‌های آنلاین را هم پیشنهاد بده
    let quick = el("div");
    try {
      const list = (await api("extensions")).rows.filter(e => e.status === "online");
      if (list.length) {
        quick = el("div", {}, [
          el("div", { class: "hint", text: "یا یکی از داخلی‌های آنلاین:", style: "margin:6px 0 5px" }),
          el("div", { style: "display:flex;flex-wrap:wrap;gap:6px" }, list.map(e =>
            el("button", {
              class: "btn", style: "height:30px;padding:0 12px",
              html: `<b>${e.ext}</b>${e.name && e.name !== e.ext ? ` <span style="font-weight:400">${e.name}</span>` : ""}`,
              on: { click: () => { inp.value = e.ext; lbl.value = e.name || `داخلی ${e.ext}`; } },
            })
          )),
        ]);
      }
    } catch { /* اگر نشد، اشکالی ندارد */ }

    const body = el("div", {}, [
      el("p", { class: "hint", html:
        "شماره‌ای که <b>اول به آن زنگ می‌خورد</b> را وارد کنید — موبایل خودتان یا داخلی‌تان.<br>" +
        "بعد از اینکه جواب دادید، سیستم شماره‌ی مقصد را می‌گیرد و شما را وصل می‌کند.", style: "padding-bottom:10px" }),
      el("div", { class: "field" }, [el("label", { text: "شماره‌ی من" }), inp]),
      el("div", { class: "field" }, [el("label", { text: "برچسب (اختیاری)" }), lbl]),
      quick,
    ]);

    modal({
      title: "شماره‌ی من", iconName: "headset_mic", width: 430, body,
      actions: [
        { label: "ذخیره", kind: "pri", icon: "check_circle", onClick: close => {
          const n = inp.value.replace(/[^\d*#+]/g, "");
          if (n.length < 3) { toast("شماره معتبر نیست", "err"); return; }
          setMyNumber(n, lbl.value.trim());
          close();
          toast(`شماره‌ی شما ثبت شد: ${prettyNumber(n)}`, "ok");
        } },
        { label: "انصراف", kind: "plain", onClick: c => c() },
      ],
    });
  }

  const dndBtn = el("button", {
    class: "mini", html: icon("block", 15) + "<span>مزاحم نشوید</span>",
    on: { click: e => { e.currentTarget.classList.toggle("on"); toast("وضعیت «مزاحم نشوید» تغییر کرد", "info"); } },
  });

  const fwdBtn = el("button", {
    class: "mini", html: icon("phone_forwarded", 15) + "<span>انتقال</span>",
    on: { click: () => toast("انتقال تماس پس از اتصال به مرکز تلفن فعال می‌شود", "info") },
  });

  const phone = el("div", { class: "phone" }, [
    myExt,
    dialDisplay,
    keypad,
    callBtn,
    el("div", { class: "dnd-row" }, [dndBtn, fwdBtn]),
    el("div", { style: "font-size:10px;color:#9fc0e6;line-height:1.9;padding-top:2px" , html:
      "اول به <b>شماره‌ی من</b> زنگ می‌خورد، جواب دادید،<br>بعد مقصد گرفته می‌شود و وصل می‌شوید.<br>Enter تماس می‌گیرد و Esc پاک می‌کند." }),
  ]);

  /* شماره‌گیری با صفحه‌کلید واقعی */
  numInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); dial(); }
    if (e.key === "Escape") { numInput.value = ""; }
  });

  async function dial() {
    const number = numInput.value.replace(/[^\d*#+]/g, "");
    if (number.length < 3) { toast("شماره معتبر نیست", "err"); numInput.focus(); return; }
    if (!ctx.me?.ext) { toast("اول شماره‌ی خودتان را ثبت کنید", "err"); chooseMyNumber(); return; }
    callBtn.disabled = true;
    try {
      await api("originate", { from: ctx.me.ext, number }, { method: "POST" });
      toast(`اول به ${prettyNumber(ctx.me.ext)} زنگ می‌خورد، بعد به ${prettyNumber(number)} وصل می‌شوید`, "ok");
      numInput.value = "";
      loadLive();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      callBtn.disabled = false;
    }
  }

  /* ======================= آمار امروز ======================= */

  const statRow = el("div", { class: "stat-row" });

  function drawStats(live) {
    const talking = live.filter(c => c.state === "talking").length;
    const ringing = live.filter(c => c.state === "ringing").length;
    const held = live.filter(c => c.state === "hold").length;
    const items = [
      { v: live.length, k: "تماس فعال", ic: "phone_in_talk", bg: "var(--brand-soft)", fg: "var(--brand)" },
      { v: talking, k: "در حال مکالمه", ic: "mic", bg: "var(--green-soft)", fg: "var(--green)" },
      { v: ringing, k: "در حال زنگ", ic: "wifi_tethering", bg: "var(--orange-soft)", fg: "#b8570a" },
      { v: held, k: "روی انتظار", ic: "pause", bg: "#e7edf5", fg: "var(--muted)" },
    ];
    statRow.innerHTML = "";
    for (const s of items) {
      statRow.appendChild(el("div", { class: "stat" }, [
        el("div", { class: "bx", style: `background:${s.bg};color:${s.fg}`, html: icon(s.ic, 18) }),
        el("div", {}, [
          el("div", { class: "v", text: String(s.v) }),
          el("div", { class: "k", text: s.k }),
        ]),
      ]));
    }
  }

  /* ======================= تماس‌های زنده ======================= */

  const liveList = el("div", { class: "live-list" });
  const liveCard = el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [
      el("span", { html: icon("swap_calls", 18) }),
      el("span", { text: "تماس‌های زنده" }),
      el("span", { class: "sub", id: "live-updated", text: "" }),
      el("span", { style: "flex:1" }),
      el("button", {
        class: "tb ghost", title: "تازه‌سازی", "aria-label": "تازه‌سازی",
        html: icon("refresh", 17), on: { click: () => loadLive(true) },
      }),
    ]),
    liveList,
  ]);

  let calls = [];

  function drawLive() {
    liveList.innerHTML = "";
    if (!calls.length) {
      liveList.appendChild(el("div", { class: "empty", html: `${icon("call", 36)}<span>الان تماسی در جریان نیست</span>` }));
      return;
    }

    for (const c of calls) {
      const label = c.state === "ringing" ? "در حال زنگ" : c.state === "hold" ? "روی انتظار" : "در حال مکالمه";
      const dirIcon = c.dir === "in" ? "call_received" : "call_made";
      const dirText = c.dir === "in" ? "ورودی" : "خروجی";

      const timer = el("div", { class: "timer", text: dur(now() - c.since) });
      timer.dataset.since = c.since;

      const acts = el("div", { class: "acts" }, [
        c.state === "ringing"
          ? el("button", { class: "act green", title: "پاسخ", "aria-label": "پاسخ به تماس", html: icon("call", 17), on: { click: () => act("answer", c) } })
          : el("button", {
              class: "act", title: c.state === "hold" ? "برگرداندن از انتظار" : "انتظار",
              "aria-label": "انتظار", html: icon(c.state === "hold" ? "play_arrow" : "pause", 17),
              on: { click: () => act("hold", c) },
            }),
        el("button", { class: "act", title: "یادداشت روی تماس", "aria-label": "یادداشت", html: icon("note_add", 17), on: { click: () => noteFor(c) } }),
        el("button", { class: "act red", title: "قطع تماس", "aria-label": "قطع تماس", html: icon("call_end", 17), on: { click: () => act("hangup", c) } }),
      ]);

      liveList.appendChild(el("div", { class: `live-call ${c.state}` }, [
        el("div", { class: "ring", html: icon(c.state === "ringing" ? "wifi_tethering" : "phone_in_talk", 19) }),
        el("div", { class: "who" }, [
          el("b", { text: c.name || prettyNumber(c.peer) }),
          el("span", { html: `${dirText} · ${c.name ? prettyNumber(c.peer) + " · " : ""}داخلی ${c.ext} · ${label}` }),
        ]),
        c.recording ? el("span", { class: "tag no", html: `${icon("fiber_manual_record", 12)}<span>ضبط</span>` }) : null,
        el("span", { class: `dir ${c.dir === "in" ? "in" : "out"}`, html: icon(dirIcon, 17) }),
        timer,
        acts,
      ]));
    }
  }

  async function act(what, c) {
    if (what === "hangup") {
      confirmBox(`تماس با ${c.name || prettyNumber(c.peer)} قطع شود؟`, async () => {
        await api("hangup", { id: c.id }, { method: "POST" });
        toast("تماس قطع شد", "ok");
        loadLive(true);
      }, { danger: true, yes: "قطع کن" });
      return;
    }
    await api(what, { id: c.id }, { method: "POST" });
    loadLive(true);
  }

  function noteFor(c) {
    const ta = el("textarea", { placeholder: "خلاصه‌ی گفتگو، درخواست مشتری، اقدام بعدی…" });
    modal({
      title: `یادداشت تماس — ${c.name || prettyNumber(c.peer)}`,
      iconName: "note_add", width: 480,
      body: el("div", {}, [
        el("div", { class: "field" }, [el("label", { text: "متن یادداشت" }), ta]),
        el("p", { class: "hint", text: "یادداشت به همین تماس در گزارش‌ها می‌چسبد و در پرونده‌ی مشتری دیده می‌شود." }),
      ]),
      actions: [
        { label: "ثبت یادداشت", kind: "pri", icon: "check_circle", onClick: close => { close(); toast("یادداشت ثبت شد", "ok"); } },
        { label: "انصراف", kind: "plain", onClick: close => close() },
      ],
    });
  }

  /* ---------- گرفتن داده و تیک ثانیه‌شمار ---------- */

  async function loadLive(silent = false) {
    try {
      const res = await api("live");
      calls = res.rows;
      drawLive();
      drawStats(calls);
      const u = document.getElementById("live-updated");
      if (u) u.textContent = `به‌روزرسانی ${clockFull(now())}`;
    } catch (err) {
      if (!silent) toast(err.message, "err");
    }
  }

  const poll = setInterval(loadLive, 3000);
  const tick = setInterval(() => {
    for (const t of liveList.querySelectorAll(".timer")) t.textContent = dur(now() - Number(t.dataset.since));
  }, 1000);

  root.append(phone, el("div", { class: "desk-right" }, [statRow, liveCard]));
  loadLive();

  /* پاک‌سازی هنگام رفتن به بخش دیگر */
  root.cleanup = () => { clearInterval(poll); clearInterval(tick); };
  return root;
}
