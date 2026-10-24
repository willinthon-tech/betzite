<script>
  import { onMount } from 'svelte';
  import Header from './lib/Header.svelte';
  import PublicHome from './lib/PublicHome.svelte';
  import PublicReporte from './lib/PublicReporte.svelte';
  import Login from './lib/Login.svelte';
  import AdminDashboard from './lib/AdminDashboard.svelte';
  import AdminQuejasList from './lib/AdminQuejasList.svelte';
  import AdminQuejaDetail from './lib/AdminQuejaDetail.svelte';
  import AdminFallas from './lib/AdminFallas.svelte';
  import { authState } from './lib/api.js';

  let currentHash = $state(window.location.hash || '#/');

  function handleHashChange() {
    currentHash = window.location.hash || '#/';
  }

  onMount(() => {
    if (!window.location.hash) {
      window.location.hash = '#/';
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  const routeInfo = $derived.by(() => {
    const raw = currentHash.split('?')[0] || '#/';
    
    if (raw === '#/' || raw === '#' || raw === '') {
      return { view: 'public' };
    }
    if (raw === '#/reporte') {
      return { view: 'reporte' };
    }
    if (raw === '#/login') {
      if (authState.user) {
        window.location.hash = '#/admin';
        return { view: 'admin-quejas' };
      }
      return { view: 'login' };
    }
    if (raw === '#/admin') {
      return { view: 'admin-quejas' };
    }
    if (raw === '#/admin/fallas') {
      return { view: 'admin-fallas' };
    }
    if (raw === '#/admin/quejas' || raw.startsWith('#/admin/quejas') || raw === '#/admin/clientes' || raw.startsWith('#/admin/clientes/') || raw === '#/admin/usuarios') {
      window.location.hash = '#/admin';
      return { view: 'admin-quejas' };
    }
    return { view: 'public' };
  });

  $effect(() => {
    // Si intenta acceder a ruta protegida sin login
    if (currentHash.startsWith('#/admin') && !authState.user) {
      window.location.hash = '#/login';
    }
  });
</script>

<div class="app-container">
  <Header currentRoute={currentHash} />

  <main class="main-content">
    {#if routeInfo.view === 'public'}
      <PublicHome />
    {:else if routeInfo.view === 'reporte'}
      <AdminQuejasList readOnly={true} />
    {:else if routeInfo.view === 'login'}
      <Login />
    {:else if routeInfo.view === 'admin-dashboard'}
      <AdminDashboard />
    {:else if routeInfo.view === 'admin-quejas'}
      <AdminQuejasList initialSelectedId={routeInfo.id} />
    {:else if routeInfo.view === 'admin-fallas'}
      <AdminFallas />
    {:else}
      <PublicHome />
    {/if}
  </main>

  <footer class="site-footer">
    <div>
      <strong>BETZITE</strong> - Sistema de Registro y Seguimiento de Clientes
    </div>
  </footer>
</div>
