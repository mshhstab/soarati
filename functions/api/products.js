// المنتجات المضافة يدوياً: عرض الكل / حفظ أو تعديل / حذف
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
// يرجّع null لو فاضي، NaN لو غير صالح
const num = (v, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return NaN;
  return Math.round(n * 10) / 10;
};
const ID_RE = /^(\d{6,14}|m[a-z0-9]{6,24})$/;

// نسخة مختصرة تُحفظ كـ metadata عشان نقرأ القائمة كاملة بطلب واحد
// (حد الـ metadata 1024 بايت؛ لو الوحدات ما تكفي تنحفظ في القيمة فقط ونجيبها عند العرض)
const compact = (p) => ({ i: p.id, b: p.barcode || '', n: p.name, r: p.brand || '', k: p.kcal, p: p.protein, c: p.carbs, f: p.fat, s: p.serving,
  ...(p.ref ? { x: p.ref } : {}), ...(p.units ? { u: p.units.map((u) => [u.n, u.g]) } : {}) });
const expand = (m) => ({
  id: m.i, barcode: m.b || null, name: m.n, brand: m.r || '', kcal: m.k,
  protein: m.p ?? null, carbs: m.c ?? null, fat: m.f ?? null, serving: m.s ?? null, image: null, mine: true,
  ...(m.x ? { ref: m.x } : {}), ...(Array.isArray(m.u) ? { units: m.u.map(([n, g]) => ({ n, g })) } : {}),
});
const META_MAX = 1024;
const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;
function metaFor(p) {
  const m = compact(p);
  if (bytes(m) <= META_MAX) return m;
  delete m.u; m.uv = 1; // الوحدات في القيمة فقط
  return m;
}

// معرّف صنف من قائمة الأكلات المدمجة (foods.js)
const REF_RE = /^f-[a-z0-9-]{1,40}$/;
// الوحدات: مصفوفة ≤ 8، اسم ≤ 20 حرف، الوزن بين 1 و 2000 غ. يرجّع null لو فاضية، NaN لو غير صالحة
function parseUnits(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length > 8) return NaN;
  const out = [];
  for (const u of v) {
    if (!u || typeof u !== 'object') return NaN;
    const n = clean(u.n, 20), g = num(u.g, 2000);
    if (!n || g === null || Number.isNaN(g) || g < 1) return NaN;
    if (!out.some((x) => x.n === n)) out.push({ n, g });
  }
  return out.length ? out : null;
}

const noKV = () => json({ error: 'قاعدة الحفظ غير مربوطة (FOOD)' }, 500);

export async function onRequestGet({ env }) {
  if (!env.FOOD) return noKV();
  const products = [], needUnits = [];
  let cursor;
  do {
    const r = await env.FOOD.list({ prefix: 'p:', cursor });
    for (const k of r.keys) if (k.metadata) {
      products.push(expand(k.metadata));
      if (k.metadata.uv) needUnits.push(k.metadata.i);
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  // منتجات وحداتها ما وسعتها الـ metadata: نجيب الوحدات من القيمة
  await Promise.all(needUnits.map(async (id) => {
    const full = await env.FOOD.get('p:' + id, 'json');
    const p = products.find((x) => x.id === id);
    if (p && Array.isArray(full?.units)) p.units = full.units;
  }));
  return json({ products });
}

export async function onRequestPost({ request, env }) {
  if (!env.FOOD) return noKV();
  let b;
  try { b = await request.json(); } catch { return json({ error: 'بيانات غير صالحة' }, 400); }

  const barcode = String(b.barcode ?? '').replace(/\D/g, '');
  if (barcode && (barcode.length < 6 || barcode.length > 14)) return json({ error: 'رقم الباركود غير صحيح' }, 400);

  const name = clean(b.name, 80);
  if (!name) return json({ error: 'اكتبي اسم المنتج' }, 400);

  const kcal = num(b.kcal, 900);
  if (kcal === null || Number.isNaN(kcal)) return json({ error: 'السعرات لكل 100غ لازم تكون رقم بين 0 و 900' }, 400);

  const protein = num(b.protein, 100), carbs = num(b.carbs, 100), fat = num(b.fat, 100);
  if ([protein, carbs, fat].some(Number.isNaN)) return json({ error: 'البروتين والكارب والدهون لازم تكون بين 0 و 100 غرام' }, 400);
  if ((protein || 0) + (carbs || 0) + (fat || 0) > 105) return json({ error: 'مجموع البروتين والكارب والدهون أكثر من 100غ، راجعي الأرقام' }, 400);

  const serving = num(b.serving, 5000);
  if (Number.isNaN(serving)) return json({ error: 'حجم الحصة غير صحيح' }, 400);

  // ref: نسخة معدّلة من صنف في قائمة الأكلات، و units: وحداته (حبة، كوب...)
  const ref = b.ref == null || b.ref === '' ? null : String(b.ref);
  if (ref && !REF_RE.test(ref)) return json({ error: 'معرّف الصنف غير صحيح' }, 400);
  const units = parseUnits(b.units);
  if (Number.isNaN(units)) return json({ error: 'وحدات الصنف غير صحيحة' }, 400);

  // المنتج بباركود يُحفظ برقم الباركود، وبدونه بمعرّف عشوائي
  let id = barcode;
  if (!id) {
    const given = String(b.id || '');
    id = /^m[a-z0-9]{6,24}$/.test(given) ? given : 'm' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }

  const product = { id, barcode: barcode || null, name, brand: clean(b.brand, 50), kcal, protein, carbs, fat, serving, image: null, mine: true };
  if (ref) product.ref = ref;
  if (units) product.units = units;
  await env.FOOD.put('p:' + id, JSON.stringify(product), { metadata: metaFor(product) });
  return json({ product });
}

export async function onRequestDelete({ request, env }) {
  if (!env.FOOD) return noKV();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) return json({ error: 'معرّف غير صحيح' }, 400);
  await env.FOOD.delete('p:' + id);
  return json({ ok: true });
}
