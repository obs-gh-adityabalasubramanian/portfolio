// This file is automatically loaded by Next.js when the app starts
// It's the recommended way to initialize OpenTelemetry in Next.js applications

export async function register() {
  // Only initialize OpenTelemetry on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initOtel } = await import('./src/otel-server');
    initOtel();
  }
}
