import { Meter, metrics, trace, Tracer } from "@opentelemetry/api";
import { Logger } from "@opentelemetry/api-logs";

// Server-side OpenTelemetry module (only imported on server)
let serverOtel: any = null;

// Initialize OpenTelemetry (async for server-side dynamic import)
export async function initOtel(): Promise<{ tracer: Tracer; logger: Logger; meter: Meter }> {
  // Only initialize on server side
  if (typeof window !== "undefined") {
    throw new Error("OpenTelemetry should only be initialized on the server side");
  }

  if (!serverOtel) {
    try {
      // Use eval to prevent webpack from analyzing this import
      const importPath = './otel.server';
      serverOtel = await (eval('import')(importPath));
      return serverOtel.initOtel();
    } catch (error) {
      console.error("Failed to initialize OpenTelemetry:", error);
      throw error;
    }
  }

  return serverOtel.initOtel();
}

// Export individual components for easy access
export function getTracer(): Tracer {
  if (typeof window !== "undefined") {
    // Return a no-op tracer for client side
    return trace.getTracer("client-noop");
  }

  if (serverOtel) {
    return serverOtel.getTracer();
  }

  // Return a basic tracer if not initialized yet
  return trace.getTracer("aditya-portfolio");
}

export function getLogger(): Logger {
  if (typeof window !== "undefined") {
    // Return a no-op logger for client side
    return {
      emit: () => {},
    } as Logger;
  }

  if (serverOtel) {
    return serverOtel.getLogger();
  }

  // Return a no-op logger if not initialized yet
  return {
    emit: () => {},
  } as Logger;
}

export function getMeter(): Meter {
  if (typeof window !== "undefined") {
    // Return a no-op meter for client side
    return metrics.getMeter("client-noop");
  }

  if (serverOtel) {
    return serverOtel.getMeter();
  }

  // Return a basic meter if not initialized yet
  return metrics.getMeter("aditya-portfolio");
}

// Graceful shutdown
export function shutdownOtel(): void {
  if (typeof window !== "undefined") {
    return;
  }

  if (serverOtel) {
    serverOtel.shutdownOtel();
  }
}

// Initialize OpenTelemetry immediately if we're in a Node.js environment
// This ensures instrumentation is set up before any other modules are loaded
if (typeof window === "undefined" && typeof process !== "undefined") {
  initOtel().catch((error) => {
    console.warn("Failed to initialize OpenTelemetry:", error);
  });
}
