module.exports = {
  apps: [{
    name: 'qq-farm-server',
    script: './server.js',
    // 单实例模式（推荐用于100+用户场景，避免状态同步问题）
    // 如需使用多核，请使用负载均衡器（如Nginx）配合多个单实例
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    // 内存限制：100+用户建议512M-1G
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3456,
      HOST: '0.0.0.0'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3456,
      HOST: '0.0.0.0'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // 优雅关闭
    kill_timeout: 10000,
    listen_timeout: 15000,
    // 崩溃重启策略
    min_uptime: '10s',
    max_restarts: 10,
    // 日志轮转
    log_rotate: true,
    log_max_size: '100M',
    log_retention: 30
  }]
};
