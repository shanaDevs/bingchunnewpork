import { WebSocket } from 'k6/websockets';
import { wsConnectErrors, wsConnectDuration, wsConnectSuccess, wsFirstEventDuration } from './metrics.js';

const ENGINE_OPEN = '0';
const ENGINE_PING = '2';
const ENGINE_PONG = '3';
const SIO_CONNECT = '40';
const SIO_DISCONNECT = '41';
const SIO_EVENT = '42';

/**
 * Minimal Socket.IO v4 / Engine.IO v4 client over raw WebSocket.
 * Supports default namespace connect with auth token and event emit/listen.
 */
export class SocketIOClient {
  constructor(wsBase, { token, sessionMs = 30000, onEvent } = {}) {
    this.wsBase = wsBase.replace(/\/$/, '');
    this.token = token;
    this.sessionMs = sessionMs;
    this.onEvent = onEvent || (() => {});
    this.ws = null;
    this.connected = false;
    this.firstEventAt = null;
    this.startedAt = Date.now();
    this.errors = [];
  }

  connect() {
    const url = `${this.wsBase}/socket.io/?EIO=4&transport=websocket`;
    const connectStart = Date.now();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        wsConnectErrors.add(1);
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          wsConnectErrors.add(1);
          this.close();
          reject(new Error('Socket.IO connect timeout'));
        }
      }, 15000);

      this.ws.addEventListener('open', () => {
        // Wait for Engine.IO open packet in message handler
      });

      this.ws.addEventListener('message', (event) => {
        this._handleMessage(event.data, connectStart, timeout, resolve, reject);
      });

      this.ws.addEventListener('error', () => {
        wsConnectErrors.add(1);
        clearTimeout(timeout);
        reject(new Error('WebSocket error'));
      });

      this.ws.addEventListener('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  _handleMessage(raw, connectStart, timeout, resolve, reject) {
    if (typeof raw !== 'string' || raw.length === 0) return;

    const engineType = raw[0];

    if (engineType === ENGINE_OPEN) {
      const authPayload = this.token ? JSON.stringify({ token: this.token }) : '';
      this._send(SIO_CONNECT + authPayload);
      return;
    }

    if (engineType === ENGINE_PING) {
      this._send(ENGINE_PONG);
      return;
    }

    if (engineType === SIO_CONNECT && raw.startsWith(SIO_CONNECT)) {
      this.connected = true;
      clearTimeout(timeout);
      const ms = Date.now() - connectStart;
      wsConnectDuration.add(ms);
      wsConnectSuccess.add(true);
      resolve(ms);
      return;
    }

    if (engineType === SIO_EVENT && raw.startsWith(SIO_EVENT)) {
      try {
        const payload = JSON.parse(raw.slice(2));
        const [eventName, data] = payload;
        if (!this.firstEventAt) {
          this.firstEventAt = Date.now();
          wsFirstEventDuration.add(this.firstEventAt - connectStart);
        }
        this.onEvent(eventName, data);
      } catch {
        // ignore malformed events
      }
      return;
    }

    if (engineType === '4' && raw[1] === '4') {
      // connect_error
      wsConnectErrors.add(1);
      wsConnectSuccess.add(false);
      clearTimeout(timeout);
      reject(new Error(`Socket.IO connect_error: ${raw}`));
    }
  }

  emit(eventName, ...args) {
    if (!this.connected) return false;
    this._send(SIO_EVENT + JSON.stringify([eventName, ...args]));
    return true;
  }

  _send(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(data);
    }
  }

  close() {
    if (this.ws) {
      try {
        this._send(SIO_DISCONNECT);
        this.ws.close();
      } catch {
        // already closed
      }
    }
  }
}
