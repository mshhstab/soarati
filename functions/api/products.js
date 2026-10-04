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
const compact = (p) => ({ i: p.id, b: p.barcode || '', n: p.name, r: p.brand || '', k: p.kcal, p: p.protein, c: p.carbs, f: p.fat, s: p.serving });
const expand = (m) => ({
  id: m.i, barcode: m.b || null, name: m.n, brand: m.r || '', kcal: m.k,
  protein: m.p ?? null, carbs: m.c ?? null, fat: m.f ?? null, serving: m.s ?? null, image: null, mine: true,
});

const noKV = () => json({ error: 'قاعدة الحفظ غير مربوطة (FOOD)' }, 500);

export async function onRequestGet({ env }) {
  if (!env.FOOD) return noKV();
  const products = [];
  let cursor;
  do {
    const r = await env.FOOD.list({ prefix: 'p:', cursor });
    for (const k of r.keys) if (k.metadata) products.push(expand(k.metadata));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
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

  // المنتج بباركود يُحفظ برقم الباركود، وبدونه بمعرّف عشوائي
  let id = barcode;
  if (!id) {
    const given = String(b.id || '');
    id = /^m[a-z0-9]{6,24}$/.test(given) ? given : 'm' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }

  const product = { id, barcode: barcode || null, name, brand: clean(b.brand, 50), kcal, protein, carbs, fat, serving, image: null, mine: true };
  await env.FOOD.put('p:' + id, JSON.stringify(product), { metadata: compact(product) });
  return json({ product });
}

export async function onRequestDelete({ request, env }) {
  if (!env.FOOD) return noKV();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) return json({ error: 'معرّف غير صحيح' }, 400);
  await env.FOOD.delete('p:' + id);
  return json({ ok: true });
}
