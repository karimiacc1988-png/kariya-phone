<?php
require __DIR__ . '/_lib.php';

// الگوی «اول به من، بعد به او» (دو تماس که مرکز تلفن به هم می‌چسباند):
//
//   پای اول (Channel): به شماره‌ی خودِ کاربر زنگ می‌خورد.
//   پای دوم (Exten):   بعد از جواب‌دادن، به شماره‌ی مقصد زنگ می‌خورد و bridge می‌شود.
//
// نکته‌ی حیاتی: هر دو پا باید از دیالپلن «from-internal» بروند تا مسیر خروجی
// (ترانک) را پیدا کنند و در CDR ثبت شوند. اگر پای اول یک داخلی باشد،
// Local/<ext>@from-internal مستقیم همان داخلی را زنگ می‌زند.
$in = input();
$from   = preg_replace('/[^\d*#+]/', '', (string)($in['from'] ?? $in['ext'] ?? ''));
$number = preg_replace('/[^\d*#+]/', '', (string)($in['number'] ?? ''));

if (strlen($from) < 2)   fail('شماره‌ی شما تنظیم نشده است');
if (strlen($number) < 3) fail('شماره مقصد نامعتبر است');
if ($from === $number)   fail('شماره‌ی مبدأ و مقصد یکی است');

global $CFG;
$ctx = $CFG['click2call']['context'];   // from-internal

$ami = new Ami();
$r = $ami->action([
  'Action'   => 'Originate',
  // پای اول: به شماره‌ی کاربر. /n یعنی کانال Local بعد از وصل‌شدن حذف نشود
  'Channel'  => "Local/$from@$ctx/n",
  // پای دوم: مقصد در همان دیالپلن گرفته می‌شود
  'Context'  => $ctx,
  'Exten'    => $number,
  'Priority' => 1,
  // روی نمایشگر کاربر، شماره‌ی مقصد دیده شود تا بداند به کی وصل می‌شود
  'CallerID' => "$number <$number>",
  // مهلت زنگ‌خوردن پای اول. ایزابل برای تماس خروجی ۳۰۰ ثانیه می‌گذارد که
  // باعث می‌شود گوشی رها نشود؛ اینجا با متغیر کانال کوتاهش می‌کنیم.
  'Timeout'  => 45000,
  'Variable' => "TRUNK_RING_TIMER=45,RINGTIMER=45,__RINGTIMER=45,LIMIT_TIMEOUT=45",
  'Async'    => 'true',
]);

// در حالت Async پاسخ ممکن است در بسته‌های بعدی بیاید — همه را می‌گردیم
$ok = false; $msg = '';
foreach ($r as $p) {
  $resp = $p['Response'] ?? '';
  if (stripos($resp, 'Success') !== false) { $ok = true; break; }
  if (($p['Event'] ?? '') === 'OriginateResponse' && stripos($p['Response'] ?? '', 'Success') !== false) { $ok = true; break; }
  if ($resp !== '' && !$msg) $msg = $p['Message'] ?? '';
}
if (!$ok) fail('برقراری تماس ناموفق بود: ' . ($msg ?: 'مرکز تلفن پاسخ نداد'));

out(['ok' => true, 'from' => $from, 'number' => $number]);
