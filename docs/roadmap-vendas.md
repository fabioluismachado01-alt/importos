# Roadmap — módulo Vendas (Marketplaces)

Nota de continuidade. Última atualização: 29/10/2026.
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

Banco (29/10): colunas `ml_pedido.devolucao_status, claim_id, ml_tags`; tarifa de 176 pedidos
antigos com qtd > 1 corrigida (backup em `_bkp_ml_pedido_tarifa_20261029`, RLS ligado).

Conferência ML 30 dias vs Metrizap: vendas, faturamento, tarifas e frete **idênticos**.
Diferenças restantes são de regra/cadastro: imposto (Simples efetivo 7,9% vs 8% fixo) e custo
unitário de BTS-1, INV070-5, INV070, DTS-1 (os dois sistemas têm valores diferentes).

## Pendências do Fábio
- [ ] Criar `CRON_SECRET` (Production) no Vercel e fazer redeploy — sem ela o cron recebe 401.
- [ ] Tornar o repositório privado.
- [ ] Definir o custo correto de BTS-1, INV070-5, INV070, DTS-1.
- [ ] Abrir cadastro de desenvolvedor: Shopee Open Platform, TikTok Shop Partner, Amazon SP-API.

## Próximas etapas (ordem)
1. **Etapa 2 — Ads do ML via API**: gasto diário por anúncio (Product Ads), receita atribuída,
   ROAS/ACOS reais, lucro por SKU após ads. Hoje o ads é manual (`getAdsMensais`).
   Metrizap 30d: ML R$ 145,44 vs ImportOS R$ 69,10.
2. **Etapa 1 (resto)**: status de liquidação/data do repasse (API Mercado Pago `/v1/payments/{id}`
   — validar se o token ML funciona), custo de logística própria (Flex/agência), painel de SKUs
   sem custo (base em `actions/alertas-catalogo.ts`).
3. **Etapa 3 — Shopee via API** (pedidos + escrow detail + Ads). Hoje é import de CSV.
4. **Etapa 4 — Tela de Vendas multicanal**: chips por conta, rankings que filtram a tabela,
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
