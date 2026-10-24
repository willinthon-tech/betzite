<script>
  import { onMount } from 'svelte';
  import { api } from './api.js';

  let fallas = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let selectedArea = $state(null);

  async function loadFallas() {
    loading = true;
    error = null;
    try {
      const data = await api.getFallas();
      fallas = data.fallas || [];
      if (fallas.length > 0 && !selectedArea) {
        selectedArea = fallas[0].categoria;
      }
    } catch (err) {
      error = err.message || 'Error al cargar análisis de fallas.';
    } finally {
      loading = false;
    }
  }

  const currentFalla = $derived(
    fallas.find(f => f.categoria === selectedArea) || null
  );

  onMount(() => {
    loadFallas();
  });
</script>

<div>
  <div class="breadcrumb-bar">
    <a href="#/admin" class="breadcrumb-item">Panel Administrativo</a>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item current">Fallas por Área y Clientes Afectados</span>
  </div>

  <div style="margin-bottom: 1.5rem;">
    <h2>Análisis de Fallas: ¿Qué falla y quién se queja por ello?</h2>
    <p style="margin-top: 0.25rem;">
      Inspeccione cada área de operación del casino y determine qué clientes (generales o colaboradores) han formulado reclamos.
    </p>
  </div>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  {#if loading}
    <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
      Cargando categorización de incidencias...
    </div>
  {:else if fallas.length > 0}
    <!-- Selector de Áreas de Falla -->
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
      {#each fallas as f}
        <button 
          type="button" 
          class="btn {selectedArea === f.categoria ? 'btn-primary' : 'btn-secondary'}"
          style="text-transform: capitalize; font-size: 0.85rem;"
          onclick={() => selectedArea = f.categoria}
        >
          {f.categoria} ({f.stats.total || 0})
        </button>
      {/each}
    </div>

    {#if currentFalla}
      <!-- Resumen de la Falla Seleccionada -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title" style="text-transform: capitalize;">
              Área Seleccionada: {currentFalla.categoria}
            </h3>
            <p class="card-desc">
              Total de incidencias registradas: <strong>{currentFalla.stats.total || 0}</strong>
            </p>
          </div>
          <div>
            <a href="#/admin/quejas?categoria={encodeURIComponent(currentFalla.categoria)}" class="btn btn-secondary btn-sm">
              Ver Todas las Quejas de esta Área &rarr;
            </a>
          </div>
        </div>

        <div class="metrics-grid" style="margin-bottom: 1.25rem;">
          <div class="metric-card">
            <div class="metric-header">Casos Pendientes</div>
            <div class="metric-value" style="color: var(--warning-text);">
              {currentFalla.stats.pendientes || 0}
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">En Revisión</div>
            <div class="metric-value" style="color: #0f766e;">
              {currentFalla.stats.en_revision || 0}
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">Resueltos</div>
            <div class="metric-value" style="color: var(--success-text);">
              {currentFalla.stats.resueltos || 0}
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">Por Empleados</div>
            <div class="metric-value" style="color: #6d28d9;">
              {currentFalla.stats.quejas_empleados || 0}
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">Por Clientes Generales</div>
            <div class="metric-value">
              {currentFalla.stats.quejas_generales || 0}
            </div>
          </div>
        </div>

        <!-- Clientes que se quejan de esta falla -->
        <h4 style="font-size: 1rem; margin-bottom: 0.75rem;">
          Clientes y Colaboradores que Reportan Incidencias en "{currentFalla.categoria}"
        </h4>

        {#if currentFalla.clientes_afectados && currentFalla.clientes_afectados.length > 0}
          <div class="table-responsive">
            <table class="table-custom">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Usuario</th>
                  <th>Correo Electrónico</th>
                  <th>Tipo de Usuario</th>
                  <th>Quejas en esta Área</th>
                  <th>Última Incidencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {#each currentFalla.clientes_afectados as cli}
                  <tr>
                    <td style="font-weight: 600;">{cli.nombre_apellido}</td>
                    <td>
                      <span style="font-family: var(--font-mono); color: var(--primary);">
                        @{cli.nombre_usuario}
                      </span>
                    </td>
                    <td>{cli.correo}</td>
                    <td>
                      <span class="badge {cli.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                        {cli.tipo_usuario}
                      </span>
                    </td>
                    <td>
                      <strong>{cli.total_quejas_categoria} queja(s)</strong>
                    </td>
                    <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                      {new Date(cli.fecha_mas_reciente).toLocaleDateString()}
                    </td>
                    <td>
                      <a href="#/admin/quejas" class="btn btn-secondary btn-sm" style="white-space: nowrap;">
                        Ver en Panel
                      </a>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
            No hay clientes con incidencias registradas en este momento para esta área.
          </p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
