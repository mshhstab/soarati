// البحث بالاسم في Open Food Facts (للمنتجات المغلّفة)، مع كاش 7 أيام في KV
import { fromOFF, OFF_UA } from '../_lib/off.js';

const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

const FIELDS = 'code,product_name,product_name_ar,brands,nutriments,serving_quantity,image_front_small_url';
const DAY = 60 * 60 * 24;

// نفس توحيد الواجهة: حذف التشكيل وتوحيد الألف والياء والتاء المربوطة
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim();

export async function onRequestGet({ request, env }) {
  const q = String(new URL(request.url).searchParams.get('q') || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 60) return json({ error: 'اكتبي كلمة من حرفين إلى 60 حرف' }, 400);
  if (!env.FOOD) return json({ error: 'قاعدة الحفظ غير مربوطة (FOOD)' }, 500);

  const key = 'search:' + norm(q);
  const cached = await env.FOOD.get(key, 'json');
  if (cached) return json({ products: cached.products || [] });

  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q)
    + '&search_simple=1&action=process&json=1&page_size=20&fields=' + FIELDS;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': OFF_UA }, signal: AbortSignal.timeout(15000) });
  } catch {
    return json({ error: 'تعذّر الوصول لقاعدة المنتجات العالمية' }, 502);
  }
  if (!res.ok) return json({ error: 'قاعدة المنتجات العالمية لا تستجيب حالياً' }, 502);

  let data;
  try { data = await res.json(); } catch { return json({ error: 'رد غير مفهوم من قاعدة المنتجات' }, 502); }

  // فقط المنتجات اللي لها باركود صحيح وسعرات
  const seen = new Set();
  const products = [];
  for (const p of Array.isArray(data.products) ? data.products : []) {
    const code = String(p?.code ?? '').replace(/\D/g, '');
    if (code.length < 6 || code.length > 14 || seen.has(code)) continue;
    const prod = fromOFF(code, p);
    if (prod.kcal === null || prod.kcal > 900) continue;
    seen.add(code);
    products.push(prod);
  }

  // النتائج الفاضية تنحفظ يوم واحد بس، عشان لو انضافت منتجات جديدة
  await env.FOOD.put(key, JSON.stringify({ products }), { expirationTtl: products.length ? 7 * DAY : DAY });
  return json({ products });
}
