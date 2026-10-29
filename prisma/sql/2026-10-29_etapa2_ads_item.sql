-- Etapa 2: ads por anúncio e dia (aplicar ANTES do deploy)
CREATE TABLE IF NOT EXISTS ml_ads_item_dia (
  id           text PRIMARY KEY,
  workspace_id text NOT NULL,
  conexao_id   text NOT NULL,
  data         date NOT NULL,
  ml_item_id   text NOT NULL,
  custo        double precision NOT NULL DEFAULT 0,
  receita      double precision NOT NULL DEFAULT 0,
  unidades     integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ml_ads_item_dia_conexao_id_data_ml_item_id_key ON ml_ads_item_dia (conexao_id, data, ml_item_id);
CREATE INDEX IF NOT EXISTS ml_ads_item_dia_workspace_id_data_idx ON ml_ads_item_dia (workspace_id, data);
ALTER TABLE ml_ads_item_dia ENABLE ROW LEVEL SECURITY;
