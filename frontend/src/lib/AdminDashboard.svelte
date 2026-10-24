<script>
  import { onMount } from 'svelte';
  import { api, authState } from './api.js';
  import { onWs, subscribeWsStatus } from './ws.js';

  let summary = $state(null);
  let recentQuejas = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let wsConnected = $state(false);

  async function loadData(showLoading = true) {
    if (showLoading) loading = true;
    error = null;
    try {
      const [metricsData, quejasData] = await Promise.all([
        api.getAdminMetrics(),
        api.getQuejas({ sort: 'desc' })
      ]);
      summary = metricsData.summary;
      recentQuejas = (quejasData.quejas || []).slice(0, 8);
    } catch (err) {
      error = err.message || 'Error al cargar datos del panel.';
    } finally {
      if (showLoading) loading = false;
    }
  }

  onMount(() => {
    loadData(true);

    const unsubWs = onWs('*', () => {
      // Recibir cualquier actualización en tiempo real y refrescar métricas
      loadData(false);
    });

    const unsubStatus = subscribeWsStatus((s) => {
      wsConnected = s;
    });

    return () => {
      unsubWs();
      unsubStatus();
    };
  });
</script>

<div>
  <div class="breadcrumb-bar">
    <a href="#/admin" class="breadcrumb-item">Panel Administrativo</a>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item current">Resumen Métrico General</span>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
    <div>
      <h2>Tablero de Control de Quejas y Clientes</h2>
      <p style="margin-top: 0.25rem;">
        Bienvenido, <strong>{authState.user?.nombre}</strong>.
      </p>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" onclick={loadData}>
      Actualizar Datos
    </button>
  </div>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  {#if loading}
    <div class="card" style="text-align: center; padding: 3rem;">
      <p>Cargando información del sistema...</p>
    </div>
  {:else if summary}
    <!-- Contadores Principales -->
    <div class="metrics-grid">
      <div class="metric-card" style="border-top: 3px solid var(--primary);">
        <div class="metric-header">Total de Quejas</div>
        <div class="metric-value">{summary.total_quejas}</div>
        <div class="metric-footer">Registradas históricamente</div>
      </div>

      <div class="metric-card" style="border-top: 3px solid #0891b2;">
        <div class="metric-header">Clientes Registrados</div>
        <div class="metric-value">{summary.total_clientes}</div>
        <div class="metric-footer">Directorio único consolidado</div>
      </div>

      <div class="metric-card" style="border-top: 3px solid #eab308;">
        <div class="metric-header">Quejas Pendientes</div>
        <div class="metric-value">
          {summary.por_estado.find(s => s.estado === 'pendiente')?.count || 0}
        </div>
        <div class="metric-footer">Requieren atención inicial</div>
      </div>

      <div class="metric-card" style="border-top: 3px solid #16a34a;">
        <div class="metric-header">Quejas Resueltas</div>
        <div class="metric-value">
          {summary.por_estado.find(s => s.estado === 'resuelto')?.count || 0}
        </div>
        <div class="metric-footer">Casos concluidos con éxito</div>
      </div>
    </div>

    <!-- Secciones Rápidas por Área / Fallas -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Distribución por Área de Operación</h3>
          <p class="card-desc">Conteo de fallas reportadas y desglose de estados por cada departamento</p>
        </div>
        <a href="#/admin/fallas" class="btn btn-secondary btn-sm">
          Ver Análisis de Fallas en Detalle
        </a>
      </div>

      <div class="table-responsive">
        <table class="table-custom">
          <thead>
            <tr>
              <th>Área / Categoría</th>
              <th>Total Quejas</th>
              <th>Pendientes</th>
              <th>En Revisión</th>
              <th>Resueltos</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {#each summary.por_categoria as cat}
              <tr>
                <td style="font-weight: 600; text-transform: capitalize;">{cat.categoria_queja}</td>
                <td><strong>{cat.count}</strong></td>
                <td>
                  <span class="badge badge-pendiente">{cat.pendientes}</span>
                </td>
                <td>
                  <span class="badge badge-en-revision">{cat.en_revision}</span>
                </td>
                <td>
                  <span class="badge badge-resuelto">{cat.resueltos}</span>
                </td>
                <td>
                  <a href="#/admin/quejas?categoria={encodeURIComponent(cat.categoria_queja)}" class="btn btn-secondary btn-sm">
                    Filtrar Quejas
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Quejas Recientes -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Últimas Quejas Registradas</h3>
          <p class="card-desc">Seguimiento inmediato de casos que ingresaron recientemente</p>
        </div>
        <a href="#/admin/quejas" class="btn btn-secondary btn-sm">
          Ver Todas las Quejas
        </a>
      </div>

      {#if recentQuejas.length > 0}
        <div class="table-responsive">
          <table class="table-custom">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Descripción (extracto)</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {#each recentQuejas as q}
                <tr>
                  <td><strong>#{q.id}</strong></td>
                  <td>
                    <div style="font-weight: 600;">{q.nombre_apellido}</div>
                    <div style="font-size: 0.775rem; color: var(--text-muted);">@{q.nombre_usuario}</div>
                  </td>
                  <td>
                    <span class="badge {q.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                      {q.tipo_usuario}
                    </span>
                  </td>
                  <td style="text-transform: capitalize;">{q.categoria_queja}</td>
                  <td style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    {q.descripcion}
                  </td>
                  <td>
                    <span class="badge badge-{q.estado.replace(' ', '-')}">
                      {q.estado}
                    </span>
                  </td>
                  <td>
                    <a href="#/admin/quejas/{q.id}" class="btn btn-secondary btn-sm">
                      Ver Detalle
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
          No hay quejas registradas actualmente.
        </p>
      {/if}
    </div>
  {/if}
</div>
