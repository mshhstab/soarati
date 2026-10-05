# سعراتي

تطبيق ويب بسيط لحساب السعرات بمسح الباركود، مع إضافة المنتجات غير الموجودة.

## محتوى المستودع

```
public/            واجهة التطبيق (الصفحة، الأيقونات، ملفات التثبيت)
public/foods.js    قائمة الأكلات العامة (حوالي 400 صنف) للبحث بالاسم
functions/api/     الخادم: جلب المنتج بالباركود + حفظ المنتجات المضافة + البحث العالمي بالاسم
scripts/           سكربت فحص قائمة الأكلات (ما يُرفع للموقع)
```

## النشر (مرة واحدة فقط)

### 1. ارفع الملفات على GitHub
- أنشئ مستودع جديد باسم `soarati` (خاص أو عام، الاثنين يشتغلون).
- اضغط **uploading an existing file** واسحب **محتوى** المجلد (المجلدين `public` و `functions` وملف `README.md`)، مو المجلد نفسه.
- اضغط **Commit changes**.

### 2. أنشئ مخزن البيانات في Cloudflare
- **Storage & Databases ← KV ← Create**
- الاسم: `soarati-food` ثم **Create**.

### 3. اربط المستودع بـ Cloudflare Pages
- **Workers & Pages ← Create ← Pages ← Connect to Git** واختر مستودع `soarati`.
- إعدادات البناء:
  - Framework preset: **None**
  - Build command: **اتركه فاضي**
  - Build output directory: **public**
- اضغط **Save and Deploy**.

### 4. اربط مخزن البيانات بالمشروع
- افتح المشروع ← **Settings ← Bindings ← Add ← KV namespace**
- Variable name: **FOOD** (بالحروف الكبيرة بالضبط)
- KV namespace: **soarati-food** ثم **Save**.
- ارجع لـ **Deployments**، وعند آخر نشر اضغط **⋯ ← Retry deployment** عشان يطبّق الربط.

### 5. على جوال زوجتك
- افتح الرابط `https://soarati.pages.dev` (أو الاسم اللي أعطاه Cloudflare).
- اسمح بالكاميرا أول مرة.
- **آيفون:** Safari ← زر المشاركة ← **إضافة إلى الشاشة الرئيسية**.
- **أندرويد:** Chrome ← ⋮ ← **تثبيت التطبيق**.

## التحديثات
أي تعديل ترفعه على GitHub، Cloudflare ينشره تلقائياً خلال دقيقة.

## ملاحظات
- المنتجات المضافة محفوظة في Cloudflare KV، فما تضيع لو تغيّر الجوال.
- سجل الأكل اليومي محفوظ على الجوال نفسه (آخر 60 يوم).
- بيانات المنتجات العالمية من Open Food Facts المجانية.
- قيم الأكلات الأساسية في `public/foods.js` من USDA FoodData Central، والأكلات المطبوخة والحلويات قيمها تقريبية.
- بعد أي تعديل على `public/foods.js` شغّل `node scripts/check-foods.mjs` للتأكد إن القيم سليمة.
- لو ظهرت في Cloudflare رسالة "This project is disconnected from your Git account" والتحديثات ما توصل: من GitHub افتح github.com/settings/installations ← **Cloudflare Workers and Pages** ← **Configure** وتأكد إن مستودع `soarati` مختار، وبعدها ارفع أي تعديل.
- لا تضيف ملف `wrangler.toml` للمستودع، لأنه يلغي إعدادات الربط اللي سويتها من لوحة Cloudflare.
