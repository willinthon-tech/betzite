import fastifyWebsocket from '@fastify/websocket';
import fp from 'fastify-plugin';

async function wsPlugin(fastify, opts) {
  await fastify.register(fastifyWebsocket);

  const activeSockets = new Set();

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    activeSockets.add(socket);
    fastify.log.info({ total_clients: activeSockets.size }, 'Cliente WebSocket conectado');

    // Saludo inicial y confirmación
    socket.send(JSON.stringify({
      event: 'connected',
      payload: {
        message: 'Conexión WebSocket activa con servidor BETZITE',
        clients_online: activeSockets.size
      },
      timestamp: Date.now()
    }));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        // Ignorar mensajes no válidos
      }
    });

    socket.on('close', () => {
      activeSockets.delete(socket);
      fastify.log.info({ total_clients: activeSockets.size }, 'Cliente WebSocket desconectado');
    });

    socket.on('error', (err) => {
      fastify.log.error(err, 'Error en conexión WebSocket');
      activeSockets.delete(socket);
    });
  });

  // Decorador para emitir eventos a todos los clientes en tiempo real
  fastify.decorate('broadcast', function (event, payload = {}) {
    const dataStr = JSON.stringify({
      event,
      payload,
      timestamp: Date.now()
    });

    for (const client of activeSockets) {
      if (client.readyState === 1 /* OPEN */) {
        try {
          client.send(dataStr);
        } catch (err) {
          fastify.log.error(err, 'Error enviando broadcast websocket');
          activeSockets.delete(client);
        }
      }
    }
  });
}

export default fp(wsPlugin);
