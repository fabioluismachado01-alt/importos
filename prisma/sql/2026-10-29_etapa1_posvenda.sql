-- Etapa 1: pós-venda do Mercado Livre em ml_pedido (aplicar ANTES do deploy do código que usa as colunas)
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS devolucao_status text;
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS claim_id text;
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS ml_tags text;
