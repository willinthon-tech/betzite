<script>
  import { onMount } from 'svelte';
  import { api, authState } from './api.js';
  import { onWs } from './ws.js';

  let { initialSelectedId = null, readOnly = false } = $props();

  let quejas = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // Métricas para la sección superior
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
    }
  });

  // Filtros de tabla
  let categoria = $state('');
  let tipoUsuario = $state('');
  let estado = $state('');
  let search = $state('');
  let sort = $state('desc');

  // Estado para actualización de estado y eliminación
  let savingStatusId = $state(null);
  let deletingId = $state(null);
  let confirmDeleteId = $state(null);
  let feedback = $state(null); // { id, text, type: 'success' | 'danger' }

  async function loadMetrics() {
    try {
      const res = await api.getPublicMetrics();
      if (res && res.metrics) {
        metrics = res.metrics;
      }
    } catch (err) {
      console.error('Error cargando métricas:', err);
    }
  }

  async function loadQuejas(showLoading = true) {
    if (showLoading) loading = true;
    error = null;
    try {
      const data = await api.getQuejas({
        categoria: categoria || undefined,
        tipo_usuario: tipoUsuario || undefined,
        estado: estado || undefined,
        search: search.trim() || undefined,
        sort
      });
      quejas = data.quejas || [];
    } catch (err) {
      error = err.message || 'Error al cargar las quejas.';
    } finally {
      if (showLoading) loading = false;
    }
  }

  function handleFilterSubmit(e) {
    if (e) e.preventDefault();
    loadQuejas(true);
  }

  function resetFilters() {
    categoria = '';
    tipoUsuario = '';
    estado = '';
    search = '';
    sort = 'desc';
    loadQuejas(true);
  }

  // Cambio directo de estado exclusivamente con los 3 botones (Pendiente, En revisión, Resuelto)
  async function handleQuickStatus(q, newStatus) {
    if (q.estado === newStatus) return;

    savingStatusId = q.id;
    feedback = null;

    try {
      await api.updateQueja(q.id, {
        estado: newStatus
      });

      // Actualizar registro en lista local
      q.estado = newStatus;

      feedback = {
        id: q.id,
        text: `Radicado #${q.id}: estado actualizado a "${newStatus.toUpperCase()}".`,
        type: 'success'
      };

      loadMetrics();
    } catch (err) {
      feedback = {
        id: q.id,
        text: err.message || 'Error al actualizar el estado.',
        type: 'danger'
      };
    } finally {
      savingStatusId = null;
    }
  }

  // Eliminar el registro por completo
  async function executeDelete(q) {
    deletingId = q.id;
    confirmDeleteId = null;
    feedback = null;

    try {
      await api.deleteQueja(q.id);
      quejas = quejas.filter(item => item.id !== q.id);
      feedback = {
        id: q.id,
        text: `Registro #${q.id} eliminado por completo del sistema.`,
        type: 'success'
      };
      loadMetrics();
    } catch (err) {
      feedback = {
        id: q.id,
        text: err.message || 'Error al eliminar el registro.',
        type: 'danger'
      };
    } finally {
      deletingId = null;
    }
  }

  // ==========================================
  // ESTADO Y MÉTODOS PARA DIRECTORIO DE CLIENTES
  // ==========================================
  let clientes = $state([]);
  let loadingClientes = $state(true);
  let errorClientes = $state(null);
  let searchClientes = $state('');
  let tipoUsuarioClientes = $state('');

  // Edición de cliente (Solo nombre_apellido y tipo_usuario)
  let editingClientId = $state(null);
  let editClientNombre = $state('');
  let editClientTipo = $state('');
  let savingClientId = $state(null);
  let clientFeedback = $state(null);

  // Eliminación de cliente
  let confirmDeleteClientId = $state(null);
  let deletingClientId = $state(null);

  async function loadClientes(showLoading = true) {
    if (showLoading) loadingClientes = true;
    errorClientes = null;
    try {
      const data = await api.getClientes({
        tipo_usuario: tipoUsuarioClientes || undefined,
        search: searchClientes.trim() || undefined
      });
      clientes = data.clientes || [];
    } catch (err) {
      errorClientes = err.message || 'Error al cargar directorio de clientes.';
    } finally {
      if (showLoading) loadingClientes = false;
    }
  }

  function handleFilterClientes(e) {
    if (e) e.preventDefault();
    loadClientes(true);
  }

  function resetFilterClientes() {
    searchClientes = '';
    tipoUsuarioClientes = '';
    loadClientes(true);
  }

  function startEditClient(c) {
    editingClientId = c.id;
    editClientNombre = c.nombre_apellido;
    editClientTipo = c.tipo_usuario;
    clientFeedback = null;
  }

  function cancelEditClient() {
    editingClientId = null;
    editClientNombre = '';
    editClientTipo = '';
  }

  async function saveEditClient(c) {
    if (!editClientNombre.trim()) {
      clientFeedback = { id: c.id, text: 'El nombre y apellido no puede estar vacío.', type: 'danger' };
      return;
    }

    savingClientId = c.id;
    clientFeedback = null;
    try {
      await api.updateCliente(c.id, {
        nombre_apellido: editClientNombre.trim(),
        tipo_usuario: editClientTipo
      });

      c.nombre_apellido = editClientNombre.trim();
      c.tipo_usuario = editClientTipo;
      editingClientId = null;
      clientFeedback = {
        id: c.id,
        text: `Cliente #${c.id} (@${c.nombre_usuario}) actualizado: nombre y tipo guardados exitosamente.`,
        type: 'success'
      };

      // Recargar métricas y quejas para sincronizar datos
      loadMetrics();
      loadQuejas(false);
    } catch (err) {
      clientFeedback = {
        id: c.id,
        text: err.message || 'Error al actualizar datos del cliente.',
        type: 'danger'
      };
    } finally {
      savingClientId = null;
    }
  }

  async function executeDeleteClient(c) {
    deletingClientId = c.id;
    clientFeedback = null;
    try {
      await api.deleteCliente(c.id);
      clientes = clientes.filter(item => item.id !== c.id);
      confirmDeleteClientId = null;
      clientFeedback = {
        id: c.id,
        text: `Cliente #${c.id} (@${c.nombre_usuario}) y sus incidencias asociadas fueron eliminados del sistema.`,
        type: 'success'
      };

      // Recargar métricas y quejas
      loadMetrics();
      loadQuejas(false);
    } catch (err) {
      clientFeedback = {
        id: c.id,
        text: err.message || 'No fue posible eliminar el cliente.',
        type: 'danger'
      };
    } finally {
      deletingClientId = null;
    }
  }

  onMount(() => {
    const hash = window.location.hash;
    if (hash.includes('?')) {
      const qs = new URLSearchParams(hash.split('?')[1]);
      if (qs.get('categoria')) categoria = qs.get('categoria');
      if (qs.get('tipo_usuario')) tipoUsuario = qs.get('tipo_usuario');
      if (qs.get('estado')) estado = qs.get('estado');
      if (qs.get('search')) search = qs.get('search');
    }

    loadMetrics();
    loadQuejas(true);
    loadClientes(true);

    const unsubMetrics = onWs('metrics:updated', (payload) => {
      if (payload) metrics = payload;
    });

    const unsubWs = onWs('*', () => {
      loadQuejas(false);
      loadMetrics();
      loadClientes(false);
    });

    return () => {
      unsubMetrics();
      unsubWs();
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

<div>
  <!-- SECCIÓN SUPERIOR: REPORTE DE INCIDENCIAS Y MÉTRICAS (SIN BOTÓN NUEVO REGISTRO) -->
  <div style="margin-bottom: 1.5rem;">
    <h2>Reporte de Incidencias</h2>
    <p style="margin-top: 0.25rem;">
      Resumen general y estadísticas de cliente
    </p>
  </div>

  <!-- Tarjetas KPI Resumen -->
  <div class="metrics-grid-5" style="margin-bottom: 1.5rem;">
    <div class="metric-card" style="border-top: 3px solid var(--primary);">
      <div class="metric-header">TOTAL INCIDENCIAS</div>
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

  <!-- Desglose por Área (Col-9) y por Tipo de Cliente (Col-3) -->
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
              <th>ÁREA / CATEGORÍA</th>
              <th style="text-align: right;">CANTIDAD</th>
              <th style="text-align: right;">PORCENTAJE</th>
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

    <!-- Desglose por Tipo de Cliente (50% con items ocupando 50% y 50%) -->
    <div class="card" style="display: flex; flex-direction: column;">
      <div class="card-header" style="margin-bottom: 0.75rem;">
        <h3 class="card-title">Por Tipo de Cliente</h3>
      </div>
      <div style="display: grid; grid-template-rows: 1fr 1fr; gap: 1rem; flex: 1;">
        <!-- GENERAL (50%) -->
        <div style="background-color: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; justify-content: center;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <span class="badge badge-general">GENERAL</span>
            <span style="font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono);">{metrics.por_tipo_usuario['general'] || 0}</span>
          </div>
          <div style="font-size: 0.825rem; color: var(--text-muted);">Clientes y público general</div>
        </div>

        <!-- EMPLEADO (50%) -->
        <div style="background-color: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; justify-content: center;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <span class="badge badge-empleado">EMPLEADO</span>
            <span style="font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono);">{metrics.por_tipo_usuario['empleado'] || 0}</span>
          </div>
          <div style="font-size: 0.825rem; color: var(--text-muted);">Colaboradores internos</div>
        </div>
      </div>
    </div>
  </div>

  <!-- SECCIÓN DE QUEJAS: TABLA CON ESTRUCTURA DIRECTA -->
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
    <div>
      <h2>Registro y Seguimiento de Incidencias</h2>
      <p style="margin-top: 0.25rem;">
        Consulte y supervise las incidencias recibidas.
      </p>
    </div>
    <div>
      <span style="font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
        Total mostradas: <strong>{quejas.length}</strong>
      </span>
    </div>
  </div>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  <!-- Barra de Filtros y Búsqueda: Fila 1 Buscar y botones, Fila 2 los 4 selectores -->
  <form onsubmit={handleFilterSubmit} class="card" style="padding: 1.15rem; margin-bottom: 1.5rem; background-color: var(--bg-card);">
    <!-- Fila 1: Buscar a la izquierda con botones Filtrar y Limpiar a la derecha -->
    <div style="display: flex; gap: 0.75rem; align-items: flex-end; margin-bottom: 0.85rem; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 250px;">
        <label class="filter-label" for="filter_search" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Buscar:</label>
        <input 
          id="filter_search"
          type="text" 
          class="form-control" 
          placeholder="Cliente, @usuario, correo o texto..."
          bind:value={search}
        />
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button type="submit" class="btn btn-primary" style="padding: 0.55rem 1.4rem; font-weight: 600;">
          Filtrar
        </button>
        <button type="button" class="btn btn-secondary" style="padding: 0.55rem 1.4rem; font-weight: 600;" onclick={resetFilters}>
          Limpiar
        </button>
      </div>
    </div>

    <!-- Fila 2: Los 4 selectores distribuidos homogéneamente en cuadrícula -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.85rem;">
      <div>
        <label class="filter-label" for="filter_categoria" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Categoría:</label>
        <select id="filter_categoria" class="form-select" bind:value={categoria} onchange={loadQuejas}>
          <option value="">Todas las áreas</option>
          <option value="atencion al cliente">Atención al Cliente</option>
          <option value="maquinas">Máquinas</option>
          <option value="casino en vivo">Casino en Vivo</option>
          <option value="apuestas deportivas">Apuestas Deportivas</option>
          <option value="general">General</option>
        </select>
      </div>

      <div>
        <label class="filter-label" for="filter_tipo" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Tipo Cliente:</label>
        <select id="filter_tipo" class="form-select" bind:value={tipoUsuario} onchange={loadQuejas}>
          <option value="">Todos los tipos</option>
          <option value="general">General (Cliente)</option>
          <option value="empleado">Empleado (Interno)</option>
        </select>
      </div>

      <div>
        <label class="filter-label" for="filter_estado" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Estado:</label>
        <select id="filter_estado" class="form-select" bind:value={estado} onchange={loadQuejas}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en revision">En Revisión</option>
          <option value="resuelto">Resuelto</option>
        </select>
      </div>

      <div>
        <label class="filter-label" for="filter_sort" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Orden:</label>
        <select id="filter_sort" class="form-select" bind:value={sort} onchange={loadQuejas}>
          <option value="desc">Más recientes primero</option>
          <option value="asc">Más antiguas primero</option>
        </select>
      </div>
    </div>
  </form>

  <!-- Tabla de Quejas con los 4 Bloques integrados -->
  <div class="card" style="padding: 0; overflow: hidden;">
    {#if loading}
      <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
        Cargando listado de quejas...
      </div>
    {:else if quejas.length === 0}
      <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
        No se encontraron quejas que coincidan con los filtros aplicados.
      </div>
    {:else}
      <div class="table-responsive" style="border: none;">
        <table class="table-custom table-quejas-direct">
          <thead>
            <tr>
              <th style="width: 22%; min-width: 210px;">Cliente / Usuario</th>
              <th style="width: 17%; min-width: 160px;">Clasificación</th>
              <th style="width: {readOnly ? '61%' : '47%'}; min-width: 320px;">Descripción de la Incidencia</th>
              {#if !readOnly}
                <th style="width: 14%; min-width: 125px; text-align: center;">Gestión / Estado</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each quejas as q (q.id)}
              <tr>
                <!-- BLOQUE 1: id de registro, usuario, nombre y apellido, correo -->
                <td>
                  <div class="aligned-4-section">
                    <!-- 1. id de registro -->
                    <div class="aligned-4-row">
                      <span class="radicado-pill">#{q.id}</span>
                    </div>
                    <!-- 2. usuario -->
                    <div class="aligned-4-row">
                      <span style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-muted); font-weight: 600;">
                        @{q.nombre_usuario}
                      </span>
                    </div>
                    <!-- 3. nombre y apellido -->
                    <div class="aligned-4-row">
                      <span style="font-weight: 700; color: var(--text-main); font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="{q.nombre_apellido}">
                        {q.nombre_apellido}
                      </span>
                    </div>
                    <!-- 4. correo -->
                    <div class="aligned-4-row">
                      <span style="font-size: 0.775rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="{q.correo}">
                        {q.correo}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- BLOQUE 2: categoria, tipo, estado, fecha de creacion -->
                <td>
                  <div class="aligned-4-section">
                    <!-- 1. categoria -->
                    <div class="aligned-4-row">
                      <span style="font-weight: 700; font-size: 0.875rem; color: var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        {getCategoryName(q.categoria_queja)}
                      </span>
                    </div>
                    <!-- 2. tipo -->
                    <div class="aligned-4-row">
                      <span class="badge {q.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                        {q.tipo_usuario}
                      </span>
                    </div>
                    <!-- 3. estado -->
                    <div class="aligned-4-row">
                      <span class="badge badge-{q.estado.replace(' ', '-')}">
                        {q.estado}
                      </span>
                    </div>
                    <!-- 4. fecha de creacion -->
                    <div class="aligned-4-row">
                      <span style="font-size: 0.775rem; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap;">
                        {new Date(q.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- BLOQUE 3 (MÁS GRANDE): Descripción abarcando todo lo restante -->
                <td>
                  <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap; word-break: break-word;">
                    {q.descripcion}
                  </div>
                </td>

                {#if !readOnly}
                  <!-- BLOQUE 4: Sección con botón Eliminar arriba de Pendiente, En revisión, Resuelto -->
                  <td>
                    <div class="aligned-4-section status-btn-stack">
                    <!-- 1. Eliminar -->
                    <div class="aligned-4-row">
                      {#if confirmDeleteId === q.id}
                        <div style="display: flex; gap: 0.25rem; width: 100%;">
                          <button 
                            type="button" 
                            class="btn btn-danger btn-xs"
                            style="flex: 1; padding: 0.25rem 0.2rem; font-size: 0.725rem; font-weight: 700; background-color: #e11d48; border-color: #be123c; color: #fff;"
                            onclick={() => executeDelete(q)}
                            disabled={deletingId === q.id}
                            title="Confirmar eliminación total"
                          >
                            {deletingId === q.id ? '...' : '¿Borrar?'}
                          </button>
                          <button 
                            type="button" 
                            class="btn btn-secondary btn-xs"
                            style="padding: 0.25rem 0.4rem; font-size: 0.725rem;"
                            onclick={() => confirmDeleteId = null}
                            title="Cancelar"
                          >
                            No
                          </button>
                        </div>
                      {:else}
                        <button 
                          type="button" 
                          class="btn-row-status btn-status-delete"
                          onclick={() => confirmDeleteId = q.id}
                          disabled={deletingId === q.id || savingStatusId === q.id}
                          title="Eliminar registro"
                        >
                          Eliminar
                        </button>
                      {/if}
                    </div>
                    <!-- 2. Pendiente -->
                    <div class="aligned-4-row">
                      <button 
                        type="button" 
                        class="btn-row-status {q.estado === 'pendiente' ? 'active-pendiente' : ''}"
                        onclick={() => handleQuickStatus(q, 'pendiente')}
                        disabled={savingStatusId === q.id || deletingId === q.id}
                        title="Marcar como Pendiente"
                      >
                        Pendiente
                      </button>
                    </div>
                    <!-- 3. En revisión -->
                    <div class="aligned-4-row">
                      <button 
                        type="button" 
                        class="btn-row-status {q.estado === 'en revision' ? 'active-revision' : ''}"
                        onclick={() => handleQuickStatus(q, 'en revision')}
                        disabled={savingStatusId === q.id || deletingId === q.id}
                        title="Marcar como En revisión"
                      >
                        En revisión
                      </button>
                    </div>
                    <!-- 4. Resuelto -->
                    <div class="aligned-4-row">
                      <button 
                        type="button" 
                        class="btn-row-status {q.estado === 'resuelto' ? 'active-resuelto' : ''}"
                        onclick={() => handleQuickStatus(q, 'resuelto')}
                        disabled={savingStatusId === q.id || deletingId === q.id}
                        title="Marcar como Resuelto"
                      >
                        Resuelto
                      </button>
                    </div>
                  </div>
                </td>
              {/if}
            </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- SECCIÓN: DIRECTORIO DE CLIENTES Y COLABORADORES -->
  <div style="margin-top: 3.5rem; border-top: 2px solid var(--border-subtle); padding-top: 2rem;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2>Directorio de Clientes y Colaboradores</h2>
        <p style="margin-top: 0.25rem;">
          Directorio consolidado de clientes que han remitido novedades en la plataforma.
        </p>
      </div>
      <div>
        <span style="font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
          Total registrados: <strong>{clientes.length}</strong>
        </span>
      </div>
    </div>

    {#if errorClientes}
      <div class="alert alert-danger">{errorClientes}</div>
    {/if}

    <!-- Barra de Filtros de Clientes -->
    <form onsubmit={handleFilterClientes} class="card" style="padding: 1.15rem; margin-bottom: 1.5rem; background-color: var(--bg-card);">
      <div style="display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px;">
          <label class="filter-label" for="client_search" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Buscar:</label>
          <input 
            id="client_search"
            type="text" 
            class="form-control" 
            placeholder="Nombre, usuario o correo..."
            bind:value={searchClientes}
          />
        </div>

        <div style="min-width: 200px;">
          <label class="filter-label" for="client_tipo" style="font-weight: 600; margin-bottom: 0.35rem; display: block;">Tipo de Cliente:</label>
          <select id="client_tipo" class="form-select" bind:value={tipoUsuarioClientes} onchange={() => loadClientes(true)}>
            <option value="">Todos los tipos</option>
            <option value="general">Clientes Generales</option>
            <option value="empleado">Empleados Internos</option>
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button type="submit" class="btn btn-primary" style="padding: 0.55rem 1.4rem; font-weight: 600;">
            Buscar
          </button>
          <button type="button" class="btn btn-secondary" style="padding: 0.55rem 1.4rem; font-weight: 600;" onclick={resetFilterClientes}>
            Limpiar
          </button>
        </div>
      </div>
    </form>

    <!-- Tabla de Clientes con edición de nombre y tipo, y eliminación -->
    <div class="card" style="padding: 0; overflow: hidden; background-color: var(--bg-surface); margin-bottom: 2.5rem;">
      {#if loadingClientes}
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Cargando listado de clientes...
        </div>
      {:else if clientes.length === 0}
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          No se encontraron clientes que coincidan con la búsqueda.
        </div>
      {:else}
        <div class="table-responsive" style="border: none;">
          <table class="table-custom table-quejas-direct">
            <thead>
              <tr>
                <th style="width: 20%; min-width: 170px;">Cliente / Usuario</th>
                <th style="width: {readOnly ? '24%' : '20%'}; min-width: 170px;">Nombre</th>
                <th style="width: {readOnly ? '14%' : '12%'}; min-width: 110px;">Tipo</th>
                <th style="width: {readOnly ? '13%' : '11%'}; min-width: 100px; text-align: center;">Total Incidencias</th>
                <th style="width: {readOnly ? '15%' : '13%'}; min-width: 110px; text-align: center;">Pendientes</th>
                <th style="width: {readOnly ? '14%' : '11%'}; min-width: 110px;">Última Incidencia</th>
                {#if !readOnly}
                  <th style="width: 13%; min-width: 130px; text-align: right;">Acción</th>
                {/if}
              </tr>
            </thead>
            <tbody>
              {#each clientes as c (c.id)}
                <tr>
                  <!-- CLIENTE / USUARIO: id, usuario, correo -->
                  <td>
                    <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                      <div>
                        <span class="radicado-pill">#{c.id}</span>
                      </div>
                      <div>
                        <span style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-muted); font-weight: 600;">
                          @{c.nombre_usuario}
                        </span>
                      </div>
                      <div>
                        <span style="font-size: 0.775rem; color: var(--text-secondary); word-break: break-all;" title="{c.correo}">
                          {c.correo}
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- NOMBRE (Editable) -->
                  <td>
                    {#if !readOnly && editingClientId === c.id}
                      <input 
                        type="text" 
                        class="form-control" 
                        bind:value={editClientNombre} 
                        placeholder="Nombre y apellido"
                        style="padding: 0.3rem 0.5rem; font-size: 0.85rem; font-weight: 600; width: 100%; max-width: 220px;"
                      />
                    {:else}
                      <span style="font-weight: 700; color: var(--text-main); font-size: 0.875rem;" title="{c.nombre_apellido}">
                        {c.nombre_apellido}
                      </span>
                    {/if}
                  </td>

                  <!-- TIPO (Editable: general / empleado) -->
                  <td>
                    {#if !readOnly && editingClientId === c.id}
                      <select 
                        class="form-select" 
                        bind:value={editClientTipo}
                        style="padding: 0.25rem 0.4rem; font-size: 0.8rem; font-weight: 700; height: 32px;"
                      >
                        <option value="general">GENERAL</option>
                        <option value="empleado">EMPLEADO</option>
                      </select>
                    {:else}
                      <span class="badge {c.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                        {c.tipo_usuario}
                      </span>
                    {/if}
                  </td>

                  <!-- TOTAL QUEJAS -->
                  <td style="text-align: center;">
                    <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.95rem;">
                      {c.total_quejas}
                    </span>
                  </td>

                  <!-- PENDIENTES -->
                  <td style="text-align: center;">
                    {#if parseInt(c.quejas_pendientes || 0) > 0}
                      <span class="badge badge-pendiente">{c.quejas_pendientes} pendientes</span>
                    {:else}
                      <span style="color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);">0 pendientes</span>
                    {/if}
                  </td>

                  <!-- ÚLTIMA QUEJA -->
                  <td>
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap;">
                      {c.ultima_queja_fecha ? new Date(c.ultima_queja_fecha).toLocaleDateString() : 'N/A'}
                    </span>
                  </td>

                  {#if !readOnly}
                    <!-- ACCIÓN -->
                    <td style="text-align: right;">
                      {#if editingClientId === c.id}
                        <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: flex-end;">
                          <button 
                            type="button" 
                            class="btn btn-primary btn-xs" 
                            style="padding: 0.3rem 0.65rem; font-weight: 700;"
                            onclick={() => saveEditClient(c)} 
                            disabled={savingClientId === c.id}
                          >
                            {savingClientId === c.id ? '...' : 'Guardar'}
                          </button>
                          <button 
                            type="button" 
                            class="btn btn-secondary btn-xs" 
                            style="padding: 0.3rem 0.5rem;"
                            onclick={cancelEditClient} 
                            disabled={savingClientId === c.id}
                          >
                            Cancelar
                          </button>
                        </div>
                      {:else}
                        <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: flex-end;">
                          <button 
                            type="button" 
                            class="btn btn-secondary btn-xs" 
                            style="padding: 0.3rem 0.65rem; font-weight: 600;"
                            onclick={() => startEditClient(c)} 
                            disabled={deletingClientId === c.id || editingClientId !== null}
                            title="Editar nombre y tipo de cliente"
                          >
                            Editar
                          </button>

                          {#if confirmDeleteClientId === c.id}
                            <div style="display: inline-flex; gap: 0.25rem;">
                              <button 
                                type="button" 
                                class="btn btn-danger btn-xs" 
                                style="padding: 0.3rem 0.5rem; font-size: 0.725rem; font-weight: 700; background-color: #e11d48; border-color: #be123c; color: #fff;"
                                onclick={() => executeDeleteClient(c)}
                                disabled={deletingClientId === c.id}
                                title="Confirmar eliminación permanente"
                              >
                                {deletingClientId === c.id ? '...' : '¿Borrar?'}
                              </button>
                              <button 
                                type="button" 
                                class="btn btn-secondary btn-xs" 
                                style="padding: 0.3rem 0.4rem; font-size: 0.725rem;"
                                onclick={() => confirmDeleteClientId = null}
                                title="Cancelar"
                              >
                                No
                              </button>
                            </div>
                          {:else}
                            <button 
                              type="button" 
                              class="btn-row-status btn-status-delete btn-xs" 
                              style="padding: 0.3rem 0.65rem; font-size: 0.75rem; border-radius: var(--radius-sm);"
                              onclick={() => confirmDeleteClientId = c.id}
                              disabled={deletingClientId === c.id || editingClientId !== null}
                              title="Eliminar cliente del sistema"
                            >
                              Eliminar
                            </button>
                          {/if}
                        </div>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</div>
