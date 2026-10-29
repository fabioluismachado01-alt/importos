-- Etapa 1: custo de logística própria por tipo de envio (aplicar ANTES do deploy)
CREATE TABLE IF NOT EXISTS ml_logistica_custo (
  id               text PRIMARY KEY,
  workspace_id     text NOT NULL,
  logistica_tipo   text NOT NULL,
  custo_por_pedido double precision NOT NULL DEFAULT 0,
  updated_at       timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ml_logistica_custo_workspace_id_logistica_tipo_key ON ml_logistica_custo (workspace_id, logistica_tipo);
ALTER TABLE ml_logistica_custo ENABLE ROW LEVEL SECURITY;
