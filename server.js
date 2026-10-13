// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var DB_FILE = path.resolve(process.cwd(), "data", "database.json");
if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
var defaultAvatar = (seed) => `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80`;
function getInitialDatabase() {
  const now = /* @__PURE__ */ new Date();
  const todayStr = now.toISOString().split("T")[0];
  const departments = [];
  const users = [
    {
      id: "usr-admin",
      code: "ADMIN",
      name: "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng (HR)",
      email: "admin@company.com",
      phone: "",
      role: "hr",
      departmentId: "",
      departmentName: "Ban Qu\u1EA3n tr\u1ECB",
      position: "Qu\u1EA3n tr\u1ECB vi\xEAn",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "",
      faceRegistered: false,
      status: "active",
      createdAt: todayStr
    }
  ];
  const cameras = [];
  const attendanceEvents = [];
  const requests = [];
  const webhookLogs = [];
  const config = {
    clientId: "",
    clientSecret: "",
    accessToken: "",
    tokenExpiresAt: "",
    webhookSecret: "",
    masterPlaceId: 0,
    masterPlaceName: "",
    autoSync: true
  };
  return {
    config,
    departments,
    users,
    cameras,
    attendanceEvents,
    requests,
    webhookLogs,
    currentUserId: "usr-admin"
  };
}
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error loading DB, creating fresh DB:", err);
  }
  const fresh = getInitialDatabase();
  saveDb(fresh);
  return fresh;
}
function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving DB:", err);
  }
}
app.get("/api/me", (req, res) => {
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
      avatarUrl: u.avatarUrl
    }))
  });
});
app.post("/api/auth/switch-user", (req, res) => {
  const { userId } = req.body;
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  db.currentUserId = user.id;
  saveDb(db);
  res.json({ success: true, user });
});
app.get("/api/departments", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  const result = db.departments.map((dept) => {
    const memberCount = db.users.filter((u) => u.departmentId === dept.id).length;
    return {
      ...dept,
      memberCount
    };
  });
  res.json({ departments: result, userRole: currentUser.role });
});
app.post("/api/departments", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn HR m\u1EDBi c\xF3 quy\u1EC1n t\u1EA1o ph\xF2ng ban" });
  }
  const { code, name, description, managerId } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: "M\xE3 v\xE0 t\xEAn ph\xF2ng ban l\xE0 b\u1EAFt bu\u1ED9c" });
  }
  const manager = db.users.find((u) => u.id === managerId);
  const newDept = {
    id: `dep-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    description: description || "",
    managerId: managerId || "",
    managerName: manager ? manager.name : "Ch\u01B0a ch\u1EC9 \u0111\u1ECBnh",
    createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  };
  db.departments.push(newDept);
  saveDb(db);
  res.json({ success: true, department: newDept });
});
app.put("/api/departments/:id", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn HR m\u1EDBi c\xF3 quy\u1EC1n s\u1EEDa ph\xF2ng ban" });
  }
  const deptIndex = db.departments.findIndex((d) => d.id === req.params.id);
  if (deptIndex === -1) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y ph\xF2ng ban" });
  }
  const { name, description, managerId } = req.body;
  if (name) db.departments[deptIndex].name = name;
  if (description !== void 0) db.departments[deptIndex].description = description;
  if (managerId !== void 0) {
    const manager = db.users.find((u) => u.id === managerId);
    db.departments[deptIndex].managerId = managerId;
    db.departments[deptIndex].managerName = manager ? manager.name : "Ch\u01B0a ch\u1EC9 \u0111\u1ECBnh";
  }
  saveDb(db);
  res.json({ success: true, department: db.departments[deptIndex] });
});
app.get("/api/users", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  let list = db.users;
  if (currentUser.role === "dept_manager") {
    list = db.users.filter((u) => u.departmentId === currentUser.departmentId);
  } else if (currentUser.role === "employee") {
    list = db.users.filter((u) => u.id === currentUser.id);
  }
  res.json({ users: list, currentRole: currentUser.role });
});
app.post("/api/users", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 HR m\u1EDBi c\xF3 quy\u1EC1n t\u1EA1o nh\xE2n s\u1EF1 m\u1EDBi" });
  }
  const { code, name, email, phone, role, departmentId, position, avatarUrl } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: "Thi\u1EBFu th\xF4ng tin b\u1EAFt bu\u1ED9c (M\xE3 NV, H\u1ECD t\xEAn)" });
  }
  const dept = departmentId ? db.departments.find((d) => d.id === departmentId) : null;
  const deptName = dept ? dept.name : db.departments[0]?.name || "Ch\u01B0a ph\xE2n ph\xF2ng";
  const deptId = dept ? dept.id : db.departments[0]?.id || "";
  const newUser = {
    id: `usr-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    email: email || `${code.toLowerCase()}@petrolimexhanoi.vn`,
    phone: phone || "",
    role: role || "employee",
    departmentId: deptId,
    departmentName: deptName,
    position: position || "Nh\xE2n vi\xEAn",
    avatarUrl: avatarUrl || defaultAvatar(name),
    hanetPersonId: `HANET_P_${Math.floor(1e3 + Math.random() * 9e3)}`,
    faceRegistered: true,
    status: "active",
    createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  };
  db.users.push(newUser);
  saveDb(db);
  res.json({ success: true, user: newUser });
});
app.put("/api/users/:id", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 HR m\u1EDBi c\xF3 quy\u1EC1n s\u1EEDa th\xF4ng tin nh\xE2n s\u1EF1" });
  }
  const userIdx = db.users.findIndex((u) => u.id === req.params.id);
  if (userIdx === -1) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1" });
  }
  const fields = req.body;
  if (fields.name) db.users[userIdx].name = fields.name;
  if (fields.role) db.users[userIdx].role = fields.role;
  if (fields.phone) db.users[userIdx].phone = fields.phone;
  if (fields.position) db.users[userIdx].position = fields.position;
  if (fields.avatarUrl) db.users[userIdx].avatarUrl = fields.avatarUrl;
  if (fields.faceRegistered !== void 0) db.users[userIdx].faceRegistered = fields.faceRegistered;
  if (fields.status) db.users[userIdx].status = fields.status;
  if (fields.departmentId) {
    db.users[userIdx].departmentId = fields.departmentId;
    const dept = db.departments.find((d) => d.id === fields.departmentId);
    if (dept) db.users[userIdx].departmentName = dept.name;
  }
  saveDb(db);
  res.json({ success: true, user: db.users[userIdx] });
});
app.get("/api/cameras", (req, res) => {
  const db = loadDb();
  res.json({ cameras: db.cameras });
});
app.post("/api/cameras", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 HR / Super Admin m\u1EDBi c\xF3 quy\u1EC1n th\xEAm camera Hanet" });
  }
  const { name, deviceKey, placeId, placeName, location, ipAddress } = req.body;
  if (!name || !deviceKey) {
    return res.status(400).json({ error: "T\xEAn camera v\xE0 Device Key l\xE0 b\u1EAFt bu\u1ED9c" });
  }
  const newCam = {
    id: `cam-${Date.now().toString(36)}`,
    name,
    deviceKey,
    placeId: Number(placeId) || 1042,
    placeName: placeName || "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
    location: location || "",
    status: "online",
    lastPing: (/* @__PURE__ */ new Date()).toISOString(),
    ipAddress: ipAddress || "192.168.1.50",
    snapshotUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80"
  };
  db.cameras.push(newCam);
  saveDb(db);
  res.json({ success: true, camera: newCam });
});
app.get("/api/attendance", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  const { date, departmentId, search } = req.query;
  let records = db.attendanceEvents;
  if (currentUser.role === "employee") {
    records = records.filter((r) => r.employeeId === currentUser.id);
  } else if (currentUser.role === "dept_manager") {
    records = records.filter((r) => r.departmentId === currentUser.departmentId);
  }
  if (date) {
    records = records.filter((r) => r.dateString === date);
  }
  if (departmentId && currentUser.role === "hr") {
    records = records.filter((r) => r.departmentId === departmentId);
  }
  if (search) {
    const q = String(search).toLowerCase();
    records = records.filter(
      (r) => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q) || r.cameraName.toLowerCase().includes(q)
    );
  }
  records.sort((a, b) => b.timestamp - a.timestamp);
  res.json({
    records,
    userRole: currentUser.role,
    userDept: currentUser.departmentId,
    total: records.length
  });
});
app.get("/api/attendance/requests", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  let list = db.requests;
  if (currentUser.role === "employee") {
    list = list.filter((r) => r.employeeId === currentUser.id);
  } else if (currentUser.role === "dept_manager") {
    list = list.filter((r) => r.departmentId === currentUser.departmentId);
  }
  res.json({ requests: list, userRole: currentUser.role });
});
app.post("/api/attendance/requests", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  const { date, type, reason, suggestedTime } = req.body;
  if (!reason || !type) {
    return res.status(400).json({ error: "Vui l\xF2ng nh\u1EADp \u0111\u1EA7y \u0111\u1EE7 th\xF4ng tin gi\u1EA3i tr\xECnh" });
  }
  const newReq = {
    id: `req-${Date.now().toString(36)}`,
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    departmentId: currentUser.departmentId,
    date: date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    type: type || "late_explanation",
    reason,
    suggestedTime: suggestedTime || "",
    status: "pending",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.requests.unshift(newReq);
  saveDb(db);
  res.json({ success: true, request: newReq });
});
app.put("/api/attendance/requests/:id", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role === "employee") {
    return res.status(403).json({ error: "Nh\xE2n vi\xEAn kh\xF4ng c\xF3 quy\u1EC1n ph\xEA duy\u1EC7t y\xEAu c\u1EA7u" });
  }
  const reqIdx = db.requests.findIndex((r) => r.id === req.params.id);
  if (reqIdx === -1) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y y\xEAu c\u1EA7u" });
  }
  const targetReq = db.requests[reqIdx];
  if (currentUser.role === "dept_manager" && targetReq.departmentId !== currentUser.departmentId) {
    return res.status(403).json({ error: "Tr\u01B0\u1EDFng ph\xF2ng ch\u1EC9 \u0111\u01B0\u1EE3c duy\u1EC7t y\xEAu c\u1EA7u c\u1EE7a ph\xF2ng m\xECnh" });
  }
  const { status, comment } = req.body;
  targetReq.status = status;
  targetReq.comment = comment || "";
  targetReq.reviewedBy = currentUser.name;
  targetReq.reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (status === "approved") {
    const matchingEvt = db.attendanceEvents.find(
      (e) => e.employeeId === targetReq.employeeId && e.dateString === targetReq.date
    );
    if (matchingEvt) {
      matchingEvt.status = "on_time";
      matchingEvt.lateMinutes = 0;
    }
  }
  saveDb(db);
  res.json({ success: true, request: targetReq });
});
app.post("/api/hanet/webhook", (req, res) => {
  const payload = req.body;
  const db = loadDb();
  const now = /* @__PURE__ */ new Date();
  const timeString = now.toTimeString().split(" ")[0];
  const dateString = now.toISOString().split("T")[0];
  const rawLog = {
    id: `wh-${Date.now().toString(36)}`,
    receivedAt: now.toISOString(),
    action: payload.action || "checkin",
    deviceName: payload.data?.deviceName || payload.data?.deviceID || "Unknown Camera",
    personName: payload.data?.personName || "Ng\u01B0\u1EDDi l\u1EA1 / Stranger",
    status: "success",
    rawPayload: payload
  };
  db.webhookLogs.unshift(rawLog);
  if (db.webhookLogs.length > 50) db.webhookLogs.pop();
  if (payload.action === "checkin" && payload.data) {
    const data = payload.data;
    const aliasID = data.aliasID || "";
    const personName = data.personName || "Ch\u01B0a \u0111\u1ECBnh danh";
    let employee = db.users.find((u) => u.code === aliasID);
    if (!employee && data.personID) {
      employee = db.users.find((u) => u.hanetPersonId === data.personID);
    }
    if (!employee) {
      employee = db.users.find((u) => u.name.toLowerCase() === personName.toLowerCase());
    }
    if (employee) {
      const hour = now.getHours();
      const min = now.getMinutes();
      const totalMinutes = hour * 60 + min;
      const shiftStartMinutes = 8 * 60 + 15;
      let status = "on_time";
      let lateMinutes = 0;
      if (totalMinutes > shiftStartMinutes) {
        status = "late";
        lateMinutes = totalMinutes - 8 * 60;
      }
      const newEvent = {
        id: `att-evt-${Date.now().toString(36)}`,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        departmentId: employee.departmentId,
        departmentName: employee.departmentName,
        avatarUrl: employee.avatarUrl,
        detectedImageUrl: data.detected_image_url || data.avatar || employee.avatarUrl,
        cameraId: data.deviceID || "cam-01",
        cameraName: data.deviceName || "Camera Hanet AI",
        placeId: data.placeID || 1042,
        placeName: data.placeName || "V\u0103n ph\xF2ng C\xF4ng ty",
        timestamp: data.time || now.getTime(),
        timeString,
        dateString,
        type: "check_in",
        status,
        lateMinutes,
        mask: data.mask || 0,
        temperature: data.temperature || 36.5
      };
      db.attendanceEvents.unshift(newEvent);
      saveDb(db);
      return res.status(200).json({
        returnCode: 1,
        returnMessage: "Ghi nh\u1EADn \u0111i\u1EC3m danh Hanet th\xE0nh c\xF4ng",
        eventId: newEvent.id
      });
    }
  }
  saveDb(db);
  res.status(200).json({ returnCode: 1, returnMessage: "Webhook received" });
});
app.post("/api/hanet/simulate", (req, res) => {
  const { employeeId, cameraId, customTime, detectedImageUrl, temperature } = req.body;
  const db = loadDb();
  const employee = db.users.find((u) => u.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n vi\xEAn" });
  }
  const camera = db.cameras.find((c) => c.id === cameraId) || db.cameras[0];
  const now = /* @__PURE__ */ new Date();
  let timestamp = now.getTime();
  let timeString = now.toTimeString().split(" ")[0];
  const dateString = now.toISOString().split("T")[0];
  let lateMinutes = 0;
  let status = "on_time";
  if (customTime) {
    const [h, m] = customTime.split(":").map(Number);
    timeString = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    const targetDate = /* @__PURE__ */ new Date();
    targetDate.setHours(h, m, 0, 0);
    timestamp = targetDate.getTime();
    const totalMinutes = h * 60 + m;
    if (totalMinutes > 8 * 60 + 15) {
      status = "late";
      lateMinutes = totalMinutes - 8 * 60;
    }
  } else {
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMinutes = h * 60 + m;
    if (totalMinutes > 8 * 60 + 15) {
      status = "late";
      lateMinutes = totalMinutes - 8 * 60;
    }
  }
  const newEvent = {
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
    type: "check_in",
    status,
    lateMinutes,
    mask: 0,
    temperature: Number(temperature) || 36.5
  };
  db.attendanceEvents.unshift(newEvent);
  db.webhookLogs.unshift({
    id: `wh-sim-${Date.now().toString(36)}`,
    receivedAt: now.toISOString(),
    action: "checkin",
    deviceName: camera.name,
    personName: employee.name,
    status: "success",
    rawPayload: {
      action: "checkin",
      data: {
        personID: employee.hanetPersonId,
        personName: employee.name,
        aliasID: employee.code,
        deviceID: camera.deviceKey,
        deviceName: camera.name,
        placeID: camera.placeId,
        time: timestamp,
        detected_image_url: newEvent.detectedImageUrl
      }
    }
  });
  saveDb(db);
  res.json({ success: true, event: newEvent });
});
app.get("/api/hanet/config", (req, res) => {
  const db = loadDb();
  res.json({ config: db.config, camerasCount: db.cameras.length });
});
app.post("/api/hanet/config", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  if (currentUser.role !== "hr") {
    return res.status(403).json({ error: "Ch\u1EC9 HR m\u1EDBi c\xF3 quy\u1EC1n c\u1EA5u h\xECnh Hanet" });
  }
  const fields = req.body;
  db.config = {
    ...db.config,
    ...fields
  };
  saveDb(db);
  res.json({ success: true, config: db.config });
});
app.get("/api/hanet/webhook-logs", (req, res) => {
  const db = loadDb();
  res.json({ logs: db.webhookLogs });
});
app.get("/api/stats", (req, res) => {
  const db = loadDb();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let relevantUsers = db.users;
  let relevantEvents = db.attendanceEvents.filter((e) => e.dateString === todayStr);
  if (currentUser.role === "dept_manager") {
    relevantUsers = db.users.filter((u) => u.departmentId === currentUser.departmentId);
    relevantEvents = relevantEvents.filter((e) => e.departmentId === currentUser.departmentId);
  } else if (currentUser.role === "employee") {
    relevantUsers = db.users.filter((u) => u.id === currentUser.id);
    relevantEvents = relevantEvents.filter((e) => e.employeeId === currentUser.id);
  }
  const totalEmployees = relevantUsers.length;
  const checkedInUserIds = new Set(relevantEvents.map((e) => e.employeeId));
  const checkedInCount = checkedInUserIds.size;
  const onTimeCount = relevantEvents.filter((e) => e.status === "on_time").length;
  const lateCount = relevantEvents.filter((e) => e.status === "late").length;
  const notCheckedInCount = Math.max(0, totalEmployees - checkedInCount);
  res.json({
    totalEmployees,
    checkedInCount,
    onTimeCount,
    lateCount,
    notCheckedInCount,
    totalCameras: db.cameras.length,
    onlineCameras: db.cameras.filter((c) => c.status === "online").length,
    pendingRequests: db.requests.filter((r) => r.status === "pending").length
  });
});
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Hanet Attendance Hub] Server is running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
