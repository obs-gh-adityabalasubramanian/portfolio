export async function register() {
  // Only initialize OpenTelemetry on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Import and initialize OpenTelemetry server module directly
      const { initOtel } = await import('./otel.server');
      initOtel();
    } catch (error) {
      console.warn('Failed to initialize OpenTelemetry in instrumentation:', error);
    }
  }
}
