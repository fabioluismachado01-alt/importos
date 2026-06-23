/**
 * Documento PDF Executivo — ImportOS
 * Layout: Capa → Resumo Executivo → Insights → DRE → Análise por Canal → Outros
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Svg, Circle, Rect, G } from '@react-pdf/renderer'

const S = StyleSheet.create({
  // Páginas
  pageA4:     { padding: 0, fontFamily: 'Helvetica', fontSize: 9, color: '#1e293b', backgroundColor: '#ffffff' },
  // Capa
  capa:       { backgroundColor: '#0f172a', flex: 1, padding: 50, justifyContent: 'space-between' },
  capaLogo:   { fontSize: 32, fontFamily: 'Helvetica-Bold', color: '#10b981', marginBottom: 4 },
  capaSub:    { fontSize: 12, color: '#94a3b8', marginBottom: 40 },
  capaMes:    { fontSize: 48, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 8 },
  capaAno:    { fontSize: 20, color: '#64748b' },
  capaRodape: { fontSize: 9, color: '#475569' },
  // Conteúdo
  content:    { padding: 36 },
  secao:      { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 4 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#f8fafc' },
  rowBold:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1.5, borderTopColor: '#e2e8f0', marginTop: 3 },
  // KPI Cards
  kpiGrid:    { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiBox:     { flex: 1, padding: 10, borderRadius: 6, borderLeftWidth: 3 },
  kpiLabel:   { fontSize: 7, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue:   { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  kpiSub:     { fontSize: 7, color: '#94a3b8', marginTop: 2 },
  // Insights cards
  insightGrid:{ flexDirection: 'row', gap: 6, marginBottom: 12 },
  insightBox: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 6, padding: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  insightLbl: { fontSize: 7, color: '#94a3b8', marginBottom: 2 },
  insightVal: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  insightSub: { fontSize: 7, color: '#64748b', marginTop: 2 },
  // Tabela
  thRow:      { flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3, marginBottom: 1 },
  thText:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdRow:      { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' },
  tdRowAlt:   { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', backgroundColor: '#f8fafc' },
  tfRow:      { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#f1f5f9', borderTopWidth: 1.5, borderTopColor: '#cbd5e1' },
  // Ranking
  rankRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', gap: 8 },
  rankNum:    { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Rodapé
  footer:     { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#94a3b8' },
})

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function pct(v: number) { return `${v.toFixed(1)}%` }

function DRELinha({ label, value, cor, bold }: { label: string; value: string; cor?: string; bold?: boolean }) {
  const corStyle = cor === 'green' ? '#059669' : cor === 'red' ? '#dc2626' : cor === 'amber' ? '#d97706' : cor === 'gray' ? '#64748b' : '#0f172a'
  return (
    <View style={bold ? S.rowBold : S.row}>
      <Text style={{ fontSize: 8.5, color: bold ? '#0f172a' : '#475569', fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica' }}>{label}</Text>
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: corStyle }}>{value}</Text>
    </View>
  )
}

export interface CanalData {
  key?: string; label: string; cor: string; iconCor?: string
  receita: number; despesas: number; lucro: number; margem: number; participacao: number
}

// Badge "logo" do marketplace para o PDF — círculo colorido com a inicial do canal
// (não usa marcas/ícones de terceiros, apenas cor de marca + inicial, evitando questões de copyright)
function MktBadge({ label, cor, iconCor, size = 18 }: { label: string; cor: string; iconCor?: string; size?: number }) {
  const inicial = label.trim().charAt(0).toUpperCase()
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: cor, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.5, fontFamily: 'Helvetica-Bold', color: iconCor || '#ffffff' }}>
        {inicial}
      </Text>
    </View>
  )
}

export interface PDFMesProps {
  fat: Record<string, number>
  canaisData: CanalData[]
  outrosLancamentos: Array<{ descricao: string; valor: number; categoria: string }>
  mesNome: string; ano: number; dataGeracao: string
}

export function PDFDocumento({ fat, canaisData, outrosLancamentos, mesNome, ano, dataGeracao }: PDFMesProps) {
  const f = fat
  const totalFixas = (f.desp_pro_labore||0)+(f.desp_inss||0)+(f.desp_contabilidade||0)+
    (f.desp_erp||0)+(f.desp_emprestimo||0)+(f.desp_aluguel||0)+(f.desp_pagina_ml||0)+(f.desp_fixas_outras||0)
  const totalVarComDAS = (f.desp_armazenagem||0)+(f.desp_ads_ml||0)+(f.desp_ads_outros||0)+
    (f.desp_custo_produtos||0)+(f.desp_tarifas||0)+(f.desp_frete||0)+(f.desp_fatura_ml||0)+
    (f.desp_outras_taxas||0)+(f.das_valor_calc||0)
  const margemLiq = (f.receita_total||0) > 0 ? ((f.lucro_liquido||0)/(f.receita_total||0))*100 : 0
  const cmvPerc   = (f.receita_total||0) > 0 ? ((f.desp_custo_produtos||0)/(f.receita_total||0))*100 : 0

  const maiorReceita   = canaisData[0]
  const maisRentavel   = [...canaisData].sort((a,b) => b.margem - a.margem)[0]
  const maiorLucro     = [...canaisData].sort((a,b) => b.lucro - a.lucro)[0]
  const rankingMargem  = [...canaisData].sort((a,b)=>b.margem-a.margem)

  const receitas = [
    { l:'Mercado Livre', v:f.receita_ml||0 },
    { l:'Amazon',        v:f.receita_amazon||0 },
    { l:'Shopee',        v:f.receita_shopee||0 },
    { l:'Magalu',        v:f.receita_magalu||0 },
    { l:'TikTok Shop',   v:f.receita_tiktok||0 },
    { l:'Outros',        v:f.receita_outros||0 },
  ].filter(c=>c.v>0)

  const variaveis = [
    { l:'Custo c/ Produtos (CMV)',v:f.desp_custo_produtos||0 },
    { l:'Tarifas Marketplace',    v:f.desp_tarifas||0 },
    { l:'Ads ML',                 v:f.desp_ads_ml||0 },
    { l:'Ads Outras',             v:f.desp_ads_outros||0 },
    { l:'Armazenagem',            v:f.desp_armazenagem||0 },
    { l:'Frete',                  v:f.desp_frete||0 },
    { l:'Fatura ML',              v:f.desp_fatura_ml||0 },
    { l:'Outras Taxas',           v:f.desp_outras_taxas||0 },
    { l:'DAS',                    v:f.das_valor_calc||0 },
  ].filter(c=>c.v>0)

  const fixas = [
    { l:'Pró Labore',    v:f.desp_pro_labore||0 },
    { l:'INSS',          v:f.desp_inss||0 },
    { l:'Contabilidade', v:f.desp_contabilidade||0 },
    { l:'ERP',           v:f.desp_erp||0 },
    { l:'Empréstimo',    v:f.desp_emprestimo||0 },
    { l:'Aluguel',       v:f.desp_aluguel||0 },
    { l:'Página ML',     v:f.desp_pagina_ml||0 },
    { l:'Outras Fixas',  v:f.desp_fixas_outras||0 },
  ].filter(c=>c.v>0)

  const rankColors = ['#f59e0b','#94a3b8','#92400e','#e2e8f0','#e2e8f0']
  const rankTextColors = ['#ffffff','#ffffff','#ffffff','#64748b','#64748b']

  return (
    <Document title={`DRE ${mesNome} ${ano} — ImportOS`}>

      {/* ── PÁGINA 1: CAPA ── */}
      <Page size="A4" style={S.pageA4}>
        <View style={S.capa}>
          <View>
            <Text style={S.capaLogo}>ImportOS</Text>
            <Text style={S.capaSub}>Demonstrativo de Resultado Executivo</Text>
            <Text style={S.capaMes}>{mesNome}</Text>
            <Text style={S.capaAno}>{ano}</Text>
          </View>
          {/* KPIs de capa */}
          <View style={{ gap: 10 }}>
            {[
              { l:'Receita Total',  v:brl(f.receita_total||0), c:'#10b981' },
              { l:'Lucro Líquido',  v:brl(f.lucro_liquido||0), c:(f.lucro_liquido||0)>=0?'#10b981':'#ef4444' },
              { l:'Margem Líquida', v:pct(margemLiq),           c:'#f59e0b' },
              { l:'DAS',            v:brl(f.das_valor_calc||0), c:'#f59e0b' },
            ].map(k=>(
              <View key={k.l} style={{ flexDirection:'row', justifyContent:'space-between', borderBottomWidth:0.5, borderBottomColor:'#1e293b', paddingVertical:6 }}>
                <Text style={{ fontSize:11, color:'#94a3b8' }}>{k.l}</Text>
                <Text style={{ fontSize:16, fontFamily:'Helvetica-Bold', color:k.c }}>{k.v}</Text>
              </View>
            ))}
          </View>
          <Text style={S.capaRodape}>Gerado em {dataGeracao} · Confidencial</Text>
        </View>
      </Page>

      {/* ── PÁGINA 2: RESUMO EXECUTIVO + INSIGHTS ── */}
      <Page size="A4" style={S.pageA4}>
        <View style={S.content}>

          {/* Header */}
          <View style={{ marginBottom:16 }}>
            <Text style={{ fontSize:18, fontFamily:'Helvetica-Bold', color:'#0f172a' }}>Resumo Executivo</Text>
            <Text style={{ fontSize:9, color:'#94a3b8' }}>{mesNome}/{ano} · Gerado em {dataGeracao}</Text>
          </View>

          {/* KPI Cards 4 */}
          <View style={S.kpiGrid}>
            {[
              { l:'Receita Total', v:brl(f.receita_total||0), sub:`${receitas.length} canais ativos`, bc:'#10b981', bg:'#f0fdf4' },
              { l:'Lucro Bruto',   v:brl(f.lucro_bruto||0),  sub:`Antes de despesas fixas`, bc:(f.lucro_bruto||0)>=0?'#3b82f6':'#ef4444', bg:'#eff6ff' },
              { l:'Lucro Líquido', v:brl(f.lucro_liquido||0),sub:`Margem ${pct(margemLiq)}`, bc:(f.lucro_liquido||0)>=0?'#10b981':'#ef4444', bg:'#f0fdf4' },
              { l:'DAS',           v:brl(f.das_valor_calc||0),sub:`Alíq. ${pct((f.aliquota_simples||0)*100)}`, bc:'#f59e0b', bg:'#fffbeb' },
            ].map(k=>(
              <View key={k.l} style={[S.kpiBox, { borderLeftColor:k.bc, backgroundColor:k.bg }]}>
                <Text style={S.kpiLabel}>{k.l}</Text>
                <Text style={[S.kpiValue, { color:k.bc }]}>{k.v}</Text>
                <Text style={S.kpiSub}>{k.sub}</Text>
              </View>
            ))}
          </View>

          {/* Insights */}
          <Text style={S.secao}>Insights do Mês</Text>
          <View style={S.insightGrid}>
            {maiorReceita && (
              <View style={[S.insightBox, { borderColor:'#fde68a', backgroundColor:'#fffbeb' }]}>
                <Text style={[S.insightLbl, { color:'#92400e' }]}>🏆 Maior Receita</Text>
                <Text style={[S.insightVal, { color:'#92400e' }]}>{maiorReceita.label}</Text>
                <Text style={S.insightSub}>{brl(maiorReceita.receita)} · {pct(maiorReceita.participacao)}</Text>
              </View>
            )}
            {maisRentavel && (
              <View style={[S.insightBox, { borderColor:'#bbf7d0', backgroundColor:'#f0fdf4' }]}>
                <Text style={[S.insightLbl, { color:'#065f46' }]}>⭐ Mais Rentável</Text>
                <Text style={[S.insightVal, { color:'#065f46' }]}>{maisRentavel.label}</Text>
                <Text style={S.insightSub}>Margem {pct(maisRentavel.margem)}</Text>
              </View>
            )}
            {maiorLucro && (
              <View style={[S.insightBox, { borderColor:'#bfdbfe', backgroundColor:'#eff6ff' }]}>
                <Text style={[S.insightLbl, { color:'#1e40af' }]}>💰 Maior Lucro</Text>
                <Text style={[S.insightVal, { color:'#1e40af' }]}>{maiorLucro.label}</Text>
                <Text style={S.insightSub}>{brl(maiorLucro.lucro)}</Text>
              </View>
            )}
            <View style={[S.insightBox, { borderColor:'#e9d5ff', backgroundColor:'#faf5ff' }]}>
              <Text style={[S.insightLbl, { color:'#6b21a8' }]}>📊 CMV / Receita</Text>
              <Text style={[S.insightVal, { color:'#6b21a8' }]}>{pct(cmvPerc)}</Text>
              <Text style={S.insightSub}>{brl(f.desp_custo_produtos||0)}</Text>
            </View>
          </View>

          {/* Ranking por margem */}
          <Text style={S.secao}>Ranking de Canais por Margem</Text>
          {rankingMargem.map((c,i)=>(
            <View key={c.label} style={S.rankRow}>
              <View style={[S.rankNum, { backgroundColor:rankColors[i]||'#e2e8f0' }]}>
                <Text style={{ fontSize:8, fontFamily:'Helvetica-Bold', color:rankTextColors[i]||'#64748b' }}>{i+1}º</Text>
              </View>
              <MktBadge label={c.label} cor={c.cor} iconCor={c.iconCor} size={18} />
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:9, fontFamily:'Helvetica-Bold', color:'#0f172a' }}>{c.label}</Text>
                <View style={{ flexDirection:'row', gap:12, marginTop:1 }}>
                  <Text style={{ fontSize:7, color:'#64748b' }}>Receita: {brl(c.receita)}</Text>
                  <Text style={{ fontSize:7, color:'#64748b' }}>Lucro: {brl(c.lucro)}</Text>
                  <Text style={{ fontSize:7, color:'#64748b' }}>Part.: {pct(c.participacao)}</Text>
                </View>
              </View>
              <Text style={{ fontSize:14, fontFamily:'Helvetica-Bold', color:c.margem>=25?'#059669':c.margem>=15?'#d97706':'#dc2626' }}>
                {pct(c.margem)}
              </Text>
            </View>
          ))}

        </View>
        <View style={S.footer} fixed>
          <Text style={S.footerText}>ImportOS · Relatório Executivo</Text>
          <Text style={S.footerText}>{mesNome}/{ano} · Página 2</Text>
        </View>
      </Page>

      {/* ── PÁGINA 3: DRE COMPLETA ── */}
      <Page size="A4" style={S.pageA4}>
        <View style={S.content}>
          <Text style={{ fontSize:18, fontFamily:'Helvetica-Bold', color:'#0f172a', marginBottom:4 }}>Demonstrativo de Resultado</Text>
          <Text style={{ fontSize:9, color:'#94a3b8', marginBottom:12 }}>{mesNome}/{ano}</Text>

          {/* Receitas */}
          <Text style={S.secao}>Receitas por Canal</Text>
          {receitas.map(c=><DRELinha key={c.l} label={c.l} value={brl(c.v)} />)}
          <DRELinha label="TOTAL RECEITAS" value={brl(f.receita_total||0)} cor="green" bold />

          {/* Variáveis */}
          <Text style={S.secao}>Despesas Variáveis</Text>
          {variaveis.map(c=><DRELinha key={c.l} label={c.l} value={`-${brl(c.v)}`} cor="red" />)}
          <DRELinha label="TOTAL VARIÁVEIS (COM DAS)" value={`-${brl(totalVarComDAS)}`} cor="red" bold />

          {/* Fixas */}
          {fixas.length > 0 && (
            <>
              <Text style={S.secao}>Despesas Fixas</Text>
              {fixas.map(c=><DRELinha key={c.l} label={c.l} value={`-${brl(c.v)}`} cor="gray" />)}
              <DRELinha label="TOTAL FIXAS" value={`-${brl(totalFixas)}`} cor="gray" bold />
            </>
          )}

          {/* Resultado */}
          <Text style={S.secao}>Resultado Final</Text>
          <DRELinha label="Lucro Bruto" value={brl(f.lucro_bruto||0)} cor={(f.lucro_bruto||0)>=0?'green':'red'} bold />
          {(f.desp_previdencia_privada||0)>0 && (
            <DRELinha label="(−) Previdência Privada" value={`-${brl(f.desp_previdencia_privada||0)}`} cor="gray" />
          )}
          <DRELinha label="LUCRO LÍQUIDO" value={brl(f.lucro_liquido||0)} cor={(f.lucro_liquido||0)>=0?'green':'red'} bold />

          {/* Margens */}
          <Text style={S.secao}>Indicadores de Margem</Text>
          {[
            { l:'Margem Bruta (Lucro Bruto / Receita)',                    v:pct((f.receita_total||0)>0?((f.lucro_bruto||0)/(f.receita_total||0))*100:0) },
            { l:'Margem Líquida (Lucro Líquido / Receita)',                v:pct(margemLiq) },
            { l:'CMV % Receita',                                           v:pct(cmvPerc) },
            { l:'DAS % Receita',                                           v:pct((f.receita_total||0)>0?((f.das_valor_calc||0)/(f.receita_total||0))*100:0) },
          ].map(m=><DRELinha key={m.l} label={m.l} value={m.v} />)}

        </View>
        <View style={S.footer} fixed>
          <Text style={S.footerText}>ImportOS · DRE Completa</Text>
          <Text style={S.footerText}>{mesNome}/{ano} · Página 3</Text>
        </View>
      </Page>

      {/* ── PÁGINA 4: ANÁLISE POR CANAL ── */}
      {canaisData.length > 0 && (
        <Page size="A4" style={S.pageA4}>
          <View style={S.content}>
            <Text style={{ fontSize:18, fontFamily:'Helvetica-Bold', color:'#0f172a', marginBottom:4 }}>Análise por Canal</Text>
            <Text style={{ fontSize:9, color:'#94a3b8', marginBottom:12 }}>Receita, despesas, lucro e margem por marketplace — {mesNome}/{ano}</Text>

            <View style={S.thRow}>
              <Text style={[S.thText, { flex:1.8 }]}>Canal</Text>
              <Text style={[S.thText, { flex:1.3, textAlign:'right' }]}>Receita</Text>
              <Text style={[S.thText, { flex:1.3, textAlign:'right' }]}>Despesas</Text>
              <Text style={[S.thText, { flex:1.3, textAlign:'right' }]}>Lucro</Text>
              <Text style={[S.thText, { flex:0.9, textAlign:'right' }]}>Margem</Text>
              <Text style={[S.thText, { flex:0.9, textAlign:'right' }]}>Part.</Text>
            </View>

            {canaisData.map((c,i)=>(
              <View key={c.label} style={[i%2===0?S.tdRow:S.tdRowAlt, { alignItems:'center' }]}>
                <View style={{ flex:1.8, flexDirection:'row', alignItems:'center', gap:5 }}>
                  <MktBadge label={c.label} cor={c.cor} iconCor={c.iconCor} size={14} />
                  <Text style={{ fontSize:9, fontFamily:'Helvetica-Bold', color:'#334155' }}>{c.label}</Text>
                </View>
                <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:'#059669' }}>{brl(c.receita)}</Text>
                <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:'#dc2626' }}>-{brl(c.despesas)}</Text>
                <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:c.lucro>=0?'#059669':'#dc2626', fontFamily:'Helvetica-Bold' }}>{brl(c.lucro)}</Text>
                <Text style={{ flex:0.9, fontSize:8.5, textAlign:'right', color:c.margem>=25?'#059669':c.margem>=15?'#d97706':'#dc2626', fontFamily:'Helvetica-Bold' }}>{pct(c.margem)}</Text>
                <Text style={{ flex:0.9, fontSize:8.5, textAlign:'right', color:'#334155' }}>{pct(c.participacao)}</Text>
              </View>
            ))}

            <View style={S.tfRow}>
              <Text style={{ flex:1.8, fontSize:9, fontFamily:'Helvetica-Bold', color:'#0f172a' }}>TOTAL</Text>
              <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:'#059669', fontFamily:'Helvetica-Bold' }}>{brl(canaisData.reduce((s,c)=>s+c.receita,0))}</Text>
              <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:'#dc2626', fontFamily:'Helvetica-Bold' }}>-{brl(canaisData.reduce((s,c)=>s+c.despesas,0))}</Text>
              <Text style={{ flex:1.3, fontSize:8.5, textAlign:'right', color:'#059669', fontFamily:'Helvetica-Bold' }}>{brl(canaisData.reduce((s,c)=>s+c.lucro,0))}</Text>
              <Text style={{ flex:0.9, fontSize:8.5, textAlign:'right', color:'#334155' }}>—</Text>
              <Text style={{ flex:0.9, fontSize:8.5, textAlign:'right', color:'#0f172a', fontFamily:'Helvetica-Bold' }}>100%</Text>
            </View>

            {/* Outros recebimentos */}
            {outrosLancamentos.length > 0 && (
              <>
                <Text style={[S.secao, { marginTop:20 }]}>Outros Recebimentos — Auditoria</Text>
                {outrosLancamentos.map((l,i)=>(
                  <View key={i} style={i%2===0?S.tdRow:S.tdRowAlt}>
                    <Text style={{ flex:3, fontSize:8, color:'#334155' }}>{l.descricao}</Text>
                    <Text style={{ flex:1, fontSize:8, color:'#64748b', textAlign:'right' }}>{l.categoria}</Text>
                    <Text style={{ flex:1.2, fontSize:8, color:'#059669', textAlign:'right', fontFamily:'Helvetica-Bold' }}>{brl(l.valor)}</Text>
                  </View>
                ))}
                <View style={S.tfRow}>
                  <Text style={{ flex:3, fontSize:8.5, fontFamily:'Helvetica-Bold', color:'#0f172a' }}>Total Outros</Text>
                  <Text style={{ flex:1, color:'#64748b', fontSize:8 }}></Text>
                  <Text style={{ flex:1.2, fontSize:8.5, color:'#059669', textAlign:'right', fontFamily:'Helvetica-Bold' }}>
                    {brl(outrosLancamentos.reduce((s,l)=>s+l.valor,0))}
                  </Text>
                </View>
              </>
            )}

          </View>
          <View style={S.footer} fixed>
            <Text style={S.footerText}>ImportOS · Análise por Canal</Text>
            <Text style={S.footerText}>{mesNome}/{ano} · Página 4</Text>
          </View>
        </Page>
      )}

    </Document>
  )
}
