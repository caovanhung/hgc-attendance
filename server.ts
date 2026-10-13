import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.resolve(process.cwd(), 'data', 'database.json');

// Ensure data folder exists
if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initial seed data
interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  managerId: string;
  managerName: string;
  createdAt: string;
}

interface User {
  id: string;
  code: string; // aliasID in Hanet
  name: string;
  email: string;
  phone: string;
  role: 'hr' | 'dept_manager' | 'employee';
  departmentId: string;
  departmentName: string;
  position: string;
  avatarUrl: string;
  hanetPersonId: string;
  faceRegistered: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface Camera {
  id: string;
  name: string;
  deviceKey: string;
  placeId: number;
  placeName: string;
  location: string;
  status: 'online' | 'offline';
  lastPing: string;
  ipAddress: string;
  rtspUrl?: string;
  snapshotUrl?: string;
}

interface AttendanceEvent {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  avatarUrl: string;
  detectedImageUrl: string;
  cameraId: string;
  cameraName: string;
  placeId: number;
  placeName: string;
  timestamp: number; // epoch ms
  timeString: string; // HH:mm:ss
  dateString: string; // YYYY-MM-DD
  type: 'check_in' | 'check_out' | 'transit';
  status: 'on_time' | 'late' | 'early_leave';
  lateMinutes: number;
  mask: number; // 0 or 1
  temperature?: number;
}

interface AttendanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: string;
  type: 'missed_punch' | 'late_explanation' | 'leave_request';
  reason: string;
  suggestedTime?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  comment?: string;
  createdAt: string;
}

interface HanetConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  tokenExpiresAt: string;
  webhookSecret: string;
  masterPlaceId: number;
  masterPlaceName: string;
  autoSync: boolean;
}

interface WebhookLog {
  id: string;
  receivedAt: string;
  action: string;
  deviceName: string;
  personName: string;
  status: 'success' | 'ignored' | 'error';
  rawPayload: any;
}

interface Database {
  config: HanetConfig;
  departments: Department[];
  users: User[];
  cameras: Camera[];
  attendanceEvents: AttendanceEvent[];
  requests: AttendanceRequest[];
  webhookLogs: WebhookLog[];
  currentUserId: string;
}

const defaultAvatar = (seed: string) => `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80`;

function getInitialDatabase(): Database {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const departments: Department[] = [];

  const users: User[] = [
    {
      id: 'usr-admin',
      code: 'ADMIN',
      name: 'Quản trị viên Hệ thống (HR)',
      email: 'admin@company.com',
      phone: '',
      role: 'hr',
      departmentId: '',
      departmentName: 'Ban Quản trị',
      position: 'Quản trị viên',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      hanetPersonId: '',
      faceRegistered: false,
      status: 'active',
      createdAt: todayStr,
    },
  ];

  const cameras: Camera[] = [];
  const attendanceEvents: AttendanceEvent[] = [];
  const requests: AttendanceRequest[] = [];
  const webhookLogs: WebhookLog[] = [];

  const config: HanetConfig = {
    clientId: '',
    clientSecret: '',
    accessToken: '',
    tokenExpiresAt: '',
    webhookSecret: '',
    masterPlaceId: 0,
    masterPlaceName: '',
    autoSync: true,
  };

  return {
    config,
    departments,
    users,
    cameras,
    attendanceEvents,
    requests,
    webhookLogs,
    currentUserId: 'usr-admin',
  };
}

// Database helper
function loadDb(): Database {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error loading DB, creating fresh DB:', err);
  }
  const fresh = getInitialDatabase();
  saveDb(fresh);
  return fresh;
}

function saveDb(data: Database) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

// REST API ROUTES
app.get('/api/me', (req: Request, res: Response) => {
  const db = loadDb();
  const user = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  res.json({
    user,
    availableAccounts: db.users.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      role: u.role,
      departmentId: u.departmentId,
      departmentName: u.departmentName,
      position: u.position,
      avatarUrl: u.avatarUrl,
    })),
  });
});

app.post('/api/auth/switch-user', (req: Request, res: Response) => {
  const { userId } = req.body;
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  db.currentUserId = user.id;
  saveDb(db);
  res.json({ success: true, user });
});

// Departments
app.get('/api/departments', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  
  // Return member count along with departments
  const result = db.departments.map((dept) => {
    const memberCount = db.users.filter((u) => u.departmentId === dept.id).length;
    return {
      ...dept,
      memberCount,
    };
  });
  res.json({ departments: result, userRole: currentUser.role });
});

app.post('/api/departments', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ Quản trị viên HR mới có quyền tạo phòng ban' });
  }

  const { code, name, description, managerId } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Mã và tên phòng ban là bắt buộc' });
  }

  const manager = db.users.find((u) => u.id === managerId);
  const newDept: Department = {
    id: `dep-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    description: description || '',
    managerId: managerId || '',
    managerName: manager ? manager.name : 'Chưa chỉ định',
    createdAt: new Date().toISOString().split('T')[0],
  };

  db.departments.push(newDept);
  saveDb(db);
  res.json({ success: true, department: newDept });
});

app.put('/api/departments/:id', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ Quản trị viên HR mới có quyền sửa phòng ban' });
  }

  const deptIndex = db.departments.findIndex((d) => d.id === req.params.id);
  if (deptIndex === -1) {
    return res.status(404).json({ error: 'Không tìm thấy phòng ban' });
  }

  const { name, description, managerId } = req.body;
  if (name) db.departments[deptIndex].name = name;
  if (description !== undefined) db.departments[deptIndex].description = description;
  if (managerId !== undefined) {
    const manager = db.users.find((u) => u.id === managerId);
    db.departments[deptIndex].managerId = managerId;
    db.departments[deptIndex].managerName = manager ? manager.name : 'Chưa chỉ định';
  }

  saveDb(db);
  res.json({ success: true, department: db.departments[deptIndex] });
});

// Users / Employees
app.get('/api/users', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];

  let list = db.users;
  // If Trưởng phòng: only see users in their department
  if (currentUser.role === 'dept_manager') {
    list = db.users.filter((u) => u.departmentId === currentUser.departmentId);
  } else if (currentUser.role === 'employee') {
    // If Employee: only see self
    list = db.users.filter((u) => u.id === currentUser.id);
  }

  res.json({ users: list, currentRole: currentUser.role });
});

app.post('/api/users', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ HR mới có quyền tạo nhân sự mới' });
  }

  const { code, name, email, phone, role, departmentId, position, avatarUrl } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (Mã NV, Họ tên)' });
  }

  const dept = departmentId ? db.departments.find((d) => d.id === departmentId) : null;
  const deptName = dept ? dept.name : (db.departments[0]?.name || 'Chưa phân phòng');
  const deptId = dept ? dept.id : (db.departments[0]?.id || '');
  const newUser: User = {
    id: `usr-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    email: email || `${code.toLowerCase()}@petrolimexhanoi.vn`,
    phone: phone || '',
    role: role || 'employee',
    departmentId: deptId,
    departmentName: deptName,
    position: position || 'Nhân viên',
    avatarUrl: avatarUrl || defaultAvatar(name),
    hanetPersonId: `HANET_P_${Math.floor(1000 + Math.random() * 9000)}`,
    faceRegistered: true,
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0],
  };

  db.users.push(newUser);
  saveDb(db);
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ HR mới có quyền sửa thông tin nhân sự' });
  }

  const userIdx = db.users.findIndex((u) => u.id === req.params.id);
  if (userIdx === -1) {
    return res.status(404).json({ error: 'Không tìm thấy nhân sự' });
  }

  const fields = req.body;
  if (fields.name) db.users[userIdx].name = fields.name;
  if (fields.role) db.users[userIdx].role = fields.role;
  if (fields.phone) db.users[userIdx].phone = fields.phone;
  if (fields.position) db.users[userIdx].position = fields.position;
  if (fields.avatarUrl) db.users[userIdx].avatarUrl = fields.avatarUrl;
  if (fields.faceRegistered !== undefined) db.users[userIdx].faceRegistered = fields.faceRegistered;
  if (fields.status) db.users[userIdx].status = fields.status;
  if (fields.departmentId) {
    db.users[userIdx].departmentId = fields.departmentId;
    const dept = db.departments.find((d) => d.id === fields.departmentId);
    if (dept) db.users[userIdx].departmentName = dept.name;
  }

  saveDb(db);
  res.json({ success: true, user: db.users[userIdx] });
});

// Cameras
app.get('/api/cameras', (req: Request, res: Response) => {
  const db = loadDb();
  res.json({ cameras: db.cameras });
});

app.post('/api/cameras', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ HR / Super Admin mới có quyền thêm camera Hanet' });
  }

  const { name, deviceKey, placeId, placeName, location, ipAddress } = req.body;
  if (!name || !deviceKey) {
    return res.status(400).json({ error: 'Tên camera và Device Key là bắt buộc' });
  }

  const newCam: Camera = {
    id: `cam-${Date.now().toString(36)}`,
    name,
    deviceKey,
    placeId: Number(placeId) || 1042,
    placeName: placeName || 'Trụ sở Văn phòng Hà Nội',
    location: location || '',
    status: 'online',
    lastPing: new Date().toISOString(),
    ipAddress: ipAddress || '192.168.1.50',
    snapshotUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80',
  };

  db.cameras.push(newCam);
  saveDb(db);
  res.json({ success: true, camera: newCam });
});

// Attendance Records - STRICT ROLE ACCESS CONTROL
app.get('/api/attendance', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];

  const { date, departmentId, search } = req.query;

  let records = db.attendanceEvents;

  // 1. ROLE-BASED DATA RESTRICTION:
  if (currentUser.role === 'employee') {
    // NHÂN VIÊN: strictly only their own attendance data!
    records = records.filter((r) => r.employeeId === currentUser.id);
  } else if (currentUser.role === 'dept_manager') {
    // TRƯỞNG PHÒNG: strictly only attendance data of their department!
    records = records.filter((r) => r.departmentId === currentUser.departmentId);
  }
  // HR: has access to all records!

  // Filters
  if (date) {
    records = records.filter((r) => r.dateString === date);
  }
  if (departmentId && currentUser.role === 'hr') {
    records = records.filter((r) => r.departmentId === departmentId);
  }
  if (search) {
    const q = String(search).toLowerCase();
    records = records.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.cameraName.toLowerCase().includes(q)
    );
  }

  // Sort descending by timestamp
  records.sort((a, b) => b.timestamp - a.timestamp);

  res.json({
    records,
    userRole: currentUser.role,
    userDept: currentUser.departmentId,
    total: records.length,
  });
});

// Attendance Requests (Giải trình đi muộn / Quên quẹt / Xin nghỉ)
app.get('/api/attendance/requests', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];

  let list = db.requests;
  if (currentUser.role === 'employee') {
    list = list.filter((r) => r.employeeId === currentUser.id);
  } else if (currentUser.role === 'dept_manager') {
    list = list.filter((r) => r.departmentId === currentUser.departmentId);
  }

  res.json({ requests: list, userRole: currentUser.role });
});

app.post('/api/attendance/requests', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];

  const { date, type, reason, suggestedTime } = req.body;
  if (!reason || !type) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin giải trình' });
  }

  const newReq: AttendanceRequest = {
    id: `req-${Date.now().toString(36)}`,
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    departmentId: currentUser.departmentId,
    date: date || new Date().toISOString().split('T')[0],
    type: type || 'late_explanation',
    reason,
    suggestedTime: suggestedTime || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.requests.unshift(newReq);
  saveDb(db);
  res.json({ success: true, request: newReq });
});

app.put('/api/attendance/requests/:id', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role === 'employee') {
    return res.status(403).json({ error: 'Nhân viên không có quyền phê duyệt yêu cầu' });
  }

  const reqIdx = db.requests.findIndex((r) => r.id === req.params.id);
  if (reqIdx === -1) {
    return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
  }

  const targetReq = db.requests[reqIdx];
  // Trưởng phòng can only review for their department
  if (currentUser.role === 'dept_manager' && targetReq.departmentId !== currentUser.departmentId) {
    return res.status(403).json({ error: 'Trưởng phòng chỉ được duyệt yêu cầu của phòng mình' });
  }

  const { status, comment } = req.body;
  targetReq.status = status;
  targetReq.comment = comment || '';
  targetReq.reviewedBy = currentUser.name;
  targetReq.reviewedAt = new Date().toISOString();

  // If approved and it was late explanation, adjust any matching attendance event status to on_time
  if (status === 'approved') {
    const matchingEvt = db.attendanceEvents.find(
      (e) => e.employeeId === targetReq.employeeId && e.dateString === targetReq.date
    );
    if (matchingEvt) {
      matchingEvt.status = 'on_time';
      matchingEvt.lateMinutes = 0;
    }
  }

  saveDb(db);
  res.json({ success: true, request: targetReq });
});

// HANET WEBHOOK RECEIVER (Official Hanet Open API Webhook Endpoint)
// https://developers.hanet.ai/document
app.post('/api/hanet/webhook', (req: Request, res: Response) => {
  const payload = req.body;
  const db = loadDb();

  const now = new Date();
  const timeString = now.toTimeString().split(' ')[0];
  const dateString = now.toISOString().split('T')[0];

  // Log the raw incoming webhook
  const rawLog: WebhookLog = {
    id: `wh-${Date.now().toString(36)}`,
    receivedAt: now.toISOString(),
    action: payload.action || 'checkin',
    deviceName: payload.data?.deviceName || payload.data?.deviceID || 'Unknown Camera',
    personName: payload.data?.personName || 'Người lạ / Stranger',
    status: 'success',
    rawPayload: payload,
  };
  db.webhookLogs.unshift(rawLog);
  if (db.webhookLogs.length > 50) db.webhookLogs.pop();

  // If checkin action
  if (payload.action === 'checkin' && payload.data) {
    const data = payload.data;
    const aliasID = data.aliasID || '';
    const personName = data.personName || 'Chưa định danh';

    // Find employee by aliasID or name
    let employee = db.users.find((u) => u.code === aliasID);
    if (!employee && data.personID) {
      employee = db.users.find((u) => u.hanetPersonId === data.personID);
    }
    if (!employee) {
      employee = db.users.find((u) => u.name.toLowerCase() === personName.toLowerCase());
    }

    if (employee) {
      // Determine on_time or late (standard shift start 08:00, grace period until 08:15)
      const hour = now.getHours();
      const min = now.getMinutes();
      const totalMinutes = hour * 60 + min;
      const shiftStartMinutes = 8 * 60 + 15; // 08:15 limit

      let status: 'on_time' | 'late' = 'on_time';
      let lateMinutes = 0;
      if (totalMinutes > shiftStartMinutes) {
        status = 'late';
        lateMinutes = totalMinutes - (8 * 60); // minutes past 08:00
      }

      const newEvent: AttendanceEvent = {
        id: `att-evt-${Date.now().toString(36)}`,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        departmentId: employee.departmentId,
        departmentName: employee.departmentName,
        avatarUrl: employee.avatarUrl,
        detectedImageUrl: data.detected_image_url || data.avatar || employee.avatarUrl,
        cameraId: data.deviceID || 'cam-01',
        cameraName: data.deviceName || 'Camera Hanet AI',
        placeId: data.placeID || 1042,
        placeName: data.placeName || 'Văn phòng Công ty',
        timestamp: data.time || now.getTime(),
        timeString,
        dateString,
        type: 'check_in',
        status,
        lateMinutes,
        mask: data.mask || 0,
        temperature: data.temperature || 36.5,
      };

      db.attendanceEvents.unshift(newEvent);
      saveDb(db);

      return res.status(200).json({
        returnCode: 1,
        returnMessage: 'Ghi nhận điểm danh Hanet thành công',
        eventId: newEvent.id,
      });
    }
  }

  saveDb(db);
  // Return standard 200 OK fast to Hanet
  res.status(200).json({ returnCode: 1, returnMessage: 'Webhook received' });
});

// Interactive Simulator for Testing Hanet Camera Events
app.post('/api/hanet/simulate', (req: Request, res: Response) => {
  const { employeeId, cameraId, customTime, detectedImageUrl, temperature } = req.body;
  const db = loadDb();

  const employee = db.users.find((u) => u.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  }

  const camera = db.cameras.find((c) => c.id === cameraId) || db.cameras[0];

  const now = new Date();
  let timestamp = now.getTime();
  let timeString = now.toTimeString().split(' ')[0];
  const dateString = now.toISOString().split('T')[0];

  let lateMinutes = 0;
  let status: 'on_time' | 'late' = 'on_time';

  if (customTime) {
    const [h, m] = customTime.split(':').map(Number);
    timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    const targetDate = new Date();
    targetDate.setHours(h, m, 0, 0);
    timestamp = targetDate.getTime();

    const totalMinutes = h * 60 + m;
    if (totalMinutes > 8 * 60 + 15) {
      status = 'late';
      lateMinutes = totalMinutes - 8 * 60;
    }
  } else {
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMinutes = h * 60 + m;
    if (totalMinutes > 8 * 60 + 15) {
      status = 'late';
      lateMinutes = totalMinutes - 8 * 60;
    }
  }

  const newEvent: AttendanceEvent = {
    id: `att-sim-${Date.now().toString(36)}`,
    employeeId: employee.id,
    employeeCode: employee.code,
    employeeName: employee.name,
    departmentId: employee.departmentId,
    departmentName: employee.departmentName,
    avatarUrl: employee.avatarUrl,
    detectedImageUrl: detectedImageUrl || employee.avatarUrl,
    cameraId: camera.id,
    cameraName: camera.name,
    placeId: camera.placeId,
    placeName: camera.placeName,
    timestamp,
    timeString,
    dateString,
    type: 'check_in',
    status,
    lateMinutes,
    mask: 0,
    temperature: Number(temperature) || 36.5,
  };

  db.attendanceEvents.unshift(newEvent);

  // Add to webhook log
  db.webhookLogs.unshift({
    id: `wh-sim-${Date.now().toString(36)}`,
    receivedAt: now.toISOString(),
    action: 'checkin',
    deviceName: camera.name,
    personName: employee.name,
    status: 'success',
    rawPayload: {
      action: 'checkin',
      data: {
        personID: employee.hanetPersonId,
        personName: employee.name,
        aliasID: employee.code,
        deviceID: camera.deviceKey,
        deviceName: camera.name,
        placeID: camera.placeId,
        time: timestamp,
        detected_image_url: newEvent.detectedImageUrl,
      },
    },
  });

  saveDb(db);
  res.json({ success: true, event: newEvent });
});

// Hanet Config
app.get('/api/hanet/config', (req: Request, res: Response) => {
  const db = loadDb();
  res.json({ config: db.config, camerasCount: db.cameras.length });
});

app.post('/api/hanet/config', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== 'hr') {
    return res.status(403).json({ error: 'Chỉ HR mới có quyền cấu hình Hanet' });
  }

  const fields = req.body;
  db.config = {
    ...db.config,
    ...fields,
  };
  saveDb(db);
  res.json({ success: true, config: db.config });
});

app.get('/api/hanet/webhook-logs', (req: Request, res: Response) => {
  const db = loadDb();
  res.json({ logs: db.webhookLogs });
});

// Dashboard Statistics (Scoped by Role)
app.get('/api/stats', (req: Request, res: Response) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  const todayStr = new Date().toISOString().split('T')[0];

  let relevantUsers = db.users;
  let relevantEvents = db.attendanceEvents.filter((e) => e.dateString === todayStr);

  if (currentUser.role === 'dept_manager') {
    relevantUsers = db.users.filter((u) => u.departmentId === currentUser.departmentId);
    relevantEvents = relevantEvents.filter((e) => e.departmentId === currentUser.departmentId);
  } else if (currentUser.role === 'employee') {
    relevantUsers = db.users.filter((u) => u.id === currentUser.id);
    relevantEvents = relevantEvents.filter((e) => e.employeeId === currentUser.id);
  }

  const totalEmployees = relevantUsers.length;
  // Unique checked-in users today
  const checkedInUserIds = new Set(relevantEvents.map((e) => e.employeeId));
  const checkedInCount = checkedInUserIds.size;
  const onTimeCount = relevantEvents.filter((e) => e.status === 'on_time').length;
  const lateCount = relevantEvents.filter((e) => e.status === 'late').length;
  const notCheckedInCount = Math.max(0, totalEmployees - checkedInCount);

  res.json({
    totalEmployees,
    checkedInCount,
    onTimeCount,
    lateCount,
    notCheckedInCount,
    totalCameras: db.cameras.length,
    onlineCameras: db.cameras.filter((c) => c.status === 'online').length,
    pendingRequests: db.requests.filter((r) => r.status === 'pending').length,
  });
});

// Mount Vite in dev or serve dist in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hanet Attendance Hub] Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
