// جلب منتج بالباركود: أولاً من المنتجات المحفوظة، ثم من Open Food Facts
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });
const r1 = (n) => Math.round(n * 10) / 10;
const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? r1(n) : null;
};

const OFF_FIELDS = [
  'product_name', 'product_name_ar', 'product_name_en', 'brands',
  'nutriments', 'serving_quantity', 'image_front_small_url',
].join(',');

// تحويل بيانات Open Food Facts لشكل موحّد
function fromOFF(code, p) {
  const n = p.nutriments || {};
  let kcal = pos(n['energy-kcal_100g']);
  // بعض المنتجات فيها الطاقة بالكيلوجول فقط
  if (kcal === null && pos(n['energy_100g']) !== null) kcal = r1(n['energy_100g'] / 4.184);
  const name = (p.product_name_ar || p.product_name || p.product_name_en || '').trim();
  return {
    id: code,
    barcode: code,
    name: name.slice(0, 80) || 'منتج بدون اسم',
    brand: String(p.brands || '').split(',')[0].trim().slice(0, 50),
    kcal,
    protein: pos(n.proteins_100g),
    carbs: pos(n.carbohydrates_100g),
    fat: pos(n.fat_100g),
    serving: pos(p.serving_quantity) || null,
    image: typeof p.image_front_small_url === 'string' && p.image_front_small_url.startsWith('https://')
      ? p.image_front_small_url : null,
    mine: false,
  };
}

export async function onRequestGet({ params, env }) {
  const code = String(params.barcode || '').replace(/\D/g, '');
  if (code.length < 6 || code.length > 14) return json({ error: 'رقم الباركود غير صحيح' }, 400);
  if (!env.FOOD) return json({ error: 'قاعدة الحفظ غير مربوطة (FOOD)' }, 500);

  // 1) منتج أضافته المستخدمة بنفسها
  const mine = await env.FOOD.get('p:' + code, 'json');
  if (mine) return json({ product: mine });

  // 2) نسخة مخزّنة مؤقتاً من Open Food Facts
  const cached = await env.FOOD.get('off:' + code, 'json');
  if (cached) return cached.product ? json({ product: cached.product }) : json({ product: null }, 404);

  // 3) الاستعلام من Open Food Facts
  let res;
  try {
    res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`,
      { headers: { 'User-Agent': 'Soarati/1.0 (personal calorie app)' } }
    );
  } catch {
    return json({ error: 'تعذّر الوصول لقاعدة المنتجات العالمية' }, 502);
  }

  if (res.status === 404) {
    await env.FOOD.put('off:' + code, JSON.stringify({ product: null }), { expirationTtl: 86400 });
    return json({ product: null }, 404);
  }
  if (!res.ok) return json({ error: 'قاعدة المنتجات العالمية لا تستجيب حالياً' }, 502);

  let data;
  try { data = await res.json(); } catch { return json({ error: 'رد غير مفهوم من قاعدة المنتجات' }, 502); }

  if (data.status !== 1 || !data.product) {
    await env.FOOD.put('off:' + code, JSON.stringify({ product: null }), { expirationTtl: 86400 });
    return json({ product: null }, 404);
  }

  const product = fromOFF(code, data.product);
  // تخزين مؤقت 30 يوم لتقليل الطلبات
  await env.FOOD.put('off:' + code, JSON.stringify({ product }), { expirationTtl: 60 * 60 * 24 * 30 });
  return json({ product });
}
