// جلب منتج بالباركود: أولاً من المنتجات المحفوظة، ثم من Open Food Facts
import { fromOFF, OFF_UA } from '../../_lib/off.js';

const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

const OFF_FIELDS = [
  'product_name', 'product_name_ar', 'product_name_en', 'brands',
  'nutriments', 'serving_quantity', 'image_front_small_url',
].join(',');

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
      { headers: { 'User-Agent': OFF_UA } }
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
