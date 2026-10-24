<script>
  import { onMount } from 'svelte';
  import { api, authState } from './api.js';

  let { id } = $props();

  let queja = $state(null);
  let navigation = $state({ prev_id: null, next_id: null });
  let loading = $state(true);
  let error = $state(null);
  let successMsg = $state(null);

  // Formulario de edición
  let editForm = $state({
    nombre_usuario: '',
    nombre_apellido: '',
    correo: '',
    tipo_usuario: 'general',
    categoria_queja: 'general',
    estado: 'pendiente',
    descripcion: ''
  });

  let saving = $state(false);
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);

  const isLevel1 = $derived(!!authState.user);

  async function loadDetail(quejaId) {
    loading = true;
    error = null;
    successMsg = null;
    showDeleteConfirm = false;
    try {
      const data = await api.getQueja(quejaId);
      queja = data.queja;
      navigation = data.navigation || { prev_id: null, next_id: null };

      // Llenar formulario editable
      editForm = {
        nombre_usuario: queja.nombre_usuario || '',
        nombre_apellido: queja.nombre_apellido || '',
        correo: queja.correo || '',
        tipo_usuario: queja.tipo_usuario || 'general',
        categoria_queja: queja.categoria_queja || 'general',
        estado: queja.estado || 'pendiente',
        descripcion: queja.descripcion || ''
      };
    } catch (err) {
      error = err.message || 'No fue posible cargar el detalle de la queja.';
    } finally {
      loading = false;
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!isLevel1) return;

    saving = true;
    error = null;
    successMsg = null;

    try {
      const res = await api.updateQueja(id, editForm);
      queja = res.queja;
      successMsg = res.message || 'Información actualizada exitosamente.';
    } catch (err) {
      error = err.message || 'Error al guardar modificaciones.';
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!isLevel1) return;
    deleting = true;
    error = null;
    try {
      await api.deleteQueja(id);
      window.location.hash = '#/admin';
    } catch (err) {
      error = err.message || 'Error al eliminar la queja.';
      deleting = false;
    }
  }

  onMount(() => {
    loadDetail(id);
  });
</script>

<div>
  <!-- Barra de Navegación Secuencial (Adelante y Atrás) -->
  <div class="pager-bar">
    <div>
      {#if navigation.prev_id}
        <a href="#/admin/quejas/{navigation.prev_id}" class="btn btn-secondary btn-sm" onclick={() => loadDetail(navigation.prev_id)}>
          &larr; Queja Anterior (#{navigation.prev_id})
        </a>
      {:else}
        <button type="button" class="btn btn-secondary btn-sm" disabled>
          &larr; Primera Queja
        </button>
      {/if}
    </div>

    <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-secondary);">
      Navegación de Casos
    </div>

    <div>
      {#if navigation.next_id}
        <a href="#/admin/quejas/{navigation.next_id}" class="btn btn-secondary btn-sm" onclick={() => loadDetail(navigation.next_id)}>
          Queja Siguiente (#{navigation.next_id}) &rarr;
        </a>
      {:else}
        <button type="button" class="btn btn-secondary btn-sm" disabled>
          Última Queja &rarr;
        </button>
      {/if}
    </div>
  </div>

  <div class="breadcrumb-bar">
    <a href="#/admin" class="breadcrumb-item">Panel Administrativo</a>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item current">Queja #{id}</span>
  </div>

  {#if loading}
    <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
      Cargando información del caso...
    </div>
  {:else if error && !queja}
    <div class="alert alert-danger">{error}</div>
    <a href="#/admin" class="btn btn-secondary btn-sm">Volver al panel</a>
  {:else if queja}
    <!-- Alertas informativas -->
    {#if successMsg}
      <div class="alert alert-success">{successMsg}</div>
    {/if}

    {#if error}
      <div class="alert alert-danger">{error}</div>
    {/if}

    <form onsubmit={handleSave}>
      <div class="detail-grid">
        <!-- Columna principal: Datos de la queja y descripción -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Detalle de la Queja Radicado #{queja.id}</h3>
              <p class="card-desc">Información del reclamo e incidencia reportada</p>
            </div>
            <div>
              <span class="badge badge-{editForm.estado.replace(' ', '-')}">
                {editForm.estado}
              </span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label" for="edit_categoria">Área / Categoría de Queja</label>
              {#if isLevel1}
                <select id="edit_categoria" class="form-select" bind:value={editForm.categoria_queja}>
                  <option value="atencion al cliente">Atención al Cliente</option>
                  <option value="maquinas">Máquinas</option>
                  <option value="casino en vivo">Casino en Vivo</option>
                  <option value="apuestas deportivas">Apuestas Deportivas</option>
                  <option value="general">General</option>
                </select>
              {:else}
                <input type="text" class="form-control" value={queja.categoria_queja} readonly />
              {/if}
            </div>

            <div class="form-group">
              <label class="form-label" for="edit_estado">Estado del Caso</label>
              {#if isLevel1}
                <select id="edit_estado" class="form-select" bind:value={editForm.estado}>
                  <option value="pendiente">Pendiente</option>
                  <option value="en revision">En Revisión</option>
                  <option value="resuelto">Resuelto</option>
                </select>
              {:else}
                <input type="text" class="form-control" value={queja.estado} readonly />
              {/if}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="edit_descripcion">Descripción Detallada</label>
            {#if isLevel1}
              <textarea 
                id="edit_descripcion" 
                class="form-textarea" 
                rows="6"
                bind:value={editForm.descripcion}
                required
              ></textarea>
            {:else}
              <div style="background-color: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;">
                {queja.descripcion}
              </div>
            {/if}
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); padding-top: 0.5rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
            <span>Fecha de registro: <strong>{new Date(queja.created_at).toLocaleString()}</strong></span>
            <span>Última modificación: <strong>{new Date(queja.updated_at).toLocaleString()}</strong></span>
          </div>

          <!-- Botones de Acción -->
          {#if isLevel1}
            <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 1rem; flex-wrap: wrap; gap: 0.75rem;">
              <div>
                <button 
                  type="button" 
                  class="btn btn-outline-danger btn-sm"
                  onclick={() => showDeleteConfirm = !showDeleteConfirm}
                >
                  {showDeleteConfirm ? 'Ocultar confirmación' : 'Eliminar Esta Queja'}
                </button>
              </div>

              <div style="display: flex; gap: 0.5rem;">
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm"
                  onclick={() => loadDetail(id)}
                >
                  Restablecer
                </button>
                <button 
                  type="submit" 
                  class="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar Modificaciones'}
                </button>
              </div>
            </div>

            <!-- Panel de confirmación en línea para eliminar (SIN MODALES) -->
            {#if showDeleteConfirm}
              <div class="inline-confirm-box">
                <div class="inline-confirm-text">
                  Confirmación requerida: ¿Desea eliminar permanentemente la queja #{queja.id}? Esta acción no se puede deshacer.
                </div>
                <div class="inline-confirm-actions">
                  <button 
                    type="button" 
                    class="btn btn-danger btn-sm"
                    disabled={deleting}
                    onclick={handleDelete}
                  >
                    {deleting ? 'Eliminando...' : 'Confirmar Eliminación'}
                  </button>
                  <button 
                    type="button" 
                    class="btn btn-secondary btn-sm"
                    onclick={() => showDeleteConfirm = false}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Columna lateral: Datos del Cliente -->
        <div>
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Datos del Cliente</h3>
                <p class="card-desc">Información provista en el formulario público</p>
              </div>
              <a href="#/admin/quejas" class="btn btn-secondary btn-sm">
                Volver a Quejas
              </a>
            </div>

            <div class="form-group">
              <label class="form-label" for="edit_username">Nombre de Usuario (Único)</label>
              {#if isLevel1}
                <input 
                  id="edit_username" 
                  type="text" 
                  class="form-control" 
                  bind:value={editForm.nombre_usuario}
                  required 
                />
              {:else}
                <input type="text" class="form-control" value={queja.nombre_usuario} readonly />
              {/if}
            </div>

            <div class="form-group">
              <label class="form-label" for="edit_fullname">Nombre y Apellido</label>
              {#if isLevel1}
                <input 
                  id="edit_fullname" 
                  type="text" 
                  class="form-control" 
                  bind:value={editForm.nombre_apellido}
                  required 
                />
              {:else}
                <input type="text" class="form-control" value={queja.nombre_apellido} readonly />
              {/if}
            </div>

            <div class="form-group">
              <label class="form-label" for="edit_email">Correo Electrónico (Único)</label>
              {#if isLevel1}
                <input 
                  id="edit_email" 
                  type="email" 
                  class="form-control" 
                  bind:value={editForm.correo}
                  required 
                />
              {:else}
                <input type="text" class="form-control" value={queja.correo} readonly />
              {/if}
            </div>

            <div class="form-group">
              <span class="form-label">Tipo de Usuario</span>
              {#if isLevel1}
                <div class="radio-group" style="margin-top: 0.35rem;">
                  <label class="radio-label">
                    <input 
                      type="radio" 
                      name="detail_tipo" 
                      value="general" 
                      bind:group={editForm.tipo_usuario} 
                    />
                    General
                  </label>
                  <label class="radio-label">
                    <input 
                      type="radio" 
                      name="detail_tipo" 
                      value="empleado" 
                      bind:group={editForm.tipo_usuario} 
                    />
                    Empleado
                  </label>
                </div>
              {:else}
                <div>
                  <span class="badge {queja.tipo_usuario === 'empleado' ? 'badge-empleado' : 'badge-general'}">
                    {queja.tipo_usuario}
                  </span>
                </div>
              {/if}
            </div>

            <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-muted);">
              Cliente ID: <strong>#{queja.cliente_id}</strong><br>
              Toda modificación guardada actualizará la ficha general del cliente.
            </div>
          </div>

          <div style="text-align: center; margin-top: 1rem;">
            <a href="#/admin" class="btn btn-secondary" style="width: 100%;">
              &larr; Volver al Panel
            </a>
          </div>
        </div>
      </div>
    </form>
  {/if}
</div>
