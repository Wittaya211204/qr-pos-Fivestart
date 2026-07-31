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
// DB_PATH ปรับได้ผ่าน environment variable เผื่อ deploy ที่ต้องใช้ disk แยก (เช่น Render Disk)
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
  { id: 17, name: 'ไก่ผัดน้ำปลาทอด', price: 99, category: 'เมนูไก่ทอด', image: '/images/fried-fishsauce-stirfry.jpg' },

  // ---------- เมนูเป็ด (DUCK MENU) ----------
  { id: 18, name: 'เป็ดทอดเยอรมัน (ครึ่งตัว)', price: 159, category: 'เมนูเป็ด', image: '/images/duck-fried-german-half.jpg' },
  { id: 19, name: 'เป็ดต้มน้ำปลา (ครึ่งตัว)', price: 179, category: 'เมนูเป็ด', image: '/images/duck-boiled-fishsauce-half.jpg' },
  { id: 20, name: 'เป็ดย่างเกลือ (ตัว)', price: 279, category: 'เมนูเป็ด', image: '/images/duck-grilled-salt-whole.jpg' },
  { id: 21, name: 'เป็ดพะโล้ (ตัว)', price: 299, category: 'เมนูเป็ด', image: '/images/duck-stewed-whole.jpg' },

  // ---------- เมนูเสริมความอร่อย (SNACK MENU) ----------
  { id: 22, name: 'ไส้กรอกไก่ก้อนโต /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sausage-ball.jpg' },
  { id: 23, name: 'ไส้กรอกทอด /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sausage-fried.jpg' },
  { id: 24, name: 'ไข่ยอร์ค /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-egg-yolk.jpg' },
  { id: 25, name: 'ปลาหมึกทอด /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-squid-fried.jpg' },
  { id: 26, name: 'ไก่จ๊อห้าดาว /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-ball.jpg' },
  { id: 27, name: 'ไก่เผ็ดรสเด็ด /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-spicy.jpg' },
  { id: 28, name: 'ไก่ส้มแซบ /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-somtam.jpg' },
  { id: 29, name: 'สาหร่ายห้าดาว /ชิ้น', price: 25, category: 'เมนูเสริมความอร่อย', image: '/images/snack-seaweed.jpg' },
  { id: 30, name: 'เพรสมีวิงส์ /ชิ้น', price: 30, category: 'เมนูเสริมความอร่อย', image: '/images/snack-wings.jpg' },
  { id: 31, name: 'ไก่สไปซี่ /ชิ้น', price: 30, category: 'เมนูเสริมความอร่อย', image: '/images/snack-chicken-spicy2.jpg' },
  { id: 32, name: 'ไก่ทอดกระเทียม /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-garlic-chicken.jpg' },
  { id: 33, name: 'มันเทศทอด /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-sweet-potato.jpg' },
  { id: 34, name: 'ไก่รมควันสไปซี่ /ชิ้น', price: 35, category: 'เมนูเสริมความอร่อย', image: '/images/snack-smoked-spicy.jpg' },
  { id: 35, name: 'ไก่รมควัน /ชิ้น', price: 69, category: 'เมนูเสริมความอร่อย', image: '/images/snack-smoked.jpg' },
  { id: 36, name: 'ข้าวเหนียว /ชิ้น', price: 10, category: 'เมนูเสริมความอร่อย', image: '/images/sticky-rice.jpg' },

  // ---------- เครื่องดื่ม (DRINKS) ----------
  { id: 37, name: 'โค้ก / โค้กซีโร่', price: 13, category: 'เครื่องดื่ม', image: '/images/drink-coke.jpg' },
  { id: 38, name: 'น้ำดื่มห้าดาว', price: 7, category: 'เครื่องดื่ม', image: '/images/drink-water.jpg' },
  { id: 39, name: 'A Life Water', price: 10, category: 'เครื่องดื่ม', image: '/images/drink-alife.jpg' },
  { id: 40, name: 'Schweppes เลม่อนโซดา', price: 16, category: 'เครื่องดื่ม', image: '/images/drink-schweppes.jpg' },
  { id: 41, name: 'น้ำเก็กฮวย', price: 35, category: 'เครื่องดื่ม', image: '/images/drink-chrysanthemum.jpg' },

  // ---------- ซอส (SAUCE) ----------
  { id: 42, name: 'น้ำจิ้มห้าดาว (ขวดเล็ก)', price: 4, category: 'ซอส', image: '/images/sauce-dip-small.jpg' },
  { id: 43, name: 'น้ำจิ้มห้าดาว (ขวดใหญ่)', price: 49, category: 'ซอส', image: '/images/sauce-dip-large.jpg' },
  { id: 44, name: 'น้ำพริกห้าดาว', price: 25, category: 'ซอส', image: '/images/sauce-chili-paste.jpg' },
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

  // ใช้ transaction เพื่อให้บันทึก order + items สำเร็จพร้อมกันทั้งหมด หรือไม่สำเร็จเลย
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