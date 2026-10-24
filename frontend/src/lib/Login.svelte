<script>
  import { api } from './api.js';

  let usuario = $state('');
  let clave = $state('');
  let loading = $state(false);
  let errorMessage = $state(null);

  async function handleLogin(e) {
    e.preventDefault();
    errorMessage = null;

    if (!usuario.trim() || !clave.trim()) {
      errorMessage = 'Por favor ingrese su usuario y contraseña.';
      return;
    }

    loading = true;
    try {
      await api.login(usuario.trim(), clave.trim());
      window.location.hash = '#/admin';
      window.location.reload();
    } catch (err) {
      errorMessage = err.message || 'Error de autenticación.';
    } finally {
      loading = false;
    }
  }
</script>

<div style="max-width: 480px; margin: 2rem auto;">
  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Inicio de Sesión Administrativo</h3>
        <p class="card-desc">Acceso al panel administrativo y gestión de incidencias</p>
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">
        <strong>Error de acceso:</strong> {errorMessage}
      </div>
    {/if}

    <form onsubmit={handleLogin}>
      <div class="form-group">
        <label class="form-label" for="login_usuario">Usuario</label>
        <input 
          id="login_usuario" 
          type="text" 
          class="form-control" 
          placeholder="Ingrese su usuario"
          bind:value={usuario}
          required 
          autocomplete="username"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="login_clave">Contraseña</label>
        <input 
          id="login_clave" 
          type="password" 
          class="form-control" 
          placeholder="Ingrese su clave"
          bind:value={clave}
          required 
          autocomplete="current-password"
        />
      </div>

      <div style="margin-top: 1.5rem;">
        <button 
          type="submit" 
          class="btn btn-primary" 
          style="width: 100%;" 
          disabled={loading}
        >
          {loading ? 'Validando credenciales...' : 'Login'}
        </button>
      </div>
    </form>
  </div>
</div>
