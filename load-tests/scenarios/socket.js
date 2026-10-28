import { check, sleep } from 'k6';
import { SocketIOClient } from '../lib/socketio.js';
import { pickSession } from '../lib/auth.js';
import { wsConnectErrors } from '../lib/metrics.js';

export default async function socketScenario(data) {
  const { config, authPool } = data;
  const session = pickSession(authPool);
  if (!session) {
    console.error('No auth sessions for socket scenario');
    return;
  }

  const client = new SocketIOClient(config.target.wsBase, {
    token: session.token,
    sessionMs: config.socketSessionMs,
    onEvent: (eventName) => {
      check(null, {
        [`socket event ${eventName}`]: () => true,
      });
    },
  });

  try {
    await client.connect();

    check(null, {
      'socket connected': () => client.connected,
    });

    client.emit('joinUser', session.userId);
    client.emit('trackOrder', 'load-test-probe');

    const deadline = Date.now() + config.socketSessionMs;
    while (Date.now() < deadline) {
      sleep(0.25);
    }
  } catch (err) {
    wsConnectErrors.add(1);
    console.warn(`Socket scenario error: ${err.message}`);
  } finally {
    client.close();
  }

  sleep(config.thinkTimeMs / 1000);
}
