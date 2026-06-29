/**
 * اختبار سريع للاتصال بقاعدة البيانات.
 * شغّله بـ:  node test-connection.js
 */
try { require("dotenv").config(); } catch (_) {}
const { MongoClient } = require("mongodb");

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("❌ MONGODB_URI غير موجود في .env"); process.exit(1); }
  console.log("… محاولة الاتصال بـ Atlas (مهلة 15 ثانية)");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    await client.db(process.env.DB_NAME || "reconciliation").command({ ping: 1 });
    console.log("✅ نجح الاتصال! القاعدة جاهزة.");
  } catch (err) {
    console.error("❌ فشل الاتصال:");
    console.error("   النوع:", err.name);
    console.error("   الرسالة:", err.message);
    if (/ECONNRESET|ETIMEDOUT|querySrv|ENOTFOUND|getaddrinfo/i.test(err.message))
      console.error("\n👈 السبب على الأغلب: Network Access في Atlas. أضف 0.0.0.0/0");
    if (/authentication|auth failed|bad auth/i.test(err.message))
      console.error("\n👈 السبب على الأغلب: اسم المستخدم أو كلمة السر في MONGODB_URI");
  } finally { await client.close(); }
})();
