// Gestor de conexión WebSocket bidireccional en tiempo real para BETZITE

let socket = null;
let reconnectTimer = null;
const listeners = new Map();
let isConnected = false;
const statusListeners = new Set();

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // En desarrollo con proxy de Vite o directo
  return `${protocol}//${window.location.host}/ws`;
}

export function subscribeWsStatus(callback) {
  statusListeners.add(callback);
  callback(isConnected);
  return () => statusListeners.delete(callback);
}

function notifyStatus(status) {
  isConnected = status;
  for (const cb of statusListeners) {
    try {
      cb(status);
    } catch (e) {
      console.error(e);
    }
  }
}

export function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    const wsUrl = getWsUrl();
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      notifyStatus(true);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { event: eventName, payload, timestamp } = data;

        // Disparar listeners del evento específico
        if (listeners.has(eventName)) {
          for (const cb of listeners.get(eventName)) {
            try {
              cb(payload, timestamp);
            } catch (err) {
              console.error(`Error en listener de ${eventName}:`, err);
            }
          }
        }

        // Disparar listener universal '*'
        if (listeners.has('*')) {
          for (const cb of listeners.get('*')) {
            try {
              cb(eventName, payload, timestamp);
            } catch (err) {
              console.error('Error en listener universal:', err);
            }
          }
        }
      } catch (e) {
        console.error('Mensaje websocket no reconocido:', event.data);
      }
    };

    socket.onclose = () => {
      notifyStatus(false);
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      notifyStatus(false);
    };
  } catch (err) {
    notifyStatus(false);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, 2500);
}

export function onWs(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName).add(callback);

  // Asegurar que el socket esté inicializado
  initWebSocket();

  // Función para desuscribirse
  return () => {
    if (listeners.has(eventName)) {
      listeners.get(eventName).delete(callback);
    }
  };
}

export function sendWs(type, payload = {}) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    return true;
  }
  return false;
}
