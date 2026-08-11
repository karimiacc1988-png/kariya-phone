<?php
require __DIR__ . '/_lib.php';

/**
 * یادداشت‌های یک تماس — یک نخ، نه یک خط.
 *
 * ⚠️ هر یادداشت ردیف خودش را دارد با نویسنده و زمان، و هیچ‌وقت بازنویسی
 * نمی‌شود. پیگیریِ یک تماس معمولاً چند مرحله است («تماس گرفتم، جواب نداد» /
 * «فردا دوباره» / «حل شد») و اگر همه در یک کادر جمع می‌شد، هر بار نفر بعدی
 * نوشته‌ی قبلی را پاک می‌کرد و سابقه‌ای نمی‌ماند.
 *
 *   POST { act:"add",  callId, body, author }  → یادداشت تازه
 *   POST { act:"list", callId }                → نخِ همان تماس
 */

$in = input();
$db = db('cdr');
$act = $in['act'] ?? 'list';

if ($act === 'add') {
  $callId = trim((string)($in['callId'] ?? ''));
  $body   = trim((string)($in['body'] ?? ''));
  if ($callId === '') fail('شناسه تماس لازم است');
  if ($body === '')   fail('متن یادداشت خالی است');

  $body   = mb_substr($body, 0, 4000);
  /* ⚠️ نویسنده را پل پنل می‌گذارد، نه مرورگر — وگرنه هر کسی می‌توانست
     یادداشتی به نام دیگری بنویسد. */
  $author = mb_substr((string)($in['author'] ?? ''), 0, 60);
  $norm   = normNumber((string)($in['number'] ?? ''));

  $stmt = $db->prepare("INSERT INTO kv_notes (uniqueid, norm, body, author) VALUES (?,?,?,?)");
  $stmt->bind_param('ssss', $callId, $norm, $body, $author);
  $stmt->execute();

  out(['ok' => true]);
}

$callId = trim((string)($in['callId'] ?? ''));
if ($callId === '') fail('شناسه تماس لازم است');

$stmt = $db->prepare(
  "SELECT id, body, author, UNIX_TIMESTAMP(created) AS created
   FROM kv_notes WHERE uniqueid = ? ORDER BY created ASC, id ASC LIMIT 200"
);
$stmt->bind_param('s', $callId);
$stmt->execute();
$res = $stmt->get_result();

$rows = [];
while ($r = $res->fetch_assoc()) {
  $rows[] = [
    'id'      => (int)$r['id'],
    'body'    => $r['body'],
    'author'  => $r['author'] ?: '',
    'created' => (int)$r['created'],
  ];
}

out(['rows' => $rows]);
