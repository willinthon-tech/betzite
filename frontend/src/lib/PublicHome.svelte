<script>
  import { onMount } from 'svelte';
  import { api } from './api.js';
  import { onWs, subscribeWsStatus } from './ws.js';

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

  let form = $state({
    nombre_usuario: '',
    nombre_apellido: '',
    correo: '',
    tipo_usuario: 'general',
    categoria_queja: 'atencion al cliente',
    descripcion: ''
  });

  let wsConnected = $state(false);
  let submitting = $state(false);
  let successMessage = $state(null);
  let errorMessage = $state(null);
  let clientStatusMessage = $state(null);
  let isExistingClient = $state(false);

  // Validación de conflictos de identidad en tiempo real
  let userConflict = $state(null);
  let emailConflict = $state(null);
  let hasConflict = $derived(Boolean(userConflict || emailConflict));
  let validateTimeout = null;

  // Sugerencias y Autocomplete
  let knownClients = $state([]);
  let suggestions = $state([]);
  let selectedIndex = $state(0);
  let showUserSuggestions = $state(false);
  let showNameSuggestions = $state(false);
  let showEmailSuggestions = $state(false);
  let searchTimeout = null;

  function handleKeydown(e, field) {
    if (suggestions.length === 0) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const target = suggestions[selectedIndex >= 0 && selectedIndex < suggestions.length ? selectedIndex : 0];
      if (target) {
        applyClientData(target, true);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % suggestions.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === 'Enter') {
      if (showUserSuggestions || showNameSuggestions || showEmailSuggestions) {
        e.preventDefault();
        const target = suggestions[selectedIndex >= 0 && selectedIndex < suggestions.length ? selectedIndex : 0];
        if (target) {
          applyClientData(target, true);
        }
      }
    } else if (e.key === 'Escape') {
      showUserSuggestions = false;
      showNameSuggestions = false;
      showEmailSuggestions = false;
    }
  }

  async function loadKnownClients() {
    try {
      const res = await api.buscarClientes('');
      if (res.clientes) {
        knownClients = res.clientes;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMetrics() {
    try {
      const data = await api.getPublicMetrics();
      if (data.metrics) {
        metrics = data.metrics;
      }
    } catch (err) {
      console.error('Error cargando métricas:', err);
    }
  }

  // Validación en tiempo real (instantánea con memoria local + respaldo debounced con backend)
  function runValidation(uVal, eVal) {
    const u = (uVal || '').trim().toLowerCase();
    const e = (eVal || '').trim().toLowerCase();

    // 1. Verificación instantánea local contra clientes conocidos
    if (u || e) {
      const matchByUser = u ? knownClients.find(c => c.nombre_usuario.toLowerCase() === u) : null;
      const matchByEmail = e ? knownClients.find(c => c.correo.toLowerCase() === e) : null;

      if (u && e) {
        if (matchByUser && matchByEmail) {
          if (matchByUser.id !== matchByEmail.id) {
            userConflict = `El usuario @${matchByUser.nombre_usuario} está registrado con otro correo (${matchByUser.correo}).`;
            emailConflict = `Este correo ya pertenece al usuario @${matchByEmail.nombre_usuario} (${matchByEmail.nombre_apellido}).`;
            isExistingClient = false;
            clientStatusMessage = null;
            return;
          } else {
            // Mismo cliente exacto
            userConflict = null;
            emailConflict = null;
            isExistingClient = true;
            clientStatusMessage = `Cliente existente reconocido (@${matchByUser.nombre_usuario}). Datos vinculados automáticamente.`;
            return;
          }
        } else if (!matchByUser && matchByEmail) {
          // El correo ya pertenece a otro usuario existente
          emailConflict = `Este correo ya pertenece al usuario @${matchByEmail.nombre_usuario} (${matchByEmail.nombre_apellido}).`;
          userConflict = null;
          isExistingClient = false;
          clientStatusMessage = null;
          return;
        } else if (matchByUser && !matchByEmail) {
          // El usuario ya existe en base de datos con un correo diferente
          if (e.includes('@') || e.length >= 4) {
            userConflict = `El usuario @${matchByUser.nombre_usuario} ya está registrado con el correo ${matchByUser.correo}.`;
          } else {
            userConflict = null;
          }
          emailConflict = null;
          isExistingClient = false;
          clientStatusMessage = null;
          return;
        } else {
          // Ambos son nuevos
          userConflict = null;
          emailConflict = null;
          isExistingClient = false;
          clientStatusMessage = 'Nuevo cliente: Se creará automáticamente en la tabla de clientes al enviar.';
        }
      } else if (e && matchByEmail) {
        if (!u || u !== matchByEmail.nombre_usuario.toLowerCase()) {
          emailConflict = `Este correo ya pertenece al usuario @${matchByEmail.nombre_usuario} (${matchByEmail.nombre_apellido}).`;
          userConflict = null;
          clientStatusMessage = null;
        }
      } else if (u && matchByUser) {
        isExistingClient = true;
        clientStatusMessage = `Cliente existente reconocido (@${matchByUser.nombre_usuario}).`;
        userConflict = null;
        emailConflict = null;
      } else {
        userConflict = null;
        emailConflict = null;
        clientStatusMessage = null;
        isExistingClient = false;
      }
    } else {
      userConflict = null;
      emailConflict = null;
      clientStatusMessage = null;
      isExistingClient = false;
    }

    // 2. Consulta debounced al backend para asegurar consistencia total con PostgreSQL
    if (validateTimeout) clearTimeout(validateTimeout);
    validateTimeout = setTimeout(async () => {
      if (!u && !e) return;
      try {
        const res = await api.validarIdentidad(u, e);
        if (res) {
          userConflict = res.userConflict || null;
          emailConflict = res.emailConflict || null;
          if (res.hasConflict) {
            clientStatusMessage = null;
          } else if (res.existingClient) {
            isExistingClient = true;
            clientStatusMessage = `Cliente existente reconocido (@${res.existingClient.nombre_usuario}). Datos vinculados automáticamente.`;
          } else if (res.isNew && (u || e)) {
            isExistingClient = false;
            clientStatusMessage = 'Nuevo cliente: Se creará automáticamente en la tabla de clientes al enviar.';
          }
        }
      } catch (err) {
        console.error('Error validando identidad:', err);
      }
    }, 150);
  }

  // Buscar clientes conforme el usuario escribe y validar
  function handleClientInput(field, value) {
    if (field === 'usuario') {
      runValidation(value, form.correo);
    } else if (field === 'correo') {
      runValidation(form.nombre_usuario, value);
    }

    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      if (!value || value.trim().length === 0) {
        suggestions = [];
        selectedIndex = 0;
        return;
      }

      try {
        const res = await api.buscarClientes(value.trim());
        suggestions = res.clientes || [];
        selectedIndex = 0;
      } catch (err) {
        console.error('Error al buscar clientes:', err);
      }
    }, 150);
  }

  function applyClientData(client, closeAll = true) {
    form.nombre_usuario = client.nombre_usuario;
    form.nombre_apellido = client.nombre_apellido;
    form.correo = client.correo;
    form.tipo_usuario = client.tipo_usuario;
    userConflict = null;
    emailConflict = null;
    isExistingClient = true;
    clientStatusMessage = `Cliente existente reconocido (@${client.nombre_usuario}). Datos vinculados automáticamente.`;
    
    if (closeAll) {
      showUserSuggestions = false;
      showNameSuggestions = false;
      showEmailSuggestions = false;
      suggestions = [];
      selectedIndex = 0;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    successMessage = null;
    errorMessage = null;

    if (hasConflict) {
      errorMessage = 'No es posible enviar la queja mientras existan conflictos de usuario o correo (marcados en rojo).';
      return;
    }

    if (!form.nombre_usuario.trim()) {
      errorMessage = 'Debe indicar un nombre de usuario.';
      return;
    }
    if (!form.nombre_apellido.trim()) {
      errorMessage = 'Debe ingresar el nombre y apellido del cliente.';
      return;
    }
    if (!form.correo.trim()) {
      errorMessage = 'Debe indicar un correo electrónico.';
      return;
    }
    if (!form.descripcion.trim() || form.descripcion.trim().length < 10) {
      errorMessage = 'La descripción de la queja debe detallar lo sucedido (mínimo 10 caracteres).';
      return;
    }

    submitting = true;
    try {
      const res = await api.submitQueja({
        nombre_usuario: form.nombre_usuario.trim(),
        nombre_apellido: form.nombre_apellido.trim(),
        correo: form.correo.trim(),
        tipo_usuario: form.tipo_usuario,
        categoria_queja: form.categoria_queja,
        descripcion: form.descripcion.trim()
      });

      successMessage = `Queja radicado #${res.queja_id} registrada con éxito. Área: ${res.categoria.toUpperCase()}.`;
      
      // Limpiar formulario
      form.nombre_usuario = '';
      form.nombre_apellido = '';
      form.correo = '';
      form.descripcion = '';
      form.tipo_usuario = 'general';
      form.categoria_queja = 'atencion al cliente';
      clientStatusMessage = null;
      isExistingClient = false;
      userConflict = null;
      emailConflict = null;
      suggestions = [];

      // Las métricas se actualizan automáticamente vía WebSocket,
      // pero ejecutamos loadMetrics() como respaldo inmediato
      await loadMetrics();
    } catch (err) {
      errorMessage = err.message || 'Error al enviar la queja.';
    } finally {
      submitting = false;
    }
  }

  onMount(() => {
    loadMetrics();
    loadKnownClients();

    // Estado de la conexión WebSocket
    const unsubStatus = subscribeWsStatus((status) => {
      wsConnected = status;
    });

    // Suscripción WebSocket a eventos en tiempo real
    const unsubQuejaCreada = onWs('queja_creada', (data) => {
      if (data && data.metrics) {
        metrics = data.metrics;
      }
      loadKnownClients();
    });

    const unsubQuejaActualizada = onWs('queja_actualizada', (data) => {
      if (data && data.metrics) {
        metrics = data.metrics;
      }
      loadKnownClients();
    });

    const unsubQuejaEliminada = onWs('queja_eliminada', (data) => {
      if (data && data.metrics) {
        metrics = data.metrics;
      }
      loadKnownClients();
    });

    const unsubClienteEliminado = onWs('cliente_eliminado', (data) => {
      if (data && data.metrics) {
        metrics = data.metrics;
      }
      loadKnownClients();
    });


    return () => {
      unsubStatus();
      unsubQuejaCreada();
      unsubQuejaActualizada();
      unsubQuejaEliminada();
      unsubClienteEliminado();
    };
  });
</script>

<div class="public-home">
  <!-- Cabecera principal -->
  <div style="margin-bottom: 1.5rem;">
    <h2>Módulo de Registro</h2>
    <p style="margin-top: 0.25rem;">
      Recepción de novedades e incidencias de clientes.
    </p>
  </div>

  <!-- Formulario Público de Registro de Queja (Abarca el ancho completo) -->
  <div class="card">
    {#if successMessage}
      <div class="alert alert-success">
        <strong>Confirmación:</strong> {successMessage}
      </div>
    {/if}

    {#if errorMessage}
      <div class="alert alert-danger">
        <strong>Aviso:</strong> {errorMessage}
      </div>
    {/if}

    <form onsubmit={handleSubmit}>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <!-- Campo: Usuario con Datalist / Autocomplete -->
        <div class="form-group autocomplete-wrapper">
          <label class="form-label" for="nombre_usuario">
            Usuario <span class="required">*</span>
          </label>
          <input 
            id="nombre_usuario" 
            type="text" 
            class="form-control {userConflict ? 'input-error' : ''}" 
            placeholder="Escriba usuario..."
            bind:value={form.nombre_usuario}
            onkeydown={(e) => handleKeydown(e, 'usuario')}
            onfocus={() => { showUserSuggestions = true; handleClientInput('usuario', form.nombre_usuario); }}
            oninput={() => { showUserSuggestions = true; handleClientInput('usuario', form.nombre_usuario); }}
            onblur={() => setTimeout(() => showUserSuggestions = false, 250)}
            required 
            autocomplete="off"
          />
          {#if userConflict}
            <div class="form-error-text">{userConflict}</div>
          {/if}

          {#if showUserSuggestions && suggestions.length > 0}
            <div class="datalist-popover">
              <div class="datalist-header">
                Coincidencias (Tab o clic):
              </div>
              <div class="datalist-items">
                {#each suggestions as cli, idx}
                  <button 
                    type="button" 
                    class="datalist-item {selectedIndex === idx ? 'active' : ''}"
                    onmouseenter={() => selectedIndex = idx}
                    onmousedown={() => applyClientData(cli, true)}
                  >
                    <div class="datalist-left">
                      <div class="datalist-info">
                        <div class="datalist-name">
                          {cli.nombre_apellido}
                        </div>
                        <div class="datalist-meta">
                          @{cli.nombre_usuario} &bull; {cli.correo} &bull; {cli.tipo_usuario}
                        </div>
                      </div>
                    </div>
                    <span class="tab-pill">Tab</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Campo: Correo Electrónico con Datalist / Autocomplete -->
        <div class="form-group autocomplete-wrapper">
          <label class="form-label" for="correo">
            Correo electrónico <span class="required">*</span>
          </label>
          <input 
            id="correo" 
            type="email" 
            class="form-control {emailConflict ? 'input-error' : ''}" 
            placeholder="Escriba correo..."
            bind:value={form.correo}
            onkeydown={(e) => handleKeydown(e, 'correo')}
            onfocus={() => { showEmailSuggestions = true; handleClientInput('correo', form.correo); }}
            oninput={() => { showEmailSuggestions = true; handleClientInput('correo', form.correo); }}
            onblur={() => setTimeout(() => showEmailSuggestions = false, 250)}
            required 
            autocomplete="off"
          />
          {#if emailConflict}
            <div class="form-error-text">{emailConflict}</div>
          {/if}

          {#if showEmailSuggestions && suggestions.length > 0}
            <div class="datalist-popover">
              <div class="datalist-header">
                Coincidencias (Tab o clic):
              </div>
              <div class="datalist-items">
                {#each suggestions as cli, idx}
                  <button 
                    type="button" 
                    class="datalist-item {selectedIndex === idx ? 'active' : ''}"
                    onmouseenter={() => selectedIndex = idx}
                    onmousedown={() => applyClientData(cli, true)}
                  >
                    <div class="datalist-left">
                      <div class="datalist-info">
                        <div class="datalist-name">
                          {cli.nombre_apellido}
                        </div>
                        <div class="datalist-meta">
                          @{cli.nombre_usuario} &bull; {cli.correo} &bull; {cli.tipo_usuario}
                        </div>
                      </div>
                    </div>
                    <span class="tab-pill">Tab</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Campo: Nombre y Apellido con Datalist / Autocomplete -->
      <div class="form-group autocomplete-wrapper">
        <label class="form-label" for="nombre_apellido">
          Nombre y Apellido <span class="required">*</span>
        </label>
        <input 
          id="nombre_apellido" 
          type="text" 
          class="form-control" 
          placeholder="Escriba nombre y apellido..."
          bind:value={form.nombre_apellido}
          onkeydown={(e) => handleKeydown(e, 'nombre')}
          onfocus={() => { showNameSuggestions = true; handleClientInput('nombre', form.nombre_apellido); }}
          oninput={() => { showNameSuggestions = true; handleClientInput('nombre', form.nombre_apellido); }}
          onblur={() => setTimeout(() => showNameSuggestions = false, 250)}
          required 
          autocomplete="off"
        />

        {#if showNameSuggestions && suggestions.length > 0}
          <div class="datalist-popover">
            <div class="datalist-header">
              Coincidencias (Tab o clic):
            </div>
            <div class="datalist-items">
              {#each suggestions as cli, idx}
                <button 
                  type="button" 
                  class="datalist-item {selectedIndex === idx ? 'active' : ''}"
                  onmouseenter={() => selectedIndex = idx}
                  onmousedown={() => applyClientData(cli, true)}
                >
                  <div class="datalist-left">
                    <div class="datalist-info">
                      <div class="datalist-name">
                        {cli.nombre_apellido}
                      </div>
                      <div class="datalist-meta">
                        @{cli.nombre_usuario} &bull; {cli.correo} &bull; {cli.tipo_usuario}
                      </div>
                    </div>
                  </div>
                  <span class="tab-pill">Tab</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <span class="form-label">
            Tipo de Usuario <span class="required">*</span>
          </span>
          <div class="radio-group" style="padding-top: 0.35rem;">
            <label class="radio-label">
              <input 
                type="radio" 
                name="tipo_usuario" 
                value="general" 
                bind:group={form.tipo_usuario} 
              />
              General
            </label>
            <label class="radio-label">
              <input 
                type="radio" 
                name="tipo_usuario" 
                value="empleado" 
                bind:group={form.tipo_usuario} 
              />
              Empleado
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="categoria_queja">
            Categoría <span class="required">*</span>
          </label>
          <select 
            id="categoria_queja" 
            class="form-select" 
            bind:value={form.categoria_queja}
            required
          >
            <option value="atencion al cliente">Atención al Cliente</option>
            <option value="maquinas">Máquinas</option>
            <option value="casino en vivo">Casino en Vivo</option>
            <option value="apuestas deportivas">Apuestas Deportivas</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="descripcion">
          Descripción <span class="required">*</span>
        </label>
        <textarea 
          id="descripcion" 
          class="form-textarea" 
          rows="4" 
          placeholder="Describa con precisión la falla o incidencia ocurrida (mínimo 10 caracteres)..."
          bind:value={form.descripcion}
          required
        ></textarea>
        <div class="form-hint" style="display: flex; justify-content: flex-end;">
          <span>{form.descripcion.length} caracteres</span>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;">
        <button 
          type="submit" 
          class="btn btn-primary" 
          disabled={hasConflict || submitting || !form.nombre_usuario.trim() || !form.correo.trim() || !form.nombre_apellido.trim() || form.descripcion.trim().length < 10}
          title={hasConflict ? 'Corrija los campos en rojo para continuar' : ''}
        >
          {submitting ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </form>
  </div>
</div>
