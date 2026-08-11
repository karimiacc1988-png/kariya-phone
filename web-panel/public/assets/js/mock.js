/* ==========================================================================
   داده‌ی نمونه برای پیش‌نمایش بدون سرور
   شکل خروجی هر مسیر دقیقاً همان چیزی است که فایل‌های api/*.php باید برگردانند،
   پس وقتی سرور وصل شد فقط MOCK خاموش می‌شود و هیچ کد ماژولی تغییر نمی‌کند.
   ========================================================================== */

const T = () => Math.floor(Date.now() / 1000);

/* ---------------- داخلی‌ها ---------------- */

const EXTENSIONS = [
  { ext: "700", name: "میز پشتیبانی", dept: "پشتیبانی", tech: "PJSIP", status: "online", followme: "09121234567", voicemail: true, cid: "021-91001100", note: "داخلی واسط click-to-call" },
  { ext: "701", name: "زهرا احمدی", dept: "پشتیبانی", tech: "PJSIP", status: "busy", followme: "", voicemail: true, cid: "021-91001101", note: "" },
  { ext: "702", name: "مهدی رستمی", dept: "پشتیبانی", tech: "PJSIP", status: "online", followme: "", voicemail: true, cid: "021-91001102", note: "" },
  { ext: "703", name: "سارا کریمی", dept: "فروش", tech: "PJSIP", status: "online", followme: "09354442211", voicemail: true, cid: "021-91001103", note: "" },
  { ext: "704", name: "امیر نجفی", dept: "فروش", tech: "PJSIP", status: "offline", followme: "", voicemail: false, cid: "021-91001104", note: "گوشی تحویل داده نشده" },
  { ext: "705", name: "نگین شریفی", dept: "حسابداری", tech: "PJSIP", status: "online", followme: "", voicemail: true, cid: "021-91001105", note: "" },
  { ext: "706", name: "حسین قاسمی", dept: "حسابداری", tech: "PJSIP", status: "offline", followme: "", voicemail: true, cid: "021-91001106", note: "" },
  { ext: "710", name: "مدیریت", dept: "مدیریت", tech: "PJSIP", status: "online", followme: "09121110022", voicemail: true, cid: "021-91001110", note: "" },
  { ext: "711", name: "اتاق جلسات", dept: "عمومی", tech: "PJSIP", status: "online", followme: "", voicemail: false, cid: "021-91001111", note: "بلندگو" },
  { ext: "712", name: "انبار", dept: "عمومی", tech: "PJSIP", status: "offline", followme: "", voicemail: false, cid: "021-91001112", note: "" },
];

/* ---------------- ترانک‌ها ---------------- */

const TRUNKS = [
  { name: "Shatel-Voip", tech: "PJSIP", host: "sip.shatelvoip.ir", channels: 8, inuse: 3, status: "online", cid: "021-91001100", note: "خط سازمانی اصلی" },
  { name: "Backup-GSM", tech: "PJSIP", host: "192.168.66.40", channels: 2, inuse: 0, status: "online", cid: "0912-9990011", note: "گیت‌وی GSM اضطراری" },
  { name: "Old-PRI", tech: "DAHDI", host: "—", channels: 30, inuse: 0, status: "offline", cid: "021-88001100", note: "خط قدیمی، غیرفعال" },
];

/* ---------------- تماس‌های زنده ---------------- */

const t0 = T();
let LIVE = [
  { id: "c1", dir: "in", peer: "09121234567", name: "شرکت پارس فولاد", ext: "701", state: "talking", since: t0 - 128, trunk: "Shatel-Voip", recording: true },
  { id: "c2", dir: "in", peer: "02144556677", name: "", ext: "703", state: "ringing", since: t0 - 7, trunk: "Shatel-Voip", recording: false },
  { id: "c3", dir: "out", peer: "09354442211", name: "بازرگانی نیک‌رو", ext: "705", state: "talking", since: t0 - 41, trunk: "Shatel-Voip", recording: true },
  { id: "c4", dir: "in", peer: "02166778899", name: "دفتر فنی آریا", ext: "700", state: "hold", since: t0 - 305, trunk: "Shatel-Voip", recording: true },
];

/* ---------------- ساخت تاریخچه‌ی تماس ---------------- */

const NAMES = ["شرکت پارس فولاد", "بازرگانی نیک‌رو", "دفتر فنی آریا", "تولیدی سپهر", "پخش کاوه",
               "مهندسی رایان", "گروه صنعتی البرز", "", "", "فروشگاه مرکزی", "", "حسابداری مهر"];
const MOBILES = ["0912", "0919", "0935", "0936", "0901", "0990"];
const DISPOS = ["ANSWERED", "ANSWERED", "ANSWERED", "ANSWERED", "NO ANSWER", "BUSY", "FAILED"];

/* تولید شبه‌تصادفی ولی تکرارپذیر تا هر بار رفرش، جدول نپرد */
let seed = 20260808;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const CDR = [];
for (let i = 0; i < 260; i++) {
  const dir = rnd() < 0.62 ? "in" : "out";
  const dispo = pick(DISPOS);
  const answered = dispo === "ANSWERED";
  const start = t0 - Math.floor(rnd() * 60 * 86400) - 60;
  const mob = rnd() < 0.7;
  const peer = mob
    ? pick(MOBILES) + String(Math.floor(1000000 + rnd() * 8999999))
    : "021" + String(Math.floor(20000000 + rnd() * 79999999));
  const ext = pick(EXTENSIONS).ext;
  const ring = 3 + Math.floor(rnd() * 22);
  const bill = answered ? 8 + Math.floor(rnd() * 640) : 0;

  CDR.push({
    id: `cdr${i}`,
    start,
    dir,
    peer,
    name: pick(NAMES),
    ext,
    extname: EXTENSIONS.find(e => e.ext === ext).name,
    trunk: rnd() < 0.94 ? "Shatel-Voip" : "Backup-GSM",
    dispo,
    ring,
    bill,
    total: ring + bill,
    recording: answered && rnd() < 0.55,
  });
}
CDR.sort((a, b) => b.start - a.start);

/* ---------------- روتر داده‌ی نمونه ---------------- */

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function handle(path, params = {}, options = {}) {
  await wait(90 + Math.random() * 140);   // شبیه‌سازی تأخیر شبکه

  switch (path) {
    case "status":
      return {
        connected: true,
        pbx: "Issabel 5 · Asterisk 18",
        host: "Voip-Srv",
        uptime: 41 * 3600 + 1220,
        channels: LIVE.length,
        trunkChannels: { used: TRUNKS.reduce((a, t) => a + t.inuse, 0), total: TRUNKS.reduce((a, t) => a + t.channels, 0) },
        me: { ext: "701", name: "زهرا احمدی", role: "پشتیبان" },
      };

    case "live":
      /* شمارنده‌ها زنده جلو می‌روند تا حرکت رابط واقعی دیده شود */
      return { rows: LIVE.map(c => ({ ...c })) };

    case "cdr": {
      let rows = CDR;
      const { from, to, dir, dispo, ext, term } = params || {};
      if (from) rows = rows.filter(r => r.start >= Number(from));
      if (to) rows = rows.filter(r => r.start <= Number(to));
      if (dir) rows = rows.filter(r => r.dir === dir);
      if (dispo) rows = rows.filter(r => r.dispo === dispo);
      if (ext) rows = rows.filter(r => r.ext === ext);
      if (term) {
        const t = String(term).toLowerCase();
        rows = rows.filter(r => (r.peer + r.name + r.ext + r.extname).toLowerCase().includes(t));
      }
      return { rows, total: rows.length };
    }

    case "extensions":
      return { rows: EXTENSIONS.map(e => ({ ...e, id: e.ext })) };

    case "trunks":
      return { rows: TRUNKS.map(t => ({ ...t, id: t.name })) };

    case "originate": {
      const { ext, number } = params;
      const id = `c${Date.now()}`;
      LIVE = [{
        id, dir: "out", peer: number, name: "", ext, state: "ringing",
        since: T(), trunk: "Shatel-Voip", recording: false,
      }, ...LIVE];
      /* بعد از چند ثانیه به حالت مکالمه می‌رود، مثل رفتار واقعی مرکز تلفن */
      setTimeout(() => {
        const c = LIVE.find(x => x.id === id);
        if (c) { c.state = "talking"; c.since = T(); c.recording = true; }
      }, 4200);
      return { ok: true, id };
    }

    case "hangup":
      LIVE = LIVE.filter(c => c.id !== params.id);
      return { ok: true };

    case "hold": {
      const c = LIVE.find(x => x.id === params.id);
      if (c) c.state = c.state === "hold" ? "talking" : "hold";
      return { ok: true, state: c?.state };
    }

    case "answer": {
      const c = LIVE.find(x => x.id === params.id);
      if (c) { c.state = "talking"; c.since = T(); }
      return { ok: true };
    }

    case "saveExtension": {
      const i = EXTENSIONS.findIndex(e => e.ext === params.ext);
      if (i >= 0) Object.assign(EXTENSIONS[i], params);
      else EXTENSIONS.push({ ...params, status: "offline" });
      return { ok: true };
    }

    case "settings":
      return {
        ami: { host: "127.0.0.1", port: 5038, user: "kariya", permit: "217.197.97.196/32", write: "originate" },
        click2call: { agentExt: "700", context: "click2call", confirm: true, maxConcurrent: 4 },
        recording: { enabled: true, path: "/var/spool/asterisk/monitor", keepDays: 90 },
      };

    default:
      throw new Error(`مسیر ناشناخته: ${path}`);
  }
}
