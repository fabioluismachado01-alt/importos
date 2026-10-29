-- Etapa 3 — Shopee via Open Platform API. Rodar no Supabase ANTES do deploy.
CREATE TABLE IF NOT EXISTS "shopee_conexao" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "shop_id" TEXT NOT NULL,
  "shop_name" TEXT NOT NULL,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shopee_conexao_workspace_id_shop_id_key" ON "shopee_conexao"("workspace_id","shop_id");
CREATE INDEX IF NOT EXISTS "shopee_conexao_workspace_id_idx" ON "shopee_conexao"("workspace_id");

CREATE TABLE IF NOT EXISTS "shopee_pedido" (
  "id" TEXT PRIMARY KEY,
  "conexao_id" TEXT NOT NULL REFERENCES "shopee_conexao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workspace_id" TEXT NOT NULL,
  "order_sn" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL DEFAULT '0',
  "status" TEXT NOT NULL DEFAULT 'paid',
  "status_shopee" TEXT,
  "data_compra" TIMESTAMP(3) NOT NULL,
  "comprador" TEXT NOT NULL DEFAULT '',
  "titulo" TEXT NOT NULL,
  "foto_url" TEXT,
  "sku" TEXT,
  "quantidade" INTEGER NOT NULL DEFAULT 1,
  "valor_venda" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tarifa" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outros" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "frete_vendedor" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "repasse" DOUBLE PRECISION,
  "custo_produto" DOUBLE PRECISION,
  "produto_id" TEXT,
  "devolucao_status" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shopee_pedido_workspace_id_order_sn_item_id_model_id_key" ON "shopee_pedido"("workspace_id","order_sn","item_id","model_id");
CREATE INDEX IF NOT EXISTS "shopee_pedido_workspace_id_data_compra_idx" ON "shopee_pedido"("workspace_id","data_compra");
CREATE INDEX IF NOT EXISTS "shopee_pedido_conexao_id_idx" ON "shopee_pedido"("conexao_id");

CREATE TABLE IF NOT EXISTS "shopee_ads_dia" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "conexao_id" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "custo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receita" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receita_direta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unidades" INTEGER NOT NULL DEFAULT 0,
  "cliques" INTEGER NOT NULL DEFAULT 0,
  "impressoes" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shopee_ads_dia_conexao_id_data_key" ON "shopee_ads_dia"("conexao_id","data");
CREATE INDEX IF NOT EXISTS "shopee_ads_dia_workspace_id_data_idx" ON "shopee_ads_dia"("workspace_id","data");

-- Regra do projeto: toda tabela nova com RLS (o app usa Prisma como owner e ignora RLS)
ALTER TABLE "shopee_conexao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopee_pedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopee_ads_dia" ENABLE ROW LEVEL SECURITY;
