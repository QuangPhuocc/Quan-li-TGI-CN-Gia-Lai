import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import { mockOrders, mockUsers } from './src/mock/data.js';
import { InsuranceOrder, User, ChangeLog } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Paths to database files
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// Initialize database directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Atomic file writing helper
function writeJsonAtomic(filePath: string, data: any) {
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

// Initialize database files with seed data if they do not exist
if (!fs.existsSync(USERS_FILE)) {
  writeJsonAtomic(USERS_FILE, mockUsers);
}
if (!fs.existsSync(ORDERS_FILE)) {
  // Seed default expiration date and statement month if not present
  const seededOrders = mockOrders.map(o => {
    const updated = { ...o };
    if (!updated.expiration_date) {
      const d = new Date(updated.effective_date);
      d.setFullYear(d.getFullYear() + 1);
      updated.expiration_date = d.toISOString().split('T')[0];
    }
    if (!updated.statement_month) {
      const d = new Date(updated.issue_date);
      updated.statement_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return updated;
  });
  writeJsonAtomic(ORDERS_FILE, seededOrders);
}
if (!fs.existsSync(LOGS_FILE)) {
  writeJsonAtomic(LOGS_FILE, []);
}

// Read helpers and self-healing migrations
function readOrders(): InsuranceOrder[] {
  try {
    const list: InsuranceOrder[] = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    let migrated = false;
    const result = list.map(o => {
      let changed = false;
      const updated = { ...o };
      if (!updated.statement_month && updated.issue_date) {
        const d = new Date(updated.issue_date);
        if (!isNaN(d.getTime())) {
          updated.statement_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          changed = true;
        }
      }
      if (!updated.expiration_date && updated.effective_date) {
        const d = new Date(updated.effective_date);
        if (!isNaN(d.getTime())) {
          d.setFullYear(d.getFullYear() + 1);
          updated.expiration_date = d.toISOString().split('T')[0];
          changed = true;
        }
      }
      if (changed) migrated = true;
      return updated;
    });
    if (migrated) {
      writeJsonAtomic(ORDERS_FILE, result);
    }
    return result;
  } catch (e) {
    return [];
  }
}

function readUsers(): User[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function readLogs(): ChangeLog[] {
  try {
    return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

// Active Server-Sent Events (SSE) connections for real-time updates
let clients: any[] = [];

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

function broadcastUpdate() {
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`);
  });
}

// --- API Endpoints ---

// Orders API
app.get('/api/orders', (req, res) => {
  res.json(readOrders());
});

app.post('/api/orders', (req, res) => {
  const newOrder: InsuranceOrder = req.body;
  const orders = readOrders();
  
  if (!newOrder.expiration_date && newOrder.effective_date) {
    const d = new Date(newOrder.effective_date);
    d.setFullYear(d.getFullYear() + 1);
    newOrder.expiration_date = d.toISOString().split('T')[0];
  }
  
  orders.unshift(newOrder);
  writeJsonAtomic(ORDERS_FILE, orders);
  
  broadcastUpdate();
  res.status(201).json(newOrder);
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<InsuranceOrder> = req.body;
  const orders = readOrders();
  
  let found = false;
  const updatedOrders = orders.map(o => {
    if (o.id === id) {
      found = true;
      const updated = { ...o, ...updates, updated_at: new Date().toISOString() };
      if (updates.status === 'CANCELLED') {
        updated.tnds_fee = 0;
        updated.nn_fee = 0;
        updated.total_fee = 0;
        updated.cod_amount = 0;
        updated.shipping_fee = 0;
      }
      if (updates.effective_date && updates.effective_date !== o.effective_date) {
        const d = new Date(updates.effective_date);
        d.setFullYear(d.getFullYear() + 1);
        updated.expiration_date = d.toISOString().split('T')[0];
      }
      return updated;
    }
    return o;
  });
  
  if (!found) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  writeJsonAtomic(ORDERS_FILE, updatedOrders);
  broadcastUpdate();
  res.json({ success: true });
});

app.post('/api/orders/bulk', (req, res) => {
  const { newOrders, logs } = req.body;
  const orders = readOrders();
  const currentLogs = readLogs();
  
  const updated = [...orders];
  const processedNewOrders = newOrders.map((no: InsuranceOrder) => {
    const existing = updated.find(o => o.id === no.id || (o.serial_number && o.serial_number === no.serial_number));
    const processed = existing ? {
      ...existing,
      ...no,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString()
    } : { ...no };
    
    if (processed.status === 'CANCELLED') {
      processed.tnds_fee = 0;
      processed.nn_fee = 0;
      processed.total_fee = 0;
      processed.cod_amount = 0;
      processed.shipping_fee = 0;
    }
    return processed;
  });

  const processedIds = new Set(processedNewOrders.map(o => o.id));
  const processedSerials = new Set(processedNewOrders.map(o => o.serial_number).filter(Boolean));
  const cleanExisting = updated.filter(o => !processedIds.has(o.id) && !(o.serial_number && processedSerials.has(o.serial_number)));

  const finalOrders = [...processedNewOrders, ...cleanExisting];
  const mergedLogs = [...logs, ...currentLogs];
  
  writeJsonAtomic(ORDERS_FILE, finalOrders);
  writeJsonAtomic(LOGS_FILE, mergedLogs);
  
  broadcastUpdate();
  res.json({ success: true, count: newOrders.length });
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const orders = readOrders();
  const filtered = orders.filter(o => o.id !== id);
  if (filtered.length === orders.length) {
    return res.status(404).json({ error: 'Order not found' });
  }
  writeJsonAtomic(ORDERS_FILE, filtered);
  broadcastUpdate();
  res.json({ success: true });
});

app.post('/api/orders/bulk-delete', (req, res) => {
  const { ids, logs } = req.body;
  const orders = readOrders();
  const currentLogs = readLogs();
  
  const idSet = new Set(ids);
  const filtered = orders.filter(o => !idSet.has(o.id));
  const mergedLogs = [...logs, ...currentLogs];
  
  writeJsonAtomic(ORDERS_FILE, filtered);
  writeJsonAtomic(LOGS_FILE, mergedLogs);
  
  broadcastUpdate();
  res.json({ success: true, count: ids.length });
});

app.post('/api/orders/bulk-update', (req, res) => {
  const { ids, updates, logs } = req.body;
  const orders = readOrders();
  const currentLogs = readLogs();
  
  const idSet = new Set(ids);
  const updated = orders.map(o => {
    if (idSet.has(o.id)) {
      const u = { ...o, ...updates, updated_at: new Date().toISOString() };
      if (updates.status === 'CANCELLED') {
        u.tnds_fee = 0;
        u.nn_fee = 0;
        u.total_fee = 0;
        u.cod_amount = 0;
        u.shipping_fee = 0;
      }
      if (updates.tnds_fee !== undefined || updates.nn_fee !== undefined) {
        u.total_fee = Number(updates.tnds_fee !== undefined ? updates.tnds_fee : o.tnds_fee) + Number(updates.nn_fee !== undefined ? updates.nn_fee : o.nn_fee);
      }
      if (updates.total_fee !== undefined) {
        u.total_fee = Number(updates.total_fee);
      }
      if (updates.effective_date && updates.effective_date !== o.effective_date) {
        const d = new Date(updates.effective_date);
        d.setFullYear(d.getFullYear() + 1);
        u.expiration_date = d.toISOString().split('T')[0];
      }
      if (u.cod_amount > 0) {
        u.payment_status = 'PAID';
      }
      return u;
    }
    return o;
  });
  
  const mergedLogs = [...logs, ...currentLogs];
  
  writeJsonAtomic(ORDERS_FILE, updated);
  writeJsonAtomic(LOGS_FILE, mergedLogs);
  
  broadcastUpdate();
  res.json({ success: true, count: ids.length });
});

// Users API
app.get('/api/users', (req, res) => {
  res.json(readUsers());
});

app.post('/api/users', (req, res) => {
  const newUser: User = req.body;
  const users = readUsers();
  users.push(newUser);
  writeJsonAtomic(USERS_FILE, users);
  
  broadcastUpdate();
  res.status(201).json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const updates: Partial<User> = req.body;
  const users = readUsers();
  
  const updatedUsers = users.map(u => u.id === id ? { ...u, ...updates } : u);
  writeJsonAtomic(USERS_FILE, updatedUsers);
  
  broadcastUpdate();
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const users = readUsers();
  
  const filteredUsers = users.filter(u => u.id !== id);
  writeJsonAtomic(USERS_FILE, filteredUsers);
  
  broadcastUpdate();
  res.json({ success: true });
});

// Change Logs API
app.get('/api/logs', (req, res) => {
  res.json(readLogs());
});

app.post('/api/logs', (req, res) => {
  const newLog: ChangeLog = req.body;
  const logs = readLogs();
  logs.unshift(newLog);
  writeJsonAtomic(LOGS_FILE, logs);
  
  broadcastUpdate();
  res.status(201).json(newLog);
});

// Serve frontend static files
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Backend Server is running! Frontend builds dist folder is missing. Run "npm run build" to compile frontend.');
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
