<script>
  import { authState, clearAuth } from '../lib/api.js';

  let { currentRoute = '#/' } = $props();

  const isAdminRoute = $derived(currentRoute.startsWith('#/admin'));
  const isReporteRoute = $derived(currentRoute.startsWith('#/reporte'));

  function handleLogout() {
    clearAuth();
    window.location.hash = '#/';
    window.location.reload();
  }
</script>

<header class="site-header">
  <div class="header-inner">
    <div class="brand-section">
      <a href="#/" class="brand-badge">BETZITE</a>
      <div class="brand-text">
        <span class="brand-title">Gestión y Seguimiento de Incidencias</span>
        <span class="brand-subtitle">Atención y Control de Clientes</span>
      </div>
    </div>

    <nav>
      <ul class="nav-links">
        <li>
          {#if isAdminRoute}
            <a href="#/reporte" class="btn btn-secondary btn-sm">
              Reporte
            </a>
          {:else if isReporteRoute}
            <a href="#/" class="btn btn-secondary btn-sm">
              Principal
            </a>
          {:else}
            <a href="#/reporte" class="btn btn-secondary btn-sm">
              Reporte
            </a>
          {/if}
        </li>

        <li>
          {#if isAdminRoute}
            <button 
              id="btn-logout"
              type="button" 
              class="btn btn-danger btn-sm" 
              onclick={handleLogout}
              style="background-color: var(--danger-btn); border-color: var(--danger-btn); color: var(--text-inverse); font-weight: 600;"
            >
              Cerrar Sesión
            </button>
          {:else if authState.user}
            <a id="btn-admin" href="#/admin" class="btn btn-primary btn-sm">
              Admin
            </a>
          {:else}
            <a id="btn-login" href="#/login" class="btn btn-primary btn-sm">
              Login
            </a>
          {/if}
        </li>
      </ul>
    </nav>
  </div>
</header>
