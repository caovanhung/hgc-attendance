module.exports = {
  apps: [
    {
      name: 'hanet-attendance',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1, // bắt buộc 1: giới hạn đăng nhập và lịch chạy nằm trong bộ nhớ tiến trình
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        TRUST_PROXY: '1',
      },
    },
  ],
};
