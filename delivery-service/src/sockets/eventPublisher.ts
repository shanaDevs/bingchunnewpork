import { config } from '../config';
import { logger } from '../utils/logger';
import { postSocketEmitToCore } from '../internal/coreClient';

export interface EventPublisher {
  /** Emit an event into a room on the core backend's Socket.IO server (customers/admin
   *  connect there — the delivery service does not run its own customer-facing socket). */
  publish(room: string, event: string, payload: unknown): Promise<void>;
}

/** ADR 0004 fallback — used whenever REDIS_URL is absent. Relays via
 *  POST /api/internal/socket/emit so local/dev deployments need no broker. */
export class HttpRelayPublisher implements EventPublisher {
  async publish(room: string, event: string, payload: unknown): Promise<void> {
    const { ok, status, text } = await postSocketEmitToCore(room, event, payload);
    if (!ok) {
      logger.warn(`HttpRelayPublisher: emit ${event} -> ${room} failed (${status}) ${text}`);
    }
  }
}

/** ADR 0004 — both services would share a Redis adapter when REDIS_URL is set, letting
 *  the delivery service's own `/delivery` namespace and the core's default namespace
 *  fan out across replicas without a synchronous HTTP hop.
 *
 *  `ioredis` and `@socket.io/redis-adapter` are intentionally NOT installed yet (M4
 *  ships HTTP-relay only, per the milestone plan) — this stub documents the upgrade
 *  path and falls back to HttpRelayPublisher so behaviour is identical either way.
 *  To enable: `npm i ioredis @socket.io/redis-adapter -w @bingchun/delivery-service`,
 *  attach `createAdapter(pubClient, subClient)` to the `io` instance in
 *  sockets/index.ts, and have this class publish directly instead of falling back. */
export class RedisAdapterPublisher implements EventPublisher {
  private fallback = new HttpRelayPublisher();
  private warned = false;

  async publish(room: string, event: string, payload: unknown): Promise<void> {
    if (!this.warned) {
      logger.warn(
        'REDIS_URL is set but the Redis Socket.IO adapter is not wired up yet — using HTTP relay fallback'
      );
      this.warned = true;
    }
    return this.fallback.publish(room, event, payload);
  }
}

let publisher: EventPublisher | null = null;

export function getEventPublisher(): EventPublisher {
  if (!publisher) {
    publisher = config.redisUrl ? new RedisAdapterPublisher() : new HttpRelayPublisher();
  }
  return publisher;
}
