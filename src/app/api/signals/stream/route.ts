import { NextRequest } from "next/server";

/**
 * Real-time Signal Stream (SSE)
 * Clients connect to this endpoint to receive instant notifications
 * when new signals are created, updated (TP/SL hit), etc.
 *
 * Usage:
 *   const es = new EventSource("/api/signals/stream");
 *   es.onmessage = (e) => { const data = JSON.parse(e.data); ... };
 */

// In-memory subscribers (cleared on each serverless invocation)
const subscribers = new Set<ReturnType<typeof globalThis.setTimeout>>();

// Global event queue - signals waiting to be sent
// In serverless, each cold start has empty state, so we also poll as fallback
let latestSignalEvent: string | null = null;
let lastEventTime = 0;

export function notifySignalEvent(event: { type: string; pair: string; signalType?: string; tpIndex?: number; timestamp: number }) {
  latestSignalEvent = JSON.stringify(event);
  lastEventTime = Date.now();
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: {"type":"connected","time":${Date.now()}}\n\n`));

      // Send any pending event
      if (latestSignalEvent && Date.now() - lastEventTime < 30000) {
        controller.enqueue(encoder.encode(`data: ${latestSignalEvent}\n\n`));
      }

      // Send keepalive every 15 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: {"type":"ping","time":${Date.now()}}\n\n`));
        } catch {
          clearInterval(keepalive);
        }
      }, 15000);

      subscribers.add(keepalive);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        subscribers.delete(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}
