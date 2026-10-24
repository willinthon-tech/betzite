-- Inicialización del esquema para BETZITE

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  clave VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre_usuario VARCHAR(100) UNIQUE NOT NULL,
  nombre_apellido VARCHAR(150) NOT NULL,
  correo VARCHAR(150) UNIQUE NOT NULL,
  tipo_usuario VARCHAR(50) NOT NULL CHECK (tipo_usuario IN ('empleado', 'general')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quejas (
  id SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  categoria_queja VARCHAR(100) NOT NULL CHECK (categoria_queja IN ('atencion al cliente', 'maquinas', 'casino en vivo', 'apuestas deportivas', 'general')),
  descripcion TEXT NOT NULL,
  estado VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en revision', 'resuelto')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quejas_cliente_id ON quejas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_quejas_categoria ON quejas(categoria_queja);
CREATE INDEX IF NOT EXISTS idx_quejas_estado ON quejas(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes(tipo_usuario);
