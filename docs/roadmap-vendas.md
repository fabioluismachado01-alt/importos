# Roadmap — módulo Vendas (Marketplaces)

Nota de continuidade. Última atualização: 29/10/2026 (tarde).
Objetivo: levar o ImportOS ao nível funcional do Metrizap (referência, não cópia) e superá-lo
nos diferenciais de importador. Regras de cálculo por canal: `docs/regras-calculo-marketplaces.md`.

## Infra (onde mexer)
- Código: GitHub `fabioluismachado01-alt/importos` → deploy automático no Vercel (time "impot-os",
  projeto `importos`, domínio importos.com.br). Merge na `main` = produção.
- Banco: Supabase projeto `awajdpidhzzgxfmssfef` (conta fabioluismachado01@hotmail.com).
  **O build NÃO aplica schema**: coluna nova no `schema.prisma` precisa de SQL no Supabase ANTES
  do deploy (guardar o SQL em `prisma/sql/`), senão a tela quebra.
- Workspace principal: `cmpx6dq5k000fvckk6d1aknfq` (conexão ML "NAMAVE").
- Fluxo seguro: branch → preview do Vercel → merge na main → conferir em produção.

## Feito
| Etapa | O quê | Commit |
|---|---|---|
| 0 | Build destravado (rodadas 15–17 nunca tinham ido ao ar) | 242f928 |
| 0 | Tarifa ML = sale_fee × qtd; CMV = custo × qtd; frete de pacote rateado; TACOS = ads ÷ faturamento | 7971362 |
| 0 | Vercel Cron diário `/api/cron/ml-sync` (06:00 BRT) | 3303c8c |
| 1 | Sync não sobrescreve mais o custo histórico do pedido; CMV mensal do rateio × qtd | 0eba2cc |
| 1 | Devoluções/mediações via claims/returns + card Devolvidas | 8f64d74 |
| 1 | Reconciliação de pedidos que somem da busca de pagos (ML) | 61d43ce |
| 2 | Product Ads do ML via API (tabela `ml_ads_dia`, gasto e receita atribuída diários) | c8a7061 |
| 1 | Custo de logística própria por tipo de envio (`ml_logistica_custo`, card Outros) + alerta de vendas sem custo | 4c07eda |
| 2 | Lucro por produto após ads (`ml_ads_item_dia`, ads por anúncio e dia, até 31 dias) | e0d12ec |
| 4 | Calculadora por venda (lucro, preço ideal/mínimo, ACOS máx., ROAS mín.) + ranking filtra a tabela | 814b77a |
| 1 | Repasse via Mercado Pago (`/v1/payments/{id}` aceita o token ML): card A receber, selo por venda, atrasados | 3e818d9 |
| 4 | Fonte do app corrigida (Times → Inter) + identidade marinho/ouro na tela de Vendas + calculadora no celular | add9b9f |

Banco (29/10): colunas `ml_pedido.devolucao_status, claim_id, ml_tags`; tarifa de 176 pedidos
antigos com qtd > 1 corrigida (backup em `_bkp_ml_pedido_tarifa_20261029`, RLS ligado).

Banco (29/10, tarde): tabela `ml_ads_dia`; **RLS ligado em todas as tabelas do schema public**
(antes 37 tabelas abertas pela API REST do Supabase). Script: `prisma/sql/2026-10-29_rls_tabelas_publicas.sql`.
Toda tabela nova precisa de `ENABLE ROW LEVEL SECURITY` no SQL de criação.

Conferência ML 30 dias vs Metrizap: vendas, faturamento, tarifas e frete **idênticos**.
Diferenças restantes são de regra/cadastro: imposto (Simples efetivo 7,9% vs 8% fixo) e custo
unitário de BTS-1, INV070-5, INV070, DTS-1 (os dois sistemas têm valores diferentes).
Ads ML 30 dias: R$ 145,50 vs R$ 145,44 (arredondamento diário); receita atribuída R$ 1.632,90 idêntica.

## Pendências do Fábio
- [ ] Criar `CRON_SECRET` (Production) no Vercel e fazer redeploy — sem ela o cron recebe 401.
- [ ] Tornar o repositório privado.
- [ ] Definir o custo correto de BTS-1, INV070-5, INV070, DTS-1.
- [ ] Abrir cadastro de desenvolvedor: Shopee Open Platform, TikTok Shop Partner, Amazon SP-API.

## Próximas etapas (ordem)
1. **Etapa 4 (resto)**: colunas personalizáveis; levar a identidade marinho/ouro às outras telas (tokens em globals.css).
2. **Etapa 3 — Shopee via API** (pedidos + escrow detail + Ads). Hoje é import de CSV.
3. **Etapa 4 — Tela de Vendas multicanal**: chips por conta, rankings que filtram a tabela,
   dividir por marketplace, colunas personalizáveis, calculadora por venda, visual azul-marinho/dourado.
5. **Etapa 5 — TikTok Shop e Amazon via API** (inclui Amazon Ads, que o Metrizap não tem).
6. **Etapa 6 — Diferenciais**: CMV pelo landed cost do rateio (já existe vigência em
   `actions/rateio.ts`), DRE mensal competência × caixa, conciliação Tiny/NF e repasse.
7. **Etapa 7 — Alertas** (WhatsApp/e-mail) e rastreio de concorrentes.

## Atenção
- A tela de Vendas dispara um sync automático ao abrir (período "Hoje" = 2 dias) se o último
  pedido tiver mais de 5 min. O sync manual é limitado a 1.000 pedidos.
- `src/lib/ml-calculos.ts` concentra as regras puras com testes (`tests/ml-calculos.test.ts`);
  manter toda regra nova ali.
- Log de diagnóstico `[sync-ml]` em `_gravarPedidosPagos` (busca, órfãos, status) — útil para
  conferir syncs nos logs do Vercel.
- O instrumentation.ts não agenda nada no Vercel; quem sincroniza é o cron.
