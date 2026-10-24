const API_BASE = '/api';

export const authState = {
  token: localStorage.getItem('betzite_token') || null,
  user: JSON.parse(localStorage.getItem('betzite_user') || 'null')
};

export function saveAuth(token, user) {
  authState.token = token;
  authState.user = user;
  localStorage.setItem('betzite_token', token);
  localStorage.setItem('betzite_user', JSON.stringify(user));
}

export function clearAuth() {
  authState.token = null;
  authState.user = null;
  localStorage.removeItem('betzite_token');
  localStorage.removeItem('betzite_user');
}

export function isAuthenticated() {
  return !!authState.token;
}

async function request(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (authState.token) {
    headers['Authorization'] = `Bearer ${authState.token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
    }
    const errorMsg = data.message || data.error || `Error en la solicitud (${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  // Públicas
  getPublicMetrics: () => request('/public/metrics'),
  buscarClientes: (query = '') => request(`/public/clientes-buscar${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  validarIdentidad: (usuario = '', correo = '') => request(`/public/validar-identidad?usuario=${encodeURIComponent(usuario)}&correo=${encodeURIComponent(correo)}`),
  submitQueja: (body) => request('/public/quejas', {
    method: 'POST',
    body: JSON.stringify(body)
  }),

  // Autenticación
  login: async (usuario, clave) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, clave })
    });
    if (res.token && res.user) {
      saveAuth(res.token, res.user);
    }
    return res;
  },
  logout: () => {
    clearAuth();
  },
  getMe: () => request('/auth/me'),

  // Panel Administrativo
  getAdminMetrics: () => request('/admin/metrics'),
  getQuejas: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, v);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const prefix = authState.token ? '/admin' : '/public';
    return request(`${prefix}/quejas${queryStr}`);
  },
  getQueja: (id) => request(`/admin/quejas/${id}`),
  updateQueja: (id, body) => request(`/admin/quejas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  deleteQueja: (id) => request(`/admin/quejas/${id}`, {
    method: 'DELETE'
  }),

  // Clientes
  getClientes: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, v);
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const prefix = authState.token ? '/admin' : '/public';
    return request(`${prefix}/clientes${queryStr}`);
  },
  getCliente: (id) => request(`/admin/clientes/${id}`),
  updateCliente: (id, body) => request(`/admin/clientes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  deleteCliente: (id) => request(`/admin/clientes/${id}`, {
    method: 'DELETE'
  }),

  // Fallas y categorías
  getFallas: () => request('/admin/fallas')
};
