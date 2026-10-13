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
  const departments = [
    {
      id: "dep-tech",
      code: "TECH",
      name: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      description: "Ph\xE1t tri\u1EC3n ph\u1EA7n m\u1EC1m, h\u1EA1 t\u1EA7ng k\u1EF9 thu\u1EADt v\xE0 gi\u1EA3i ph\xE1p AI",
      managerId: "usr-tech-lead",
      managerName: "Tr\u1EA7n V\u0103n Minh",
      createdAt: "2026-01-10"
    },
    {
      id: "dep-hr",
      code: "HR",
      name: "Ph\xF2ng T\u1ED5 ch\u1EE9c - Nh\xE2n s\u1EF1",
      description: "Tuy\u1EC3n d\u1EE5ng, \u0111\xE0o t\u1EA1o, ch\u1EBF \u0111\u1ED9 ch\xEDnh s\xE1ch v\xE0 ch\u1EA5m c\xF4ng",
      managerId: "usr-hr-01",
      managerName: "Nguy\u1EC5n Th\u1ECB H\u1ED3ng",
      createdAt: "2026-01-10"
    },
    {
      id: "dep-sales",
      code: "SALES",
      name: "Ph\xF2ng Kinh doanh & Ti\u1EBFp th\u1ECB",
      description: "Kinh doanh B2B, b\xE1n l\u1EBB, \u0111\u1ED1i t\xE1c v\xE0 ph\xE1t tri\u1EC3n th\u1ECB tr\u01B0\u1EDDng",
      managerId: "usr-sales-lead",
      managerName: "V\u0169 \u0110\u1EE9c To\xE0n",
      createdAt: "2026-01-10"
    },
    {
      id: "dep-fin",
      code: "FIN",
      name: "Ph\xF2ng T\xE0i ch\xEDnh - K\u1EBF to\xE1n",
      description: "K\u1EBF to\xE1n t\u1ED5ng h\u1EE3p, quy\u1EBFt to\xE1n thu chi v\xE0 ki\u1EC3m to\xE1n n\u1ED9i b\u1ED9",
      managerId: "usr-fin-lead",
      managerName: "Ho\xE0ng B\xEDch Ng\u1ECDc",
      createdAt: "2026-01-10"
    }
  ];
  const users = [
    {
      id: "usr-hr-01",
      code: "PLX-HR01",
      name: "Nguy\u1EC5n Th\u1ECB H\u1ED3ng",
      email: "hong.nt@petrolimexhanoi.vn",
      phone: "0912345678",
      role: "hr",
      departmentId: "dep-hr",
      departmentName: "Ph\xF2ng T\u1ED5 ch\u1EE9c - Nh\xE2n s\u1EF1",
      position: "Tr\u01B0\u1EDFng ph\xF2ng Nh\xE2n s\u1EF1 & Qu\u1EA3n tr\u1ECB vi\xEAn",
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_001",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-10"
    },
    {
      id: "usr-tech-lead",
      code: "PLX-TC01",
      name: "Tr\u1EA7n V\u0103n Minh",
      email: "minh.tv@petrolimexhanoi.vn",
      phone: "0988776655",
      role: "dept_manager",
      departmentId: "dep-tech",
      departmentName: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      position: "Tr\u01B0\u1EDFng ph\xF2ng K\u1EF9 thu\u1EADt",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_002",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-12"
    },
    {
      id: "usr-tech-02",
      code: "PLX-TC02",
      name: "L\xEA Ho\xE0ng Nam",
      email: "nam.lh@petrolimexhanoi.vn",
      phone: "0901234888",
      role: "employee",
      departmentId: "dep-tech",
      departmentName: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      position: "K\u1EF9 s\u01B0 Ph\u1EA7n m\u1EC1m Senior",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_003",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-15"
    },
    {
      id: "usr-tech-03",
      code: "PLX-TC03",
      name: "Ph\u1EA1m Thu Trang",
      email: "trang.pt@petrolimexhanoi.vn",
      phone: "0934567890",
      role: "employee",
      departmentId: "dep-tech",
      departmentName: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      position: "Chuy\xEAn vi\xEAn Ki\u1EC3m th\u1EED QA",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_004",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-20"
    },
    {
      id: "usr-sales-lead",
      code: "PLX-SL01",
      name: "V\u0169 \u0110\u1EE9c To\xE0n",
      email: "toan.vd@petrolimexhanoi.vn",
      phone: "0977889900",
      role: "dept_manager",
      departmentId: "dep-sales",
      departmentName: "Ph\xF2ng Kinh doanh & Ti\u1EBFp th\u1ECB",
      position: "Tr\u01B0\u1EDFng ph\xF2ng Kinh doanh",
      avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_005",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-15"
    },
    {
      id: "usr-sales-02",
      code: "PLX-SL02",
      name: "\u0110\u1ED7 Qu\u1EF3nh Nga",
      email: "nga.dq@petrolimexhanoi.vn",
      phone: "0945671234",
      role: "employee",
      departmentId: "dep-sales",
      departmentName: "Ph\xF2ng Kinh doanh & Ti\u1EBFp th\u1ECB",
      position: "Chuy\xEAn vi\xEAn B\xE1n h\xE0ng Doanh nghi\u1EC7p",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_006",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-02-01"
    },
    {
      id: "usr-fin-lead",
      code: "PLX-FN01",
      name: "Ho\xE0ng B\xEDch Ng\u1ECDc",
      email: "ngoc.hb@petrolimexhanoi.vn",
      phone: "0912233445",
      role: "dept_manager",
      departmentId: "dep-fin",
      departmentName: "Ph\xF2ng T\xE0i ch\xEDnh - K\u1EBF to\xE1n",
      position: "K\u1EBF to\xE1n tr\u01B0\u1EDFng",
      avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80",
      hanetPersonId: "HANET_P_007",
      faceRegistered: true,
      status: "active",
      createdAt: "2026-01-10"
    }
  ];
  const cameras = [
    {
      id: "cam-01",
      name: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1 (Khu v\u1EF1c Ti\u1EBFp t\xE2n)",
      deviceKey: "HN_GATE_T1_001",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      location: "C\u1EEDa xoay \u0111\u1EA1i s\u1EA3nh T\u1EA7ng 1",
      status: "online",
      lastPing: (/* @__PURE__ */ new Date()).toISOString(),
      ipAddress: "192.168.1.101",
      snapshotUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "cam-02",
      name: "Camera C\u1EEDa Kh\u1ED1i K\u1EF9 thu\u1EADt & Dev - T\u1EA7ng 3",
      deviceKey: "HN_DEV_T3_002",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      location: "C\u1EEDa t\u1EEB T\u1EA7ng 3 Kh\u1ED1i C\xF4ng ngh\u1EC7",
      status: "online",
      lastPing: (/* @__PURE__ */ new Date()).toISOString(),
      ipAddress: "192.168.1.102",
      snapshotUrl: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "cam-03",
      name: "Camera Kh\u1ED1i Kinh doanh & Marketing - T\u1EA7ng 4",
      deviceKey: "HN_SALES_T4_003",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      location: "S\u1EA3nh thang m\xE1y T\u1EA7ng 4",
      status: "online",
      lastPing: (/* @__PURE__ */ new Date()).toISOString(),
      ipAddress: "192.168.1.103",
      snapshotUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "cam-04",
      name: "Camera T\u1ED5ng kho \u0110\u1EE9c Giang - C\u1ED5ng Xu\u1EA5t h\xE0ng",
      deviceKey: "HN_WAREHOUSE_004",
      placeId: 1088,
      placeName: "T\u1ED5ng kho \u0110\u1EE9c Giang Petrolimex",
      location: "C\u1ED5ng ki\u1EC3m so\xE1t xe b\u1ED3n & ca k\xEDp",
      status: "online",
      lastPing: (/* @__PURE__ */ new Date()).toISOString(),
      ipAddress: "10.20.5.15",
      snapshotUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80"
    }
  ];
  const attendanceEvents = [
    {
      id: "att-evt-01",
      employeeId: "usr-hr-01",
      employeeCode: "PLX-HR01",
      employeeName: "Nguy\u1EC5n Th\u1ECB H\u1ED3ng",
      departmentId: "dep-hr",
      departmentName: "Ph\xF2ng T\u1ED5 ch\u1EE9c - Nh\xE2n s\u1EF1",
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-01",
      cameraName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:05:12`)).getTime(),
      timeString: "08:05:12",
      dateString: todayStr,
      type: "check_in",
      status: "on_time",
      lateMinutes: 0,
      mask: 0,
      temperature: 36.4
    },
    {
      id: "att-evt-02",
      employeeId: "usr-tech-lead",
      employeeCode: "PLX-TC01",
      employeeName: "Tr\u1EA7n V\u0103n Minh",
      departmentId: "dep-tech",
      departmentName: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-02",
      cameraName: "Camera C\u1EEDa Kh\u1ED1i K\u1EF9 thu\u1EADt & Dev - T\u1EA7ng 3",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:14:45`)).getTime(),
      timeString: "08:14:45",
      dateString: todayStr,
      type: "check_in",
      status: "on_time",
      lateMinutes: 0,
      mask: 0,
      temperature: 36.6
    },
    {
      id: "att-evt-03",
      employeeId: "usr-tech-02",
      employeeCode: "PLX-TC02",
      employeeName: "L\xEA Ho\xE0ng Nam",
      departmentId: "dep-tech",
      departmentName: "Kh\u1ED1i C\xF4ng ngh\u1EC7 & Ph\u1EA7n m\u1EC1m",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-01",
      cameraName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:28:30`)).getTime(),
      timeString: "08:28:30",
      dateString: todayStr,
      type: "check_in",
      status: "late",
      lateMinutes: 13,
      // beyond 08:15 grace limit
      mask: 0,
      temperature: 36.5
    },
    {
      id: "att-evt-04",
      employeeId: "usr-sales-lead",
      employeeCode: "PLX-SL01",
      employeeName: "V\u0169 \u0110\u1EE9c To\xE0n",
      departmentId: "dep-sales",
      departmentName: "Ph\xF2ng Kinh doanh & Ti\u1EBFp th\u1ECB",
      avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-03",
      cameraName: "Camera Kh\u1ED1i Kinh doanh & Marketing - T\u1EA7ng 4",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:08:19`)).getTime(),
      timeString: "08:08:19",
      dateString: todayStr,
      type: "check_in",
      status: "on_time",
      lateMinutes: 0,
      mask: 0,
      temperature: 36.5
    },
    {
      id: "att-evt-05",
      employeeId: "usr-sales-02",
      employeeCode: "PLX-SL02",
      employeeName: "\u0110\u1ED7 Qu\u1EF3nh Nga",
      departmentId: "dep-sales",
      departmentName: "Ph\xF2ng Kinh doanh & Ti\u1EBFp th\u1ECB",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-01",
      cameraName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:11:02`)).getTime(),
      timeString: "08:11:02",
      dateString: todayStr,
      type: "check_in",
      status: "on_time",
      lateMinutes: 0,
      mask: 0,
      temperature: 36.3
    },
    {
      id: "att-evt-06",
      employeeId: "usr-fin-lead",
      employeeCode: "PLX-FN01",
      employeeName: "Ho\xE0ng B\xEDch Ng\u1ECDc",
      departmentId: "dep-fin",
      departmentName: "Ph\xF2ng T\xE0i ch\xEDnh - K\u1EBF to\xE1n",
      avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80",
      detectedImageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80",
      cameraId: "cam-01",
      cameraName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
      placeId: 1042,
      placeName: "Tr\u1EE5 s\u1EDF V\u0103n ph\xF2ng H\xE0 N\u1ED9i",
      timestamp: (/* @__PURE__ */ new Date(`${todayStr}T08:02:18`)).getTime(),
      timeString: "08:02:18",
      dateString: todayStr,
      type: "check_in",
      status: "on_time",
      lateMinutes: 0,
      mask: 0,
      temperature: 36.2
    }
  ];
  const requests = [
    {
      id: "req-001",
      employeeId: "usr-tech-02",
      employeeName: "L\xEA Ho\xE0ng Nam",
      departmentId: "dep-tech",
      date: todayStr,
      type: "late_explanation",
      reason: "S\u1EF1 c\u1ED1 t\u1EAFc \u0111\u01B0\u1EDDng khu v\u1EF1c c\u1EA7u Nh\u1EADt T\xE2n do th\u1EDDi ti\u1EBFt m\u01B0a l\u1EDBn, \u0111\xE3 b\xE1o c\xE1o tr\u01B0\u1EDFng ph\xF2ng qua \u0111i\u1EC7n tho\u1EA1i.",
      suggestedTime: "08:28:00",
      status: "pending",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  const webhookLogs = [
    {
      id: "wh-001",
      receivedAt: (/* @__PURE__ */ new Date(`${todayStr}T08:28:31`)).toISOString(),
      action: "checkin",
      deviceName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
      personName: "L\xEA Ho\xE0ng Nam",
      status: "success",
      rawPayload: {
        action: "checkin",
        data: {
          personID: "HANET_P_003",
          personName: "L\xEA Ho\xE0ng Nam",
          aliasID: "PLX-TC02",
          title: "K\u1EF9 s\u01B0 Ph\u1EA7n m\u1EC1m Senior",
          deviceID: "HN_GATE_T1_001",
          deviceName: "Camera C\u1ED5ng ch\xEDnh - T\u1EA7ng 1",
          placeID: 1042,
          time: (/* @__PURE__ */ new Date(`${todayStr}T08:28:30`)).getTime(),
          mask: 0,
          temperature: 36.5
        }
      }
    }
  ];
  const config = {
    clientId: "hanet_plx_client_8932",
    clientSecret: "sec_89f02c918a2e7c10b2",
    accessToken: "hnt_live_token_7182903746281903",
    tokenExpiresAt: "2026-12-31T23:59:59Z",
    webhookSecret: "whsec_hanet_plx_secure_key_2026",
    masterPlaceId: 1042,
    masterPlaceName: "Tr\u1EE5 s\u1EDF Petrolimex H\xE0 N\u1ED9i & T\u1ED5ng kho",
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
    currentUserId: "usr-hr-01"
    // Default as HR for full initial control
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
  if (!name || !code || !departmentId) {
    return res.status(400).json({ error: "Thi\u1EBFu th\xF4ng tin b\u1EAFt bu\u1ED9c (M\xE3 NV, H\u1ECD t\xEAn, Ph\xF2ng ban)" });
  }
  const dept = db.departments.find((d) => d.id === departmentId);
  const newUser = {
    id: `usr-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    email: email || `${code.toLowerCase()}@petrolimexhanoi.vn`,
    phone: phone || "",
    role: role || "employee",
    departmentId,
    departmentName: dept ? dept.name : "Kh\xE1c",
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
