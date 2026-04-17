import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

/**
 * Real-time Signal Stream (SSE)
 * Clients connect to this endpoint to receive instant notifications
 * when new signals are created, updated (TP/SL hit), etc.
 *
 * In serverless, each invocation has its own memory, so events are
 * stored in KV so any invocation can read and forward them to clients.
 */

const SSE_EVENT_KEY = "latest_signal_event";

export function notifySignalEvent(event: { type: string; pair: string; signalType?: string; tpIndex?: number; timestamp: number }) {
  // Store in KV with 60s TTL so any serverless invocation can read it
  kv.set(SSE_EVENT_KEY, JSON.stringify({ ...event, storedAt: Date.now() }), { ex: 60 }).catch(() => {});
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastSentEvent = "";
      let closed = false;

      // Send initial connection message
      controller.enqueue(encoder.encode(`data: {"type":"connected","time":${Date.now()}}\n\n`));

      // Poll KV every 3 seconds for new signal events
      const pollInterval = setInterval(async () => {
        if (closed) return;
        try {
          const stored = await kv.get<string>(SSE_EVENT_KEY);
          if (stored && stored !== lastSentEvent) {
            lastSentEvent = stored;
            const parsed = JSON.parse(stored);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: parsed.type, pair: parsed.pair, signalType: parsed.signalType, tpIndex: parsed.tpIndex, time: parsed.timestamp })}\n\n`)
            );
          }
        } catch {
          /* KV read error — ignore, polling handles it */
        }
      }, 3000);

      // Send keepalive every 15 seconds
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: {"type":"ping","time":${Date.now()}}\n\n`));
        } catch {
          /* controller already closed */
        }
      }, 15000);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(keepalive);
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
