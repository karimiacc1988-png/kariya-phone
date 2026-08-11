<?php
require __DIR__ . '/_lib.php';

// دفترچه‌ی مشتریان (CRM). خواندن با GET، ذخیره/حذف با POST.
$in = input();
$db = db('cdr');
$act = $in['act'] ?? 'list';

/* ---------------- ذخیره ---------------- */
if ($act === 'save') {
  $number = trim((string)($in['number'] ?? ''));
  $name   = trim((string)($in['name'] ?? ''));
  $norm   = normNumber($number);
  if ($norm === '') fail('شماره نامعتبر است');
  if ($name === '') fail('نام را وارد کنید');

  $stmt = $db->prepare(
    "INSERT INTO kv_contacts (norm, number, name, company, note, source)
     VALUES (?,?,?,?,?, 'manual')
     ON DUPLICATE KEY UPDATE number=VALUES(number), name=VALUES(name),
                             company=VALUES(company), note=VALUES(note)"
  );
  $company = trim((string)($in['company'] ?? ''));
  $note    = trim((string)($in['note'] ?? ''));
  $stmt->bind_param('sssss', $norm, $number, $name, $company, $note);
  $stmt->execute();
  out(['ok' => true, 'norm' => $norm]);
}

/* ---------------- حذف ---------------- */
if ($act === 'delete') {
  $norm = normNumber((string)($in['number'] ?? ''));
  if ($norm === '') fail('شماره نامعتبر است');
  $stmt = $db->prepare("DELETE FROM kv_contacts WHERE norm=?");
  $stmt->bind_param('s', $norm);
  $stmt->execute();
  out(['ok' => true]);
}

/* ---------------- پرونده‌ی یک مشتری (حالت CRM) ---------------- */
if ($act === 'profile') {
  $norm = normNumber((string)($in['number'] ?? ''));
  if ($norm === '') fail('شماره نامعتبر است');

  $stmt = $db->prepare("SELECT norm,number,name,company,note FROM kv_contacts WHERE norm=?");
  $stmt->bind_param('s', $norm);
  $stmt->execute();
  $contact = $stmt->get_result()->fetch_assoc() ?: null;

  // همه‌ی تماس‌های این شماره، با هر شکلی که ثبت شده
  $like = '%' . $norm;
  $stmt = $db->prepare(
    "SELECT calldate, src, dst, dcontext, channel, dstchannel, disposition, duration, billsec, uniqueid, recordingfile
     FROM cdr WHERE src LIKE ? OR dst LIKE ? ORDER BY calldate DESC LIMIT 300"
  );
  $stmt->bind_param('ss', $like, $like);
  $stmt->execute();
  $res = $stmt->get_result();

  $extNames = [];
  $pdb = db('pbx');
  if ($q = $pdb->query("SELECT extension,name FROM users")) {
    while ($r = $q->fetch_assoc()) $extNames[$r['extension']] = $r['name'];
  }

  $calls = [];
  $sumBill = 0; $answered = 0; $first = null; $last = null;
  while ($r = $res->fetch_assoc()) {
    $dir = dirFromContext($r['dcontext']);
    $ext = extFromChannel($r['channel']) ?: extFromChannel($r['dstchannel']);
    $ts = strtotime($r['calldate']);
    $sumBill += (int)$r['billsec'];
    if ($r['disposition'] === 'ANSWERED') $answered++;
    $last = $last ?? $ts; $first = $ts;
    $calls[] = [
      'id' => $r['uniqueid'], 'start' => $ts, 'dir' => $dir,
      'ext' => $ext, 'extname' => $extNames[$ext] ?? '',
      'dispo' => $r['disposition'], 'bill' => (int)$r['billsec'],
      'ring' => max(0, (int)$r['duration'] - (int)$r['billsec']),
      'recording' => !empty($r['recordingfile']),
    ];
  }

  // یادداشت‌ها
  $stmt = $db->prepare("SELECT body, author, created FROM kv_notes WHERE norm=? ORDER BY created DESC LIMIT 50");
  $stmt->bind_param('s', $norm);
  $stmt->execute();
  $nres = $stmt->get_result();
  $notes = [];
  while ($r = $nres->fetch_assoc()) {
    $notes[] = ['body' => $r['body'], 'author' => $r['author'], 'created' => strtotime($r['created'])];
  }

  out([
    'contact' => $contact,
    'norm'    => $norm,
    'calls'   => $calls,
    'notes'   => $notes,
    'stats'   => [
      'total'    => count($calls),
      'answered' => $answered,
      'talk'     => $sumBill,
      'first'    => $first,
      'last'     => $last,
    ],
  ]);
}

/* ---------------- فهرست ---------------- */
$term = trim((string)($in['term'] ?? ''));
if ($term !== '') {
  $t = '%' . $term . '%';
  $n = '%' . normNumber($term) . '%';
  $stmt = $db->prepare(
    "SELECT norm,number,name,company,note,updated FROM kv_contacts
     WHERE name LIKE ? OR company LIKE ? OR norm LIKE ? ORDER BY name LIMIT 500"
  );
  $stmt->bind_param('sss', $t, $t, $n);
  $stmt->execute();
  $res = $stmt->get_result();
} else {
  $res = $db->query("SELECT norm,number,name,company,note,updated FROM kv_contacts ORDER BY name LIMIT 500");
}

$rows = [];
while ($r = $res->fetch_assoc()) {
  $rows[] = [
    'id' => $r['norm'], 'norm' => $r['norm'], 'number' => $r['number'],
    'name' => $r['name'], 'company' => $r['company'], 'note' => $r['note'],
    'updated' => strtotime($r['updated']),
  ];
}
out(['rows' => $rows]);
