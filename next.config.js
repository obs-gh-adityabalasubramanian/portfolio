module.exports = {
  webpack: (config, { isServer }) => {
    // Avoid bundling server-only modules that sql.js pulls in.
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
      crypto: false,
    };

    // Exclude OpenTelemetry modules from client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // OpenTelemetry Node.js modules
        'tls': false,
        'net': false,
        'http2': false,
        'dns': false,
        'child_process': false,
        'worker_threads': false,
        'perf_hooks': false,
        'async_hooks': false,
        'diagnostics_channel': false,
      };

      // Add externals to prevent bundling of server-only modules
      config.externals = config.externals || [];
      config.externals.push({
        './otel.server': 'commonjs ./otel.server',
        './otel.server.ts': 'commonjs ./otel.server.ts',
      });

      config.experiments = {
        ...(config.experiments || {}),
        asyncWebAssembly: true,
      };
    }

    return config;
  },
};
