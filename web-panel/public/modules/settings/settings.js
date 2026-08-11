/* ==========================================================================
   ماژول «تنظیمات»
   اینجا فقط چیزهایی تنظیم می‌شود که خودِ این برنامه لازم دارد:
   اتصال AMI، قاعده‌ی click-to-call و ضبط مکالمه. کانفیگ خود ایزابل دست‌نخورده
   می‌ماند و از رابط خودش مدیریت می‌شود.
   ========================================================================== */

import { el, icon, api, toast, toolBtn, prefs, prettyNumber } from "../../assets/js/core.js";

export function render(ctx) {
  const root = el("div", { class: "fade-in", style: "display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto" });

  const field = (label, node, hint) => el("div", { class: "field" }, [
    el("label", { text: label }), node, hint ? el("div", { class: "hint", text: hint }) : null,
  ]);

  /* ---------- شماره‌ی من: مهم‌ترین تنظیم، بالای همه ---------- */
  const savedMine = prefs.get("myNumber", null);
  const mineNum = el("input", {
    type: "tel", inputmode: "tel", placeholder: "09121881481",
    value: savedMine?.number || "", style: "direction:ltr;text-align:center;font-size:16px;font-weight:700;letter-spacing:1px",
  });
  const mineLbl = el("input", { type: "text", placeholder: "مثلاً موبایل من", value: savedMine?.label || "" });
  const mineState = el("div", { class: "hint", style: "padding-top:4px" });

  function showMineState() {
    const s = prefs.get("myNumber", null);
    mineState.innerHTML = s
      ? `<span class="tag ok">${icon("check_circle", 12)}<span>ثبت شده</span></span> &nbsp; تماس‌ها اول به <b>${prettyNumber(s.number)}</b> وصل می‌شوند.`
      : `<span class="tag no">ثبت نشده</span> &nbsp; تا وقتی این را پر نکنید، دکمه‌ی تماس کار نمی‌کند.`;
  }
  showMineState();

  function saveMine() {
    const n = mineNum.value.replace(/[^\d*#+]/g, "");
    if (n.length < 3) { toast("شماره معتبر نیست", "err"); mineNum.focus(); return; }
    prefs.set("myNumber", { number: n, label: mineLbl.value.trim() });
    if (ctx) ctx.me = { ext: n, name: mineLbl.value.trim(), role: "کاربر" };
    window.dispatchEvent(new Event("kariya:me-changed"));
    showMineState();
    toast(`شماره‌ی شما ذخیره شد: ${prettyNumber(n)}`, "ok");
  }

  const f = {
    amiHost: el("input", { value: "" }),
    amiPort: el("input", { value: "", inputmode: "numeric" }),
    amiUser: el("input", { value: "" }),
    amiPermit: el("input", { value: "" }),
    agentExt: el("input", { value: "", inputmode: "numeric" }),
    context: el("input", { value: "" }),
    confirm: el("select", {}, [el("option", { value: "1", text: "روشن" }), el("option", { value: "0", text: "خاموش" })]),
    maxConcurrent: el("input", { value: "", inputmode: "numeric" }),
    recEnabled: el("select", {}, [el("option", { value: "1", text: "فعال" }), el("option", { value: "0", text: "غیرفعال" })]),
    recPath: el("input", { value: "" }),
    recKeep: el("input", { value: "", inputmode: "numeric" }),
  };

  const card = (title, ico, children) => el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [el("span", { html: icon(ico, 18) }), el("span", { text: title })]),
    el("div", { style: "padding:2px 14px 14px" }, children),
  ]);

  const mineCard = card("شماره‌ی من", "headset_mic", [
    el("p", { class: "hint", html:
      "هر تماسی که از این برنامه می‌گیرید <b>دو پا</b> دارد: اول به شماره‌ی شما زنگ می‌خورد، " +
      "جواب که دادید، مقصد گرفته می‌شود و مرکز تلفن شما را به هم وصل می‌کند. " +
      "این شماره یک بار ذخیره می‌شود و روی همین مرورگر می‌ماند.", style: "padding-bottom:10px" }),
    el("div", { class: "grid2" }, [
      field("شماره‌ی من", mineNum, "موبایل خودتان یا داخلی‌تان"),
      field("برچسب (اختیاری)", mineLbl),
    ]),
    mineState,
    el("div", { style: "padding-top:10px" }, [
      el("button", { class: "btn pri", html: icon("check_circle", 17) + "<span>ذخیره شماره‌ی من</span>", on: { click: saveMine } }),
    ]),
  ]);

  mineNum.addEventListener("keydown", e => { if (e.key === "Enter") saveMine(); });

  const amiCard = card("اتصال به مرکز تلفن (AMI)", "lan", [
    el("div", { class: "grid2" }, [
      field("میزبان", f.amiHost),
      field("پورت", f.amiPort),
      field("نام کاربر AMI", f.amiUser),
      field("IP مجاز", f.amiPermit),
    ]),
    el("p", { class: "hint", html:
      "رمز AMI اینجا نمایش داده نمی‌شود و فقط روی سرور در فایل تنظیمات نگهداری می‌شود. " +
      "دسترسی این کاربر عمداً محدود به <b>originate</b> است تا اگر پنل نفوذ شد، مرکز تلفن قابل بازپیکربندی نباشد." }),
  ]);

  const c2cCard = card("قاعده‌ی تماس از پنل (click-to-call)", "swap_calls", [
    el("div", { class: "grid2" }, [
      field("داخلی پشتیبان", f.agentExt, "همیشه اول این داخلی زنگ می‌خورد، بعد مشتری وصل می‌شود."),
      field("Context مقصد", f.context),
      field("تأیید تماس (Confirm Calls)", f.confirm, "اگر خاموش شود، صندوق صوتی موبایل به‌جای پشتیبان جواب می‌دهد."),
      field("سقف تماس هم‌زمان", f.maxConcurrent, "هر تماس در حالت انتقال، دو کانال ترانک می‌گیرد."),
    ]),
    el("p", { class: "hint", html:
      "شماره‌ی مشتری فقط از پروفایل احرازهویت‌شده خوانده می‌شود و هرگز از ورودی فرم گرفته نمی‌شود — " +
      "وگرنه هر کسی می‌تواند با حساب شما به هر مقصدی زنگ بزند." }),
  ]);

  const recCard = card("ضبط مکالمه", "fiber_manual_record", [
    el("div", { class: "grid2" }, [
      field("وضعیت ضبط", f.recEnabled),
      field("نگهداری فایل (روز)", f.recKeep),
    ]),
    field("مسیر فایل‌ها روی سرور", f.recPath),
  ]);

  const toolbar = el("div", { class: "toolbar" }, [
    toolBtn("check_circle", "ذخیره تنظیمات", save, "primary"),
    toolBtn("refresh", "بازخوانی", load),
    el("span", { class: "grow" }),
    el("span", { class: "hint", text: "تنظیمات این برنامه — کانفیگ خود ایزابل دست‌نخورده می‌ماند." }),
  ]);

  async function load() {
    try {
      const s = await api("settings");
      f.amiHost.value = s.ami.host;
      f.amiPort.value = s.ami.port;
      f.amiUser.value = s.ami.user;
      f.amiPermit.value = s.ami.permit;
      f.agentExt.value = s.click2call.agentExt;
      f.context.value = s.click2call.context;
      f.confirm.value = s.click2call.confirm ? "1" : "0";
      f.maxConcurrent.value = s.click2call.maxConcurrent;
      f.recEnabled.value = s.recording.enabled ? "1" : "0";
      f.recPath.value = s.recording.path;
      f.recKeep.value = s.recording.keepDays;
    } catch (err) { toast(err.message, "err"); }
  }

  function save() {
    toast("ذخیره‌ی تنظیمات پس از اتصال به سرور فعال می‌شود", "info");
  }

  root.append(toolbar, mineCard, amiCard, c2cCard, recCard);
  load();
  return root;
}
