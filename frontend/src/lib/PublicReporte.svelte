<script>
  import { onMount } from 'svelte';
  import { api } from './api.js';
  import { onWs } from './ws.js';

  let metrics = $state({
    total_quejas: 0,
    total_clientes: 0,
    por_categoria: {
      'atencion al cliente': 0,
      'maquinas': 0,
      'casino en vivo': 0,
      'apuestas deportivas': 0,
      'general': 0
    },
    por_tipo_usuario: {
      'empleado': 0,
      'general': 0
    },
    por_estado: {
      'pendiente': 0,
      'en revision': 0,
      'resuelto': 0
    },
    ultimas_quejas: []
  });

  let loading = $state(true);
  let errorMessage = $state(null);

  async function loadMetrics() {
    try {
      const res = await api.getPublicMetrics();
      if (res && res.metrics) {
        metrics = res.metrics;
      }
    } catch (err) {
      errorMessage = err.message || 'No fue posible cargar el reporte.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadMetrics();

    // Actualizaciones automáticas vía WebSocket
    const unsubMetrics = onWs('metrics:updated', (payload) => {
      if (payload) {
        metrics = payload;
      }
    });

    const unsubQuejas = onWs('queja:nueva', () => {
      loadMetrics();
    });

    return () => {
      unsubMetrics();
      unsubQuejas();
    };
  });

  function getCategoryName(cat) {
    const map = {
      'atencion al cliente': 'Atención al Cliente',
      'maquinas': 'Máquinas',
      'casino en vivo': 'Casino en Vivo',
      'apuestas deportivas': 'Apuestas Deportivas',
      'general': 'General'
    };
    return map[cat] || cat;
  }
</script>

<div class="public-reporte">
  <!-- Cabecera del Reporte -->
  <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
    <div>
      <h2>Reporte de Incidencias</h2>
      <p style="margin-top: 0.25rem;">
        Resumen general y estadísticas en tiempo real de clientes y atenciones.
      </p>
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <a href="#/" class="btn btn-primary btn-sm">Nuevo Registro</a>
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-danger" style="margin-bottom: 1.25rem;">
      <strong>Error:</strong> {errorMessage}
    </div>
  {/if}

  <!-- Tarjetas Resumen / KPIs -->
  <div class="metrics-grid-5" style="margin-bottom: 1.5rem;">
    <div class="metric-card" style="border-top: 3px solid var(--primary);">
      <div class="metric-header">TOTAL QUEJAS</div>
      <div class="metric-value">{metrics.total_quejas}</div>
      <div class="metric-sub">Total en sistema</div>
    </div>
    <div class="metric-card" style="border-top: 3px solid #0284c7;">
      <div class="metric-header">CLIENTES REGISTRADOS</div>
      <div class="metric-value">{metrics.total_clientes}</div>
      <div class="metric-sub">Directorio de clientes</div>
    </div>
    <div class="metric-card" style="border-top: 3px solid #f59e0b;">
      <div class="metric-header">PENDIENTES</div>
      <div class="metric-value" style="color: var(--warning-text);">{metrics.por_estado['pendiente'] || 0}</div>
      <div class="metric-sub">Por atender</div>
    </div>
    <div class="metric-card" style="border-top: 3px solid #0f766e;">
      <div class="metric-header">EN REVISIÓN</div>
      <div class="metric-value" style="color: #0f766e;">{metrics.por_estado['en revision'] || 0}</div>
      <div class="metric-sub">En investigación</div>
    </div>
    <div class="metric-card" style="border-top: 3px solid #16a34a;">
      <div class="metric-header">RESUELTOS</div>
      <div class="metric-value" style="color: var(--success-text);">{metrics.por_estado['resuelto'] || 0}</div>
      <div class="metric-sub">Casos cerrados</div>
    </div>
  </div>

  <!-- Desglose por Área (Col-9) y por Tipo de Usuario (Col-3) -->
  <div class="grid-col9-col3">
    <!-- Desglose por Categoría de Queja (Col-9) -->
    <div class="card" style="display: flex; flex-direction: column;">
      <div class="card-header" style="margin-bottom: 0.75rem;">
        <h3 class="card-title">Distribución por Área de Operación</h3>
      </div>
      <div class="table-responsive" style="border: none; flex: 1;">
        <table class="table-custom">
          <thead>
            <tr>
              <th>Área / Categoría</th>
              <th style="text-align: right;">Cantidad</th>
              <th style="text-align: right;">Porcentaje</th>
            </tr>
          </thead>
          <tbody>
            {#each Object.entries(metrics.por_categoria) as [cat, count]}
              <tr>
                <td style="font-weight: 600;">{getCategoryName(cat)}</td>
                <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">{count}</td>
                <td style="text-align: right; color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);">
                  {metrics.total_quejas > 0 ? ((count / metrics.total_quejas) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Desglose por Tipo de Usuario (Col-3) -->
    <div class="card" style="display: flex; flex-direction: column;">
      <div class="card-header" style="margin-bottom: 0.75rem;">
        <h3 class="card-title">Por Tipo de Cliente</h3>
      </div>
      <div style="display: grid; grid-template-rows: 1fr 1fr; gap: 1rem; flex: 1;">
        <div style="background-color: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; justify-content: center;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <span class="badge badge-general">General</span>
            <span style="font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono);">{metrics.por_tipo_usuario['general'] || 0}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Clientes y público general</div>
        </div>

        <div style="background-color: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; justify-content: center;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <span class="badge badge-empleado">Empleado</span>
            <span style="font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono);">{metrics.por_tipo_usuario['empleado'] || 0}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Colaboradores internos</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Listado de Últimos Registros Públicos -->
  <div class="card" style="padding: 0; overflow: hidden;">
    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
      <h3 class="card-title" style="margin: 0;">Últimos Registros Públicos</h3>
      <span style="font-size: 0.775rem; color: var(--text-muted); font-weight: 500;">Actualizado en tiempo real</span>
    </div>

    {#if loading}
      <div style="text-align: center; padding: 3rem; color: var(--text-muted);">Cargando reporte de quejas...</div>
    {:else if metrics.ultimas_quejas && metrics.ultimas_quejas.length > 0}
      <div class="table-responsive" style="border: none;">
        <table class="table-custom">
          <thead>
            <tr>
              <th>Radicado</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Área</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {#each metrics.ultimas_quejas as q}
              <tr>
                <td><strong>#{q.id}</strong></td>
                <td>
                  <span class="badge {q.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                    {q.tipo_usuario}
                  </span>
                </td>
                <td style="font-family: var(--font-mono); font-size: 0.825rem; color: var(--text-secondary);">
                  {q.cliente_anonimo || 'Cliente'}
                </td>
                <td style="text-transform: capitalize; font-weight: 500;">
                  {getCategoryName(q.categoria_queja)}
                </td>
                <td>
                  <span class="badge badge-{q.estado.replace(' ', '-')}">
                    {q.estado}
                  </span>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                  {new Date(q.created_at).toLocaleDateString()} {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        No hay quejas registradas en el sistema.
      </div>
    {/if}
  </div>
</div>
