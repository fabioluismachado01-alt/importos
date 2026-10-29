# Regras de cálculo por marketplace

Referência para o módulo Vendas. Levantado em 29/10/2026 a partir do que o Metrizap
exibe na própria interface (tooltips e detalhe de cada venda) e conferido pedido a pedido
contra o ImportOS no Mercado Livre (30 dias, 75 vendas).

## Fórmula da linha (igual nos 4 canais)

```
Lucro = Valor − Devolução − Tarifa − Outros − Frete − Imposto − Custo
```

- **Valor**: preço × quantidade (o que o comprador pagou pelo item; frete pago pelo comprador não entra).
- **Devolução**: valor reembolsado ao comprador.
- **Tarifa**: tudo que o marketplace desconta do repasse pela venda.
- **Outros**: comissão de afiliado e custo logístico próprio (Flex, agência, motoboy) informado por venda.
- **Frete**: frete pago pelo vendedor nesta venda.
- **Imposto**: alíquota sobre o Valor, cadastrada por SKU (Metrizap) — no ImportOS vem da alíquota
  efetiva do Simples do mês (`aliquota_historico`), que é mais correta.
- **Custo**: custo unitário × quantidade.
- Ads é descontado só no total do período (toggle "descontar do lucro"), não por linha.

Venda **não liquidada** (repasse pendente): tarifa e lucro podem mudar — o sync relê até liquidar.

## Mercado Livre
- Tarifa = `order_items[].sale_fee × quantity` (sale_fee é por unidade). Conferido: igual ao Metrizap.
- Frete = `shipments/{id}` → `shipping_option.list_cost − shipping_option.cost`.
  Pacote com vários pedidos no mesmo envio: o Metrizap lança o frete inteiro em um pedido e zero
  nos outros; o ImportOS rateia pelo valor de cada linha. O total do período é o mesmo.
- Afiliados: a API do ML não informa quais vendas vieram de afiliado.
- Pedidos que saem da busca de "paid" (inválidos, cancelados depois) precisam ser relidos
  individualmente (`/orders/{id}`) — senão continuam contando como venda.
- Data da venda: o Metrizap usa uma data alguns minutos posterior à `date_created`
  (provavelmente `date_closed`); o ImportOS usa `date_created`. Não muda totais, só o horário.

## Shopee
- Tarifa = taxa de comissão + taxa de serviço (escrow detail). Ex.: venda R$ 14,90 →
  comissão R$ 2,77 + serviço R$ 5,46 = R$ 8,23.
- Frete do vendedor normalmente R$ 0 (Shopee Xpress); "Pago pelo comprador" é informativo.
- Afiliados (AMS): comissão vai em Outros.
- Ads: autorização separada da conta de vendas.

## TikTok Shop
- Tarifa = "tarifa cobrada" total; a composição só aparece quando a venda é liquidada (extrato).
- Comissão de afiliado/criador vai em Outros (ex.: −R$ 1,27).
- Muitas vendas ficam "Liquidação pendente": tarifa provisória até o settlement.

## Amazon (FBA)
- Tarifa = o que a Amazon desconta do repasse (comissão).
- Frete = taxa de fulfillment FBA (ex.: R$ 5,65 por unidade).
- Status "Pagamento em análise" até a Amazon liberar.
- Atenção: SKUs `_FBA` precisam de custo cadastrado — sem custo a margem aparece ~55%.
