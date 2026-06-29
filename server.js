/**
 * سيرفر وسيط بسيط لوثيقة المصالحة.
 * - يقدّم الصفحة (index.html).
 * - يوفّر API صغير للقراءة/الحفظ من MongoDB.
 *
 * المفاتيح تُقرأ من متغيرات البيئة (.env محلياً، أو Environment على Render).
 * لا تُكتب أي مفاتيح داخل هذا الملف.
 */

const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");

// تحميل .env محلياً (اختياري؛ على Render تأتي المتغيرات جاهزة)
try { require("dotenv").config(); } catch (_) { /* dotenv غير مثبّت = لا مشكلة */ }

const app = express();
app.use(express.json({ limit: "8mb" })); // التواقيع base64 قد تكون كبيرة
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "reconciliation";
const COLLECTION = process.env.COLLECTION || "documents";

if (!MONGODB_URI) {
  console.error("⚠️  لم يتم ضبط MONGODB_URI. أضِفه في ملف .env أو في إعدادات Render.");
}

let client;
let collectionPromise;

async function getCollection() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI غير مضبوط");
  if (!collectionPromise) {
    client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
    collectionPromise = client.connect().then((c) =>
      c.db(DB_NAME).collection(COLLECTION)
    );
  }
  return collectionPromise;
}

const SHARED_FIELDS = ["dispute", "reasons", "terms"];

/* جلب وثيقة بالمعرّف */
app.get("/api/doc/:id", async (req, res) => {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ _id: req.params.id });
    res.json({ ok: true, doc: doc || null });
  } catch (err) {
    console.error("GET error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* توقيع/تثبيت طرف — مع حماية من الكتابة فوق طرف مقفل */
app.post("/api/doc/:id/sign", async (req, res) => {
  const id = req.params.id;
  const { party, name, sign, shared } = req.body || {};

  if (party !== "A" && party !== "B") {
    return res.status(400).json({ ok: false, error: "party يجب أن يكون A أو B" });
  }
  if (!name || !sign) {
    return res.status(400).json({ ok: false, error: "الاسم والتوقيع مطلوبان" });
  }

  try {
    const col = await getCollection();
    const existing = await col.findOne({ _id: id });

    // الطرف وقّع مسبقاً؟ مرفوض.
    if (existing && existing["locked" + party]) {
      return res.status(409).json({
        ok: false,
        error: "هذا الطرف وقّع مسبقاً ولا يمكن التعديل",
        doc: existing
      });
    }
    // الوثيقة مقفلة نهائياً؟ مرفوض.
    if (existing && existing.finalized) {
      return res.status(409).json({ ok: false, error: "الوثيقة مقفلة نهائياً", doc: existing });
    }

    const other = party === "A" ? "B" : "A";
    const otherLocked = existing ? !!existing["locked" + other] : false;

    const setFields = {
      ["name" + party]: String(name),
      ["sign" + party]: String(sign),
      ["locked" + party]: true,
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // الحقول المشتركة تُكتب فقط ما لم تكن الوثيقة مكتملة (الطرف الأول عادةً)
    if (shared && typeof shared === "object" && !(existing && existing.finalized)) {
      SHARED_FIELDS.forEach((f) => {
        if (typeof shared[f] === "string") setFields[f] = shared[f];
      });
    }

    // القفل النهائي عند اكتمال الطرفين
    if (otherLocked) setFields.finalized = true;

    await col.updateOne(
      { _id: id },
      { $set: setFields, $setOnInsert: { _id: id } },
      { upsert: true }
    );

    const updated = await col.findOne({ _id: id });
    res.json({ ok: true, doc: updated });
  } catch (err) {
    console.error("SIGN error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`   افتح: http://localhost:${PORT}`);
});
