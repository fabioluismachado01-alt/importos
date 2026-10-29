-- Etapa 1: repasse/liquidação do ML (aplicar ANTES do deploy)
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS liquidacao_status text;
ALTER TABLE ml_pedido ADD COLUMN IF NOT EXISTS liquidacao_data timestamp(3);
