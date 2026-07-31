const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- ฐานข้อมูล SQLite (ไฟล์เดียว เก็บถาวร ไม่หายตอน restart) ----------
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_no INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// ---------- Migration: เพิ่มคอลัมน์สำหรับบันทึกการชำระเงิน (รองรับ DB เก่าที่มีอยู่แล้ว) ----------
const orderColumns = db.prepare(`PRAGMA table_info(orders)`).all().map((c) => c.name);
if (!orderColumns.includes('payment_method')) {
  db.exec(`ALTER TABLE orders ADD COLUMN payment_method TEXT`);
}
if (!orderColumns.includes('paid_at')) {
  db.exec(`ALTER TABLE orders ADD COLUMN paid_at TEXT`);
}

// ---------- ข้อมูลจำลอง (เก็บใน memory) ----------
const menu = [
  // ---------- เมนูไก่ย่าง (GRILLED MENU) ----------
  { id: 1, name: 'ไก่ย่างสูตรทรงเครื่อง (ครึ่งตัว)', price: 80, category: 'เมนูไก่ย่าง', image: '/images/grilled-herb-half.jpg' },
  { id: 2, name: 'ไก่ย่างสูตรทรงเครื่อง (เต็มตัว)', price: 155, category: 'เมนูไก่ย่าง', image: '/images/grilled-herb-full.jpg' },
  { id: 3, name: 'ไก่ย่างสูตรต้นตำรับ (ครึ่งตัว)', price: 90, category: 'เมนูไก่ย่าง', image: '/images/grilled-original-half.jpg' },
  { id: 4, name: 'ไก่ย่างสูตรต้นตำรับ (เต็มตัว)', price: 165, category: 'เมนูไก่ย่าง', image: '/images/grilled-original-full.jpg' },
  { id: 5, name: 'ไก่ย่างสูตรพริกไก่ดำ (ครึ่งตัว)', price: 90, category: 'เมนูไก่ย่าง', image: '/images/grilled-pepper-half.jpg' },
  { id: 6, name: 'ไก่ย่างสูตรพริกไก่ดำ (เต็มตัว)', price: 175, category: 'เมนูไก่ย่าง', image: '/images/grilled-pepper-full.jpg' },
  { id: 7, name: 'ไก่ย่างบางตาล /ชิ้น', price: 59, category: 'เมนูไก่ย่าง', image: '/images/grilled-bangtan.jpg' },

  // ---------- เมนูไก่ทอด (FRIED MENU) ----------
  { id: 8, name: 'ไก่ทอดต้นตำรับ /ชิ้น', price: 25, category: 'เมนูไก่ทอด', image: '/images/fried-original-1.jpg' },
  { id: 9, name: 'ไก่ทอดต้นตำรับ (5 ชิ้น)', price: 129, category: 'เมนูไก่ทอด', image: '/images/fried-original-5.jpg' },
  { id: 10, name: 'ไก่กรอบ /ชิ้น', price: 29, category: 'เมนูไก่ทอด', image: '/images/fried-crispy-1.jpg' },
  { id: 11, name: 'ไก่กรอบ (5 ชิ้น)', price: 149, category: 'เมนูไก่ทอด', image: '/images/fried-crispy-5.jpg' },
  { id: 12, name: 'ไก่ทอดสไปซี่', price: 59, category: 'เมนูไก่ทอด', image: '/images/fried-spicy.jpg' },
  { id: 13, name: 'น่องไก่ทอดน้ำปลา', price: 59, category: 'เมนูไก่ทอด', image: '/images/fried-drumstick-fishsauce.jpg' },
  { id: 14, name: 'ปีกไก่สูตรกรอบ /ชิ้น', price: 65, category: 'เมนูไก่ทอด', image: '/images/fried-wing-crispy-1.jpg' },
  { id: 15, name: 'ปีกไก่สูตรกรอบ (5 ชิ้น)', price: 75, category: 'เมนูไก่ทอด', image: '/images/fried-wing-crispy-5.jpg' },
  { id: 16, name: 'ไก่ทอดเกลือ', price: 59, category: 'เมนูไก่ทอด', image: '/images/fried-salt.jpg' },
  { id: 17, name: 'ไก่ต้มน้ำปลาทอด', price: 99, category: 'เมนูไก่ทอด', image: '/images/fried-fishsauce-stirfry.jpg' },

  // ---------- เมนูเป็ด (DUCK MENU) ----------
  { id: 18, name: 'เป็ดทอดเยอรมัน (ครึ่งตัว)', price: 159, category: 'เมนูเป็ด', image: '/images/duck-fried-german-half.jpg' },
  { id: 19, name: 'เป็ดต้มน้ำปลา (ครึ่งตัว)', price: 179, category: 'เมนูเป็ด', image: '/images/duck-boiled-fishsauce-half.jpg' },
  { id: 20, name: 'เป็ดย่างเกลือ (ตัว)', price: 279, category: 'เมนูเป็ด', image: '/images/duck-grilled-salt-whole.jpg' },
  { id: 21, name: 'เป็ดพะโล้ (ตัว)', price: 299, category: 'เมนูเป็ด', image: '/images/duck-stewed-whole.jpg' },

  // ---------- เมนูเสริมความอร่อย (SNACK MENU) ----------
  { id: 22, name: 'ไส้กรอกไก่จัมโบ้ /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sausage-ball.jpg' },
  { id: 23, name: 'ไส้กรอกชีส /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sausage-fried.jpg' },
  { id: 24, name: 'ไก่สวรรค์ /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-egg-yolk.jpg' },
  { id: 25, name: 'ปลาม้วนชีส /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-squid-fried.jpg' },
  { id: 26, name: 'ไก่จ๊อห้าดาว /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-ball.jpg' },
  { id: 27, name: 'ไก่จ๊อพริกสด /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-spicy.jpg' },
  { id: 28, name: 'ไก่จ๊อสามสี /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-somtam.jpg' },
  { id: 29, name: 'สาหร่ายทรงเครื่องห้าดาว /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-seaweed.jpg' },
  { id: 30, name: 'เฟรนช์ฟรายส์ /ชิ้น', price: 30, category: 'เมนูเสริมความอร่อย', image: '/images/snack-wings.jpg' },
  { id: 31, name: 'เกี๊ยวซ่าไก่ /ชิ้น', price: 30, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-spicy2.jpg' },
  { id: 32, name: 'ไก่ทอดคาราเกะ /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-garlic-chicken.jpg' },
  { id: 33, name: 'นักเก็ตไก่ /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sweet-potato.jpg' },
  { id: 34, name: 'ไก่ห่อสาหร่าย /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-smoked-spicy.jpg' },
  { id: 35, name: 'อกไก่รมควัน /ชิ้น', price: 69, category: 'เมนูเสริมความอร่อย', image: '/images/snack-smoked.jpg' },
  { id: 36, name: 'ข้าวเหนียว /ชิ้น', price: 10, category: 'เมนูเสริมความอร่อย', image: '/images/sticky-rice.jpg' },

  // ---------- เครื่องดื่ม (DRINKS) ----------
  { id: 37, name: 'เป๊ปซี่ขวด 300มล', price: 13, category: 'เครื่องดื่ม', image: '/images/drink-pepsi.jpg' },
  { id: 38, name: 'A Life Water', price: 10, category: 'เครื่องดื่ม', image: '/images/drink-water.jpg' },
  { id: 39, name: 'Schweppes เลม่อนโซดา', price: 16, category: 'เครื่องดื่ม', image: '/images/drink-schweppes.jpg' },

  // ---------- ซอส (SAUCE) ----------
  { id: 40, name: 'น้ำจิ้มห้าดาว (ขวดเล็ก)', price: 20, category: 'ซอส', image: '/images/sauce-dip-small.jpg' },
  { id: 41, name: 'น้ำจิ้มห้าดาวต้นตำรับ (ขวดใหญ่)', price: 49, category: 'ซอส', image: '/images/sauce-dip-large.jpg' },
  { id: 42, name: 'น้ำพริกตาแดง', price: 25, category: 'ซอส', image: '/images/1sauce-chili-paste.jpg' },
  { id: 43, name: 'น้ำพริกปลาร้าบอง', price: 25, category: 'ซอส', image: '/images/2sauce-chili-paste.jpg' },
  { id: 44, name: 'น้ำพริกปลาร้าบองแมงดา', price: 25, category: 'ซอส', image: '/images/3sauce-chili-paste.jpg' },
];

const TABLE_COUNT = 10;

// ---------- API: เมนู ----------
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

// ---------- API: สร้างออเดอร์ ----------
const insertOrderStmt = db.prepare(
  `INSERT INTO orders (table_no, status, created_at) VALUES (?, 'pending', ?)`
);
const insertItemStmt = db.prepare(
  `INSERT INTO order_items (order_id, menu_id, name, price, qty) VALUES (?, ?, ?, ?, ?)`
);

app.post('/api/orders', (req, res) => {
  const { table, items } = req.body;

  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  let enrichedItems;
  try {
    enrichedItems = items.map((it) => {
      const menuItem = menu.find((m) => m.id === it.menuId);
      if (!menuItem) throw new Error('ไม่พบเมนูนี้');
      return {
        menuId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty: it.qty,
      };
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const createdAt = new Date().toISOString();

  const createOrder = db.transaction(() => {
    const info = insertOrderStmt.run(Number(table), createdAt);
    const orderId = info.lastInsertRowid;
    for (const it of enrichedItems) {
      insertItemStmt.run(orderId, it.menuId, it.name, it.price, it.qty);
    }
    return orderId;
  });

  const orderId = createOrder();

  res.json({
    id: orderId,
    table: Number(table),
    items: enrichedItems,
    status: 'pending',
    createdAt,
  });
});

// ---------- API: ดูออเดอร์ทั้งหมด (ฝั่งร้าน) ----------
app.get('/api/orders', (req, res) => {
  const orderRows = db.prepare(`SELECT * FROM orders ORDER BY id DESC`).all();
  const itemStmt = db.prepare(`SELECT menu_id, name, price, qty FROM order_items WHERE order_id = ?`);

  const orders = orderRows.map((o) => ({
    id: o.id,
    table: o.table_no,
    status: o.status,
    createdAt: o.created_at,
    paymentMethod: o.payment_method,
    paidAt: o.paid_at,
    items: itemStmt.all(o.id).map((it) => ({
      menuId: it.menu_id,
      name: it.name,
      price: it.price,
      qty: it.qty,
    })),
  }));

  res.json(orders);
});

// ---------- API: อัปเดตสถานะออเดอร์ ----------
app.patch('/api/orders/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

  const { status } = req.body;
  if (!['pending', 'cooking', 'served'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }

  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, id);
  res.json({ id, status });
});

// ---------- API: ลบออเดอร์ทีละใบ ----------
app.delete('/api/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

  const deleteOrder = db.transaction(() => {
    db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(id);
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
  });
  deleteOrder();

  res.json({ id, deleted: true });
});

// ---------- API: ลบออเดอร์ทั้งหมด ----------
app.delete('/api/orders', (req, res) => {
  const deleteAll = db.transaction(() => {
    db.prepare(`DELETE FROM order_items`).run();
    db.prepare(`DELETE FROM orders`).run();
  });
  deleteAll();

  res.json({ deleted: true });
});

// ---------- API: บันทึกการชำระเงิน (ปิดบิล / รายการขาย) ----------
app.patch('/api/orders/:id/payment', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

  const { method } = req.body;
  if (!['cash', 'transfer'].includes(method)) {
    return res.status(400).json({ error: 'วิธีชำระเงินไม่ถูกต้อง (cash หรือ transfer เท่านั้น)' });
  }

  const paidAt = new Date().toISOString();
  db.prepare(`UPDATE orders SET payment_method = ?, paid_at = ? WHERE id = ?`).run(method, paidAt, id);

  res.json({ id, paymentMethod: method, paidAt });
});

// ---------- ยกเลิกการบันทึกชำระเงิน (เผื่อกดผิด) ----------
app.patch('/api/orders/:id/unpay', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

  db.prepare(`UPDATE orders SET payment_method = NULL, paid_at = NULL WHERE id = ?`).run(id);
  res.json({ id, paymentMethod: null, paidAt: null });
});

// ---------- helper: หาวันที่ปัจจุบันตามเวลาไทย (UTC+7) รูปแบบ YYYY-MM-DD ----------
function getTodayThaiDateStr() {
  const now = new Date();
  const thaiMillis = now.getTime() + 7 * 60 * 60 * 1000;
  return new Date(thaiMillis).toISOString().slice(0, 10);
}

// ---------- API: รายงานยอดขายรายวัน (สำหรับทำบัญชี) ----------
app.get('/api/sales/daily', (req, res) => {
  const dateStr = req.query.date || getTodayThaiDateStr();

  // ขอบเขตของวันนั้นตามเวลาไทย แปลงเป็น ISO (UTC) เพื่อเทียบกับ paid_at ที่เก็บแบบ UTC
  let startIso, endIso;
  try {
    startIso = new Date(`${dateStr}T00:00:00+07:00`).toISOString();
    endIso = new Date(`${dateStr}T23:59:59.999+07:00`).toISOString();
  } catch (err) {
    return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' });
  }

  const paidOrders = db
    .prepare(
      `SELECT * FROM orders
       WHERE payment_method IS NOT NULL AND paid_at BETWEEN ? AND ?
       ORDER BY paid_at ASC`
    )
    .all(startIso, endIso);

  const itemStmt = db.prepare(`SELECT name, price, qty FROM order_items WHERE order_id = ?`);

  let totalCash = 0;
  let totalTransfer = 0;
  const itemsSoldMap = {};

  const transactions = paidOrders.map((o, idx) => {
    const items = itemStmt.all(o.id);
    const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);

    if (o.payment_method === 'cash') totalCash += total;
    else if (o.payment_method === 'transfer') totalTransfer += total;

    items.forEach((it) => {
      if (!itemsSoldMap[it.name]) {
        itemsSoldMap[it.name] = { name: it.name, qty: 0, revenue: 0 };
      }
      itemsSoldMap[it.name].qty += it.qty;
      itemsSoldMap[it.name].revenue += it.price * it.qty;
    });

    return {
      no: idx + 1,
      orderId: o.id,
      table: o.table_no,
      total,
      paymentMethod: o.payment_method,
      paidAt: o.paid_at,
      items: items.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
    };
  });

  const itemsSold = Object.values(itemsSoldMap).sort((a, b) => b.qty - a.qty);

  res.json({
    date: dateStr,
    totalCash,
    totalTransfer,
    grandTotal: totalCash + totalTransfer,
    orderCount: transactions.length,
    transactions,
    itemsSold,
  });
});

// ---------- API: สร้าง QR code สำหรับแต่ละโต๊ะ ----------
app.get('/api/qr/:table', async (req, res) => {
  const table = req.params.table;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const orderUrl = `${baseUrl}/order.html?table=${table}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(orderUrl);
    res.json({ table, url: orderUrl, qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'สร้าง QR ไม่สำเร็จ' });
  }
});

// ---------- API: รายชื่อโต๊ะทั้งหมด ----------
app.get('/api/tables', (req, res) => {
  const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
  res.json(tables);
});

app.listen(PORT, () => {
  console.log(`QR POS server running: http://localhost:${PORT}`);
});