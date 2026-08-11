<?php
require __DIR__ . '/_lib.php';

/**
 * یادداشت و وضعیتِ پیگیریِ هر تماس.
 *
 * ⚠️ کنار خودِ داده‌ی تماس نگه داشته می‌شود (`asteriskcdrdb.kv_call_meta`) و نه
 * در دیتابیس پنل. تماس مالِ مرکز تلفن است؛ اگر روزی رابط عوض شود یا پنل
 * جابه‌جا شود، سابقه‌ی پیگیری‌ها باید همان‌جایی بماند که تماس‌ها هستند.
 *
 *   POST { act:"list", callIds:[…] }               → یادداشت و وضعیت آن تماس‌ها
 *   POST { act:"save", callId, note?, status? }    → ذخیره
 *
 * `list` هم POST است چون فهرست شناسه‌ها بلند است و در نشانی جا نمی‌شود.
 */

$in = input();
$db = db('cdr');
$act = $in['act'] ?? 'list';

/** وضعیت‌های مجاز. هرچه بیرون این فهرست باشد یعنی خالی. */
const STATUSES = ['todo', 'doing', 'done', 'hold'];

if ($act === 'save') {
  $callId = trim((string)($in['callId'] ?? ''));
  if ($callId === '') fail('شناسه تماس لازم است');

  $status = isset($in['status']) ? (string)$in['status'] : null;
  if ($status !== null && $status !== '' && !in_array($status, STATUSES, true)) fail('وضعیت نامعتبر است');

  /* هرکدام که فرستاده نشده دست‌نخورده می‌ماند: صفحه گاهی فقط یادداشت را
     می‌فرستد و گاهی فقط وضعیت را، و نباید آن یکی را پاک کند. */
  $stmt = $db->prepare(
    "INSERT INTO kv_call_meta (call_id, status, author) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), author = VALUES(author)"
  );
  $author = mb_substr((string)($in['author'] ?? ''), 0, 60);
  $statusParam = $status ?? '';
  $stmt->bind_param('sss', $callId, $statusParam, $author);
  $stmt->execute();

  out(['ok' => true]);
}

/* ---------------- فهرست ---------------- */

$ids = array_values(array_filter(array_map('strval', (array)($in['callIds'] ?? []))));
$ids = array_slice($ids, 0, 4000);
if (!$ids) out(['rows' => new stdClass()]);

$in_ = implode(',', array_fill(0, count($ids), '?'));
$types = str_repeat('s', count($ids));

$rows = [];

/* وضعیت */
$stmt = $db->prepare("SELECT call_id, status FROM kv_call_meta WHERE call_id IN ($in_)");
$stmt->bind_param($types, ...$ids);
$stmt->execute();
$res = $stmt->get_result();
while ($r = $res->fetch_assoc()) {
  $rows[$r['call_id']] = ['status' => $r['status'] ?? '', 'notes' => 0];
}

/* شمارِ یادداشت‌ها — فقط تعداد، نه خودشان. رنگِ آیکون همین را لازم دارد و
   فرستادن متنِ همه‌ی یادداشت‌های صفحه برای تصمیمِ «سبز یا طوسی» گران است. */
$stmt = $db->prepare("SELECT uniqueid, COUNT(*) AS c FROM kv_notes WHERE uniqueid IN ($in_) GROUP BY uniqueid");
$stmt->bind_param($types, ...$ids);
$stmt->execute();
$res = $stmt->get_result();
while ($r = $res->fetch_assoc()) {
  $key = $r['uniqueid'];
  if (!isset($rows[$key])) $rows[$key] = ['status' => '', 'notes' => 0];
  $rows[$key]['notes'] = (int)$r['c'];
}

out(['rows' => $rows ?: new stdClass()]);
