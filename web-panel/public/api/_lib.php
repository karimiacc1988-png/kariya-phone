<?php
// کتابخانه‌ی مشترک API کاریا تلفن
// - خروجی همیشه JSON با همان شکلی که mock.js می‌داد، تا رابط تغییر نکند.
// - AMI: اتصال کوتاه‌عمر به 127.0.0.1:5038 برای هر عملیات.
// - دیتابیس: mysqli لوکال برای CDR و داخلی‌ها و ترانک‌ها.

declare(strict_types=1);
mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Tehran');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$CFG = require __DIR__ . '/_config.php';

function fail(string $msg, int $code = 400): void {
  http_response_code($code);
  echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

function out($data): void {
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

// ورودی: هم GET و هم بدنه‌ی JSON (POST) پشتیبانی می‌شود
function input(): array {
  $p = $_GET;
  $raw = file_get_contents('php://input');
  if ($raw) {
    $j = json_decode($raw, true);
    if (is_array($j)) $p = array_merge($p, $j);
  }
  return $p;
}

/* ----------------------------- دیتابیس ----------------------------- */

function db(string $which = 'cdr'): mysqli {
  global $CFG;
  $name = $which === 'pbx' ? $CFG['db']['pbx'] : $CFG['db']['cdr'];
  $m = @new mysqli($CFG['db']['host'], $CFG['db']['user'], $CFG['db']['pass'], $name);
  if ($m->connect_errno) fail('اتصال به دیتابیس ناموفق بود', 500);
  $m->set_charset('utf8mb4');
  return $m;
}

/* ------------------------------- AMI ------------------------------- */

class Ami {
  private $sock;

  function __construct() {
    global $CFG;
    $this->sock = @fsockopen($CFG['ami']['host'], $CFG['ami']['port'], $e, $s, 4);
    if (!$this->sock) fail('اتصال به مرکز تلفن (AMI) ناموفق بود', 500);
    stream_set_timeout($this->sock, 4);
    $this->readUntil("\r\n"); // بنر
    $r = $this->action(['Action' => 'Login', 'Username' => $CFG['ami']['user'], 'Secret' => $CFG['ami']['secret']]);
    if (stripos($r[0]['Response'] ?? '', 'Success') === false) fail('ورود AMI رد شد', 500);
  }

  function __destruct() {
    if ($this->sock) { @fwrite($this->sock, "Action: Logoff\r\n\r\n"); @fclose($this->sock); }
  }

  // یک اکشن می‌فرستد و همه‌ی رویدادها را تا پایان می‌خواند
  function action(array $fields, ?string $completeEvent = null): array {
    $id = 'k' . mt_rand(1000, 9999) . microtime(true);
    $fields['ActionID'] = $id;
    $msg = '';
    foreach ($fields as $k => $v) $msg .= "$k: $v\r\n";
    @fwrite($this->sock, $msg . "\r\n");

    $packets = [];
    $buf = '';
    $deadline = microtime(true) + 4;
    while (microtime(true) < $deadline) {
      $line = fgets($this->sock);
      if ($line === false) {
        $info = stream_get_meta_data($this->sock);
        if ($info['timed_out']) break;
        continue;
      }
      $line = rtrim($line, "\r\n");
      if ($line === '') {
        if ($buf !== '') { $packets[] = $this->parse($buf); $buf = ''; }
        // پایان: اگر رویداد کامل‌شدن آمده یا فقط یک پاسخ ساده بوده
        $last = end($packets);
        if ($completeEvent && isset($last['Event']) && stripos($last['Event'], $completeEvent) !== false) break;
        if (!$completeEvent && $last && isset($last['Response'])) break;
        continue;
      }
      $buf .= $line . "\n";
    }
    if ($buf !== '') $packets[] = $this->parse($buf);
    return $packets;
  }

  private function parse(string $blk): array {
    $o = [];
    foreach (explode("\n", trim($blk)) as $l) {
      $p = strpos($l, ':');
      if ($p !== false) $o[trim(substr($l, 0, $p))] = trim(substr($l, $p + 1));
    }
    return $o;
  }

  private function readUntil(string $stop): void {
    $deadline = microtime(true) + 3;
    while (microtime(true) < $deadline) {
      $l = fgets($this->sock);
      if ($l === false || strpos($l, $stop) !== false) break;
    }
  }
}

/* --------------------------- کمکی‌ها --------------------------- */

// شماره‌ی داخلی را از نام کانال بیرون می‌کشد: SIP/102-0000abcd -> 102
function extFromChannel(?string $ch): string {
  if (!$ch) return '';
  if (preg_match('#^[A-Za-z0-9]+/(\d{2,6})#', $ch, $m)) return $m[1];
  return '';
}

// جهت تماس از context: from-internal یعنی خروجی، بقیه ورودی
function dirFromContext(?string $ctx): string {
  return (stripos((string)$ctx, 'from-internal') !== false) ? 'out' : 'in';
}

/**
 * نرمال‌سازی شماره تا یک شماره در همه‌ی شکل‌هایش یکی شمرده شود:
 *   09121234567 / 9121234567 / +989121234567 / 00989121234567  →  9121234567
 *   02191004048 / 2191004048 / +982191004048                   →  2191004048
 * برای همین است که دفترچه با هر شکلی که در CDR ثبت شده جور درمی‌آید.
 */
function normNumber(?string $v): string {
  $s = preg_replace('/\D/', '', (string)$v);
  if ($s === '') return '';
  if (strpos($s, '0098') === 0) $s = substr($s, 4);
  elseif (strpos($s, '98') === 0 && strlen($s) > 10) $s = substr($s, 2);
  $s = ltrim($s, '0');
  // داخلی‌ها (۲ تا ۵ رقم) همان‌طور می‌مانند
  return $s;
}

/** نام مشتری‌ها را برای مجموعه‌ای از شماره‌ها یک‌جا می‌خواند (بدون کوئری در حلقه) */
function lookupNames(array $numbers): array {
  $norms = [];
  foreach ($numbers as $n) { $k = normNumber($n); if ($k !== '') $norms[$k] = true; }
  if (!$norms) return [];

  $db = db('cdr');
  $keys = array_keys($norms);
  $in = implode(',', array_fill(0, count($keys), '?'));
  $stmt = $db->prepare("SELECT norm, name, company FROM kv_contacts WHERE norm IN ($in)");
  $stmt->bind_param(str_repeat('s', count($keys)), ...$keys);
  $stmt->execute();
  $res = $stmt->get_result();

  $map = [];
  while ($r = $res->fetch_assoc()) {
    $map[$r['norm']] = $r['company'] ? "{$r['name']} — {$r['company']}" : $r['name'];
  }
  return $map;
}
