// أدوات مشتركة لـ Open Food Facts (يستخدمها /api/product/[barcode] و /api/search)
const r1 = (n) => Math.round(n * 10) / 10;
const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? r1(n) : null;
};

export const OFF_UA = 'Soarati/1.0 (personal calorie app)';

// تحويل بيانات Open Food Facts لشكل موحّد
export function fromOFF(code, p) {
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
