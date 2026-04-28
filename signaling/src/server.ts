import { WebSocketServer, WebSocket } from 'ws';
import {
  isProtocolMessage,
  makeId,
  ProtocolMessage,
  SessionAssigned,
  SessionRequest,
  WorkerRegister,
} from '@citygs/shared';

const port = Number(process.env.PORT ?? 8788);
const wss = new WebSocketServer({ port });

type ClientConn = { id: string; ws: WebSocket };
type WorkerConn = { id: string; ws: WebSocket; info: WorkerRegister };
type Session = { sessionId: string; clientId: string; workerId: string; sceneId: string };

const clients = new Map<string, ClientConn>();
const workers = new Map<string, WorkerConn>();
const sessions = new Map<string, Session>();

function send(ws: WebSocket, msg: ProtocolMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendToSessionClient(session: Session, msg: ProtocolMessage) {
  const client = clients.get(session.clientId);
  if (client) send(client.ws, msg);
}

function chooseWorker() {
  return workers.values().next().value as WorkerConn | undefined;
}

function handleSessionRequest(ws: WebSocket, msg: SessionRequest) {
  clients.set(msg.clientId, { id: msg.clientId, ws });
  const worker = chooseWorker();
  if (!worker) {
    send(ws, { type: 'error', message: 'No CityGS worker is registered. Please start/restart the worker process.' });
    return;
  }
  const sessionId = makeId('sess');
  const session: Session = { sessionId, clientId: msg.clientId, workerId: worker.id, sceneId: msg.sceneId };
  sessions.set(sessionId, session);
  const assigned: SessionAssigned = {
    type: 'session.assigned',
    sessionId,
    clientId: msg.clientId,
    workerId: worker.id,
    sceneId: msg.sceneId,
  };
  send(ws, assigned);
  send(worker.ws, assigned);
}

function routeBySession(msg: ProtocolMessage & { sessionId?: string }) {
  if (!msg.sessionId) return;
  const session = sessions.get(msg.sessionId);
  if (!session) return;
  if (msg.type === 'camera.control') {
    const worker = workers.get(session.workerId);
    if (worker) {
      send(worker.ws, msg);
      return;
    }
    sendToSessionClient(session, {
      type: 'error',
      sessionId: session.sessionId,
      message: `Assigned worker ${session.workerId} is offline. Click Reconnect or restart the worker.`,
    });
    return;
  }
  if (msg.type === 'stats.render') {
    sendToSessionClient(session, msg);
  }
  if (msg.type === 'error') {
    sendToSessionClient(session, msg);
  }
  if (msg.type === 'webrtc.signal') {
    if (msg.to === 'client') {
      sendToSessionClient(session, msg);
    }
    if (msg.to === 'worker') {
      const worker = workers.get(session.workerId);
      if (worker) send(worker.ws, msg);
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: unknown;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Invalid JSON.' }); }
    if (!isProtocolMessage(msg)) return send(ws, { type: 'error', message: 'Invalid protocol message.' });

    if (msg.type === 'worker.register') {
      workers.set(msg.workerId, { id: msg.workerId, ws, info: msg });
      console.log(`worker registered: ${msg.workerId}`, msg.capabilities);
      return;
    }
    if (msg.type === 'session.request') return handleSessionRequest(ws, msg);
    routeBySession(msg as ProtocolMessage & { sessionId?: string });
  });

  ws.on('close', () => {
    for (const [id, c] of clients) {
      if (c.ws === ws) clients.delete(id);
    }
    for (const [id, w] of workers) {
      if (w.ws !== ws) continue;
      workers.delete(id);
      for (const [sessionId, session] of sessions) {
        if (session.workerId !== id) continue;
        sendToSessionClient(session, {
          type: 'error',
          sessionId,
          message: `CityGS worker ${id} disconnected. Click Reconnect after restarting the worker.`,
        });
        sessions.delete(sessionId);
      }
      console.log(`worker disconnected: ${id}`);
    }
  });
});

console.log(`CityGS signaling listening on ws://localhost:${port}`);
