module.exports = {
  apps: [
    {
      // ─── CBRL Website ─────────────────────────────────────────────────────
      // One Next process serving everything: the public site, the content
      // dashboard at /admin, and CPMS at /cpms.
      //
      // There used to be a second app here — CPMS on port 8080, reached through
      // a rewrite from this one, or through an Apache ProxyPass in production.
      // It is now a route subtree of this app (src/app/cpms), so port 8080 is
      // free and any ProxyPass for /cpms should be removed from the vhost.
      name: 'cbrl',
      script: 'node_modules\\.bin\\next.cmd',
      args: 'start -p 3200',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'C:\\Windows\\System32\\cmd.exe',
      interpreter_args: '/c',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3200,
      },
    },
  ],
};
