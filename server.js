const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- ข้อมูลจำลอง (เก็บใน memory) ----------
const menu = [
  { id: 1, name: 'ข้าวผัดกระเพราหมู', price: 50, category: 'อาหารจานเดียว' },
  { id: 2, name: 'ผัดไทยกุ้งสด', price: 60, category: 'อาหารจานเดียว' },
  { id: 3, name: 'ต้มยำกุ้ง', price: 80, category: 'ต้ม/แกง' },
  { id: 4, name: 'ส้มตำไทย', price: 45, category: 'ยำ/ตำ' },
  { id: 5, name: 'น้ำมะนาว', price: 25, category: 'เครื่องดื่ม' },
  { id: 6, name: 'ชาไทยเย็น', price: 30, category: 'เครื่องดื่ม' },
];

const TABLE_COUNT = 10;
let orders = []; // { id, table, items:[{menuId, name, price, qty}], status, createdAt }
let nextOrderId = 1;

// ---------- API: เมนู ----------
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

// ---------- API: สร้างออเดอร์ ----------
app.post('/api/orders', (req, res) => {
  const { table, items } = req.body;

  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  const enrichedItems = items.map((it) => {
    const menuItem = menu.find((m) => m.id === it.menuId);
    if (!menuItem) throw new Error('ไม่พบเมนูนี้');
    return {
      menuId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty: it.qty,
    };
  });

  const order = {
    id: nextOrderId++,
    table: Number(table),
    items: enrichedItems,
    status: 'pending', // pending -> cooking -> served
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  res.json(order);
});

// ---------- API: ดูออเดอร์ทั้งหมด (ฝั่งร้าน) ----------
app.get('/api/orders', (req, res) => {
  res.json(orders.slice().reverse());
});

// ---------- API: อัปเดตสถานะออเดอร์ ----------
app.patch('/api/orders/:id/status', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

  const { status } = req.body;
  if (!['pending', 'cooking', 'served'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }
  order.status = status;
  res.json(order);
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
