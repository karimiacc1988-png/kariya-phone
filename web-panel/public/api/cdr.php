<?php
require __DIR__ . '/_lib.php';

/**
 * گزارش تماس‌ها — یک ردیف به‌ازای هر تماس، نه به‌ازای هر پا.
 *
 * ⚠️ **هر تماسِ click-to-call در CDR دو ردیف است و این عمدیِ آستریسک است.**
 * وقتی پنل تماس می‌گیرد، مرکز تلفن دو پا می‌سازد: یکی به خودِ تماس‌گیرنده زنگ
 * می‌زند و یکی به مقصد، و بعد آن دو را به هم می‌چسباند. هر دو پا در جدول
 * `cdr` ردیف خودشان را دارند و `linkedid` مشترک، پس فهرستِ خام هر تماس را دو
 * بار نشان می‌داد.
 *
 * سه چیزی که کاربر می‌خواهد ببیند و از کجا می‌آید:
 *
 *   تماس‌گیرنده  — کسی که درخواست تماس داده. **داخل نام کانال است**:
 *                  `Local/09121881481@from-internal-…` — و روی هر دو پا هست،
 *                  که همین آن را قابل‌اعتمادترین منبع می‌کند.
 *   شماره مرجع   — شماره‌ای که روی خط بیرون می‌رود (`src`)، یعنی شماره‌ی
 *                  نمایشیِ ترانک: 2191004048.
 *   دریافت‌کننده — مقصدِ واقعی؛ آن `dst`ی که خودِ تماس‌گیرنده نیست.
 */

$in = input();
$db = db('cdr');

// نام داخلی‌ها برای ستون «کاربر داخلی»
$extNames = [];
$pdb = db('pbx');
if ($res = $pdb->query("SELECT extension, name FROM users")) {
  while ($r = $res->fetch_assoc()) $extNames[$r['extension']] = $r['name'];
}

$where = [];
$args = [];
$types = '';

if (!empty($in['from'])) { $where[] = 'calldate >= FROM_UNIXTIME(?)'; $args[] = (int)$in['from']; $types .= 'i'; }
if (!empty($in['to']))   { $where[] = 'calldate <= FROM_UNIXTIME(?)'; $args[] = (int)$in['to']; $types .= 'i'; }
if (!empty($in['dispo'])) { $where[] = 'disposition = ?'; $args[] = $in['dispo']; $types .= 's'; }
if (!empty($in['term'])) {
  $t = '%' . $in['term'] . '%';
  $where[] = '(src LIKE ? OR dst LIKE ? OR clid LIKE ? OR channel LIKE ?)';
  array_push($args, $t, $t, $t, $t); $types .= 'ssss';
}

$sql = "SELECT calldate, src, dst, dcontext, clid, channel, dstchannel, disposition,
               duration, billsec, recordingfile, uniqueid, linkedid, cnam
        FROM cdr";
if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
/* سقف روی ردیف‌های خام است و چون هر تماس تا دو ردیف دارد، تماس‌های نهایی
   حدود نصف این عدد می‌شوند. */
$sql .= ' ORDER BY calldate DESC LIMIT 4000';

$stmt = $db->prepare($sql);
if ($args) $stmt->bind_param($types, ...$args);
$stmt->execute();
$res = $stmt->get_result();

/* ---------- گروه‌بندی پاها بر اساس linkedid ---------- */

$groups = [];
while ($r = $res->fetch_assoc()) {
  $key = $r['linkedid'] ?: $r['uniqueid'];
  $groups[$key][] = $r;
}

$calls = [];
foreach ($groups as $key => $legs) {
  /* پای اصلی: همانی که uniqueid و linkedid یکی‌اند. اگر نبود، اولی. */
  $primary = $legs[0];
  foreach ($legs as $leg) {
    if ($leg['uniqueid'] === $leg['linkedid']) { $primary = $leg; break; }
  }

  $dir = dirFromContext($primary['dcontext']);

  /* تماس‌گیرنده از نام کانال. برای تماس‌های عادیِ داخلی (SIP/102-…) همان
     شماره‌ی داخلی درمی‌آید که باز هم درست است. */
  $caller = '';
  foreach ($legs as $leg) {
    if (preg_match('~^Local/([0-9*\#]+)@~', $leg['channel'], $m)) { $caller = $m[1]; break; }
  }
  if ($caller === '') $caller = extFromChannel($primary['channel']);
  if ($caller === '') $caller = $primary['src'];

  /* شماره‌ی مرجع: شماره‌ای که روی خط بیرون می‌رود.
     ⚠️ از `src`ِ پای اصلی برداشته نمی‌شود. در تماسی که نگرفت، آستریسک روی یکی
     از پاها شماره‌ی مقصد را در `src` می‌نشاند و آن پا ممکن است همان پای اصلی
     باشد — نتیجه‌اش این بود که «شماره مرجع» گاهی موبایل طرف مقابل را نشان
     می‌داد. پرتکرارترین `src` میان پاها همان شماره‌ی نمایشیِ ترانک است. */
  $srcCounts = [];
  foreach ($legs as $leg) {
    if ($leg['src'] !== '') $srcCounts[$leg['src']] = ($srcCounts[$leg['src']] ?? 0) + 1;
  }
  arsort($srcCounts);
  /* ⚠️ رشته، حتماً. `array_key_first` کلید را برمی‌گرداند و PHP کلیدهای
     تماماً عددی را خودش به int تبدیل می‌کند — و سمت مرورگر، `replace` روی عدد
     وجود ندارد و کل صفحه‌ی گزارش سفید می‌شد. */
  $reference = (string)($srcCounts ? array_key_first($srcCounts) : $primary['src']);

  /* دریافت‌کننده: مقصدی که خودِ تماس‌گیرنده نیست. */
  $callerNorm = normNumber($caller);
  $receiver = '';
  foreach ($legs as $leg) {
    if ($leg['dst'] !== '' && normNumber($leg['dst']) !== $callerNorm) { $receiver = $leg['dst']; break; }
  }
  /* تماسی که نگرفت گاهی هر دو پایش مقصدِ یکسان ثبت می‌شود؛ آن‌وقت شماره‌ی
     مقصد را از `src`ِ پای دیگر برمی‌داریم. */
  if ($receiver === '') {
    foreach ($legs as $leg) {
      if ($leg['src'] !== '' && normNumber($leg['src']) !== $callerNorm
          && normNumber($leg['src']) !== normNumber($reference)) { $receiver = $leg['src']; break; }
    }
  }
  if ($receiver === '') $receiver = $primary['dst'];

  /* داخلی، اگر یکی از پاها از یک داخلی آمده باشد. */
  $ext = '';
  foreach ($legs as $leg) {
    $candidate = extFromChannel($leg['channel']) ?: extFromChannel($leg['dstchannel']);
    if ($candidate !== '' && isset($extNames[$candidate])) { $ext = $candidate; break; }
  }

  /* نتیجه و مدت از بهترین پا: اگر یک پا وصل شده، تماس وصل شده است. */
  $dispo = 'FAILED';
  $bill = 0; $total = 0; $recording = false; $start = PHP_INT_MAX;
  $answered = false;
  foreach ($legs as $leg) {
    $start = min($start, strtotime($leg['calldate']));
    $bill = max($bill, (int)$leg['billsec']);
    $total = max($total, (int)$leg['duration']);
    if (!empty($leg['recordingfile'])) $recording = true;
    if ($leg['disposition'] === 'ANSWERED') { $answered = true; }
    elseif (!$answered) { $dispo = $leg['disposition'] ?: $dispo; }
  }
  if ($answered) $dispo = 'ANSWERED';

  $calls[] = [
    'id'        => (string)$key,
    'start'     => $start,
    'dir'       => $dir,
    'caller'    => $caller,
    'reference' => $reference,
    'receiver'  => $receiver,
    /* `peer` برای سازگاری می‌ماند: پرونده‌ی مشتری و جستجوها هنوز از آن
       استفاده می‌کنند و «طرف مقابل» همان دریافت‌کننده است. */
    'peer'      => $receiver,
    'src'       => $caller,
    'dst'       => $receiver,
    'name'      => '',
    'ext'       => $ext,
    'extname'   => $extNames[$ext] ?? '',
    'trunk'     => '',
    'dispo'     => $dispo,
    'ring'      => max(0, $total - $bill),
    'bill'      => $bill,
    'total'     => $total,
    'recording' => $recording,
  ];
}

/* فیلترهایی که فقط بعد از یکی‌شدنِ پاها معنی دارند. */
$dirFilter = $in['dir'] ?? '';
$extFilter = $in['ext'] ?? '';
if ($dirFilter || $extFilter) {
  $calls = array_values(array_filter($calls, function ($c) use ($dirFilter, $extFilter) {
    if ($dirFilter && $c['dir'] !== $dirFilter) return false;
    if ($extFilter && $c['ext'] !== $extFilter) return false;
    return true;
  }));
}

/* نام مشتری‌ها از دفترچه، برای هر دو سرِ خط. */
$names = lookupNames(array_merge(
  array_column($calls, 'caller'),
  array_column($calls, 'receiver')
));
foreach ($calls as &$c) {
  $c['callerName']   = $names[normNumber($c['caller'])] ?? '';
  $c['receiverName'] = $names[normNumber($c['receiver'])] ?? '';
  $c['name']         = $c['receiverName'];
}
unset($c);

usort($calls, fn($a, $b) => $b['start'] <=> $a['start']);

out(['rows' => $calls, 'total' => count($calls)]);
