-- Etapa 2: Product Ads do ML (aplicar ANTES do deploy)
CREATE TABLE IF NOT EXISTS ml_ads_dia (
  id             text PRIMARY KEY,
  workspace_id   text NOT NULL,
  conexao_id     text NOT NULL,
  data           date NOT NULL,
  custo          double precision NOT NULL DEFAULT 0,
  receita        double precision NOT NULL DEFAULT 0,
  receita_direta double precision NOT NULL DEFAULT 0,
  unidades       integer NOT NULL DEFAULT 0,
  cliques        integer NOT NULL DEFAULT 0,
  impressoes     integer NOT NULL DEFAULT 0,
  updated_at     timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ml_ads_dia_conexao_id_data_key ON ml_ads_dia (conexao_id, data);
CREATE INDEX IF NOT EXISTS ml_ads_dia_workspace_id_data_idx ON ml_ads_dia (workspace_id, data);
ALTER TABLE ml_ads_dia ENABLE ROW LEVEL SECURITY;
