// فحص قائمة الأكلات public/foods.js
// التشغيل: node scripts/check-foods.mjs   (يطلع بخطأ لو فيه مشكلة)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../public/foods.js', import.meta.url), 'utf8');
const FOODS = vm.runInNewContext(src + '\n;FOODS');

const CATS = [
  'فواكه', 'خضار', 'نشويات وحبوب', 'خبز ومعجنات', 'لحوم ودواجن وأسماك', 'بيض وألبان وأجبان',
  'بقوليات', 'تمور', 'مكسرات وبذور', 'دهون وصوصات وإضافات', 'مشروبات', 'حلويات',
  'أكلات سعودية وخليجية', 'وجبات سريعة',
];

// أصناف مسموح لها تخرج عن معادلة 4p + 4c + 9f، مع السبب.
// (ما فيه مشروبات كحولية في القائمة أصلاً، فما تحتاج استثناء)
const EXCEPTIONS = {
  'f-corn': 'ألياف 2.4غ/100غ تُحسب في الكارب بسعرات أقل؛ القيمة 96 من USDA',
  'f-tomato-paste': 'ألياف 4.1غ/100غ تُحسب في الكارب بسعرات أقل؛ القيمة 82 من USDA',
};

// أسماء شركات تجارية ما يصير تكون في القائمة (مكانها الباركود)
const BRANDS = /(نوتيلا|nutella|كيت ?كات|kitkat|بيبسي|ببسي|pepsi|كوكا|coca|سفن ?اب|7up|سبرايت|sprite|فانتا|fanta|المراعي|almarai|نادك|nadec|السعودية للالبان|صافولا|ماكدونالدز|mcdonald|كنتاكي|kfc|البيك|albaik|هرفي|كودو|ستاربكس|starbucks|كيري|kiri|لافاش ?كيري|ابو ولد|اندومي|indomie|فيمتو|vimto|ريد ?بول|red ?bull|هيرشي|hershey|سنيكرز|snickers|galaxy|جالكسي|لوكر|loacker|اوريو|oreo|دانون|danone|نستله|nestle|كيلوجز|kellogg)/i;

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f?.id || '?'} (${f?.name || ''}): ${m}`);

if (!Array.isArray(FOODS) || !FOODS.length) {
  console.error('FOODS مو مصفوفة أو فاضية');
  process.exit(1);
}

const ids = new Map(), names = new Map();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

for (const f of FOODS) {
  // المعرّف لازم يطابق اللي يقبله /api/products في حقل ref
  if (typeof f.id !== 'string' || !/^f-[a-z0-9-]{1,40}$/.test(f.id)) err(f, 'id لازم يكون بصيغة f-xxx (حروف إنجليزية صغيرة وأرقام وشرطة)');
  if (ids.has(f.id)) err(f, 'id مكرر');
  ids.set(f.id, f);

  if (typeof f.name !== 'string' || !f.name.trim()) err(f, 'الاسم فاضي');
  else if (f.name.length > 80) err(f, 'الاسم أطول من 80 حرف');
  const n = norm(f.name);
  if (names.has(n)) err(f, `الاسم مكرر مع ${names.get(n)}`);
  names.set(n, f.id);

  if (!Array.isArray(f.alt) || f.alt.some((a) => typeof a !== 'string' || !a.trim())) err(f, 'alt لازم مصفوفة نصوص');
  if (!CATS.includes(f.cat)) err(f, `تصنيف غير معروف: ${f.cat}`);
  if (typeof f.approx !== 'boolean') err(f, 'approx لازم true أو false');

  for (const s of [f.name, ...(f.alt || [])]) if (BRANDS.test(s)) err(f, `فيه اسم شركة تجارية: ${s}`);

  // الأرقام: موجبة (أو صفر للعناصر الغذائية) ومنطقية
  const nums = { kcal: f.kcal, p: f.p, c: f.c, f: f.f };
  let bad = false;
  for (const [k, v] of Object.entries(nums)) if (!isNum(v) || v < 0) { err(f, `${k} لازم رقم موجب`); bad = true; }
  if (bad) continue;
  if (!(f.kcal > 0)) err(f, 'السعرات لازم أكبر من صفر');
  if (f.kcal > 900) err(f, 'السعرات أكثر من 900 لكل 100غ');
  const sum = f.p + f.c + f.f;
  if (sum > 100) err(f, `مجموع p+c+f = ${sum.toFixed(1)} أكثر من 100`);

  // توافق السعرات مع المعادلة: الفرق ≤ 15% أو ≤ 15 سعرة
  const calc = 4 * f.p + 4 * f.c + 9 * f.f;
  const diff = Math.abs(calc - f.kcal);
  const pct = diff / f.kcal;
  if (diff > 15 && pct > 0.15) {
    if (EXCEPTIONS[f.id]) warns.push(`${f.id}: مستثنى (${EXCEPTIONS[f.id]})، الفرق ${diff.toFixed(1)}`);
    else err(f, `السعرات ${f.kcal} بعيدة عن 4p+4c+9f = ${calc.toFixed(1)} (فرق ${diff.toFixed(1)} / ${(pct * 100).toFixed(0)}%)`);
  } else if (EXCEPTIONS[f.id]) {
    warns.push(`${f.id}: موجود في الاستثناءات بس ما يحتاجه، احذفيه منها`);
  }

  // الوحدات: نفس حدود /api/products (≤ 8، اسم ≤ 20 حرف، g بين 1 و 2000)
  if (!Array.isArray(f.units) || !f.units.length) err(f, 'لازم وحدة وحدة على الأقل');
  else {
    if (f.units.length > 8) err(f, 'أكثر من 8 وحدات');
    const un = new Set();
    for (const u of f.units) {
      if (!u || typeof u.n !== 'string' || !u.n.trim()) err(f, 'وحدة بدون اسم');
      else if (u.n.length > 20) err(f, `اسم الوحدة "${u.n}" أطول من 20 حرف`);
      if (!isNum(u?.g) || u.g < 1 || u.g > 2000) err(f, `وزن الوحدة "${u?.n}" لازم بين 1 و 2000 غ`);
      if (un.has(u?.n)) err(f, `وحدة مكررة "${u?.n}"`);
      un.add(u?.n);
    }
  }
}

for (const id of Object.keys(EXCEPTIONS)) if (!ids.has(id)) warns.push(`${id}: في الاستثناءات بس مو موجود في القائمة`);

const byCat = {};
for (const f of FOODS) byCat[f.cat] = (byCat[f.cat] || 0) + 1;
console.log(`عدد الأصناف: ${FOODS.length} (تقريبي: ${FOODS.filter((f) => f.approx).length})`);
for (const c of CATS) console.log(`  ${c}: ${byCat[c] || 0}`);
for (const w of warns) console.log('ملاحظة: ' + w);

if (errors.length) {
  console.error(`\n${errors.length} خطأ:`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\n✓ ما فيه أخطاء');
