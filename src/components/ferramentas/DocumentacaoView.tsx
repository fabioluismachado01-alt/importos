'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Printer, ChevronDown, ChevronUp, Building2, Search, Save, X } from 'lucide-react'
import { getFornecedores, saveFornecedor, deleteFornecedor, getProdutoPorSku } from '@/actions/fornecedores'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type DocType    = 'PI' | 'CI' | 'PL' | 'SM'
type ImportMode = 'simplified' | 'formal'

interface Supplier {
  name: string; address: string; cityStateZip: string
  contact: string; phone: string; email: string
  originCountry: string; loadingPort: string
}

interface Importer {
  name: string; address: string; cityState: string; zip: string
  taxId: string; contact: string; phone: string; email: string
  acquisitionCountry: string; dischargePort: string
}

interface DocInfo {
  date: string; incoterms: string; invoiceNo: string; plNo: string
  payTerms: string; importMode: string; shipMark: string; freight: number
  validity: string
}

interface BankDetails {
  accNo: string; swift: string; beneficiaryName: string; country: string
  beneficiaryAddr: string; bankName: string; bankCode: string; agencyCode: string
  bankAddress: string; remark: string
}

interface DocItem {
  id: number
  ctnRange: string; code: string; productName: string; description: string
  remarks: string; material: string; size: string
  qtyCtns: number; unitPerCtn: number; unit: string
  price: number
  h: number; w: number; l: number
  netWeightUnit: number; grossWeightCtn: number
  hsCode: string; ncmCode: string
}

interface SimplifiedLogistics {
  totalNetW: number; totalGrossW: number; totalVolumes: number
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

let _nextId = 2
const DEFAULT_ITEM = (): DocItem => ({
  id: _nextId++,
  ctnRange: '1-1', code: '', productName: '', description: '',
  remarks: '', material: 'Plastic', size: '',
  qtyCtns: 1, unitPerCtn: 10, unit: 'UN',
  price: 0, h: 0, w: 0, l: 0,
  netWeightUnit: 0, grossWeightCtn: 0,
  hsCode: '', ncmCode: '',
})

const DEFAULT_SUPPLIER: Supplier = {
  name: '', address: '', cityStateZip: '',
  contact: '', phone: '', email: '',
  originCountry: 'CHINA', loadingPort: '',
}
const DEFAULT_IMPORTER: Importer = {
  name: '', address: '', cityState: '', zip: '',
  taxId: '', contact: '', phone: '', email: '',
  acquisitionCountry: 'BRAZIL', dischargePort: '',
}
const DEFAULT_DOC_INFO: DocInfo = {
  date: '', incoterms: 'DAP', invoiceNo: '', plNo: '',
  payTerms: '100% Advanced', importMode: 'COMMERCIAL PURPOSE - COURIER',
  shipMark: '', freight: 0, validity: 'Indeterminate',
}
const DEFAULT_BANK: BankDetails = {
  accNo: '', swift: '', beneficiaryName: '', country: '',
  beneficiaryAddr: '', bankName: '', bankCode: '', agencyCode: '',
  bankAddress: '', remark: '',
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function fmtUsd(v: number, decimals?: number) {
  if (decimals !== undefined) return v.toFixed(decimals)
  // auto: usa 2 casas mínimo, mas expande se o valor tiver dígitos significativos além da 2ª casa
  const s = v.toString()
  const dot = s.indexOf('.')
  const actualDecimals = dot >= 0 ? s.length - dot - 1 : 0
  return v.toFixed(Math.max(2, Math.min(actualDecimals, 6)))
}

function totalQty(item: DocItem) {
  return item.qtyCtns * item.unitPerCtn
}

function itemCbm(item: DocItem) {
  return ((item.h * item.w * item.l) / 1_000_000) * item.qtyCtns
}

// ─── Componentes de Formulário ───────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{children}</label>
}

function FI({ value, onChange, type = 'text', placeholder = '', className = '' }: {
  value: string | number; onChange: (v: string) => void
  type?: string; placeholder?: string; className?: string
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={cn('w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 bg-white', className)}
    />
  )
}

function FormSection({ title, accent = 'blue', children, collapsible = false }: {
  title: string; accent?: string; children: React.ReactNode; collapsible?: boolean
}) {
  const [open, setOpen] = useState(true)
  const accentMap: Record<string, string> = { blue: 'border-blue-500', emerald: 'border-emerald-500', slate: 'border-slate-700', orange: 'border-orange-500', purple: 'border-purple-500' }
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden border-l-4', accentMap[accent] || 'border-slate-500')}>
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        onClick={() => collapsible && setOpen(p => !p)}
      >
        <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">{title}</span>
        {collapsible && (open ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />)}
      </button>
      {(!collapsible || open) && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  )
}

function G2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

// ─── Componente Principal ─────────────────────────────────────────────────────

type FornDB = { id: string; nome_empresa: string; contato: string | null; email: string | null; endereco: string | null; pais: string }

export function DocumentacaoView({ workspaceId = 'default' }: { workspaceId?: string }) {
  const [docType,   setDocType]   = usePersistedState<DocType>(`${workspaceId}_doc_type`, 'PI')
  const [mode,      setMode]      = usePersistedState<ImportMode>(`${workspaceId}_doc_mode`, 'simplified')
  const [supplier,  setSupplier]  = usePersistedState<Supplier>(`${workspaceId}_doc_supplier`, DEFAULT_SUPPLIER)
  const [importer,  setImporter]  = usePersistedState<Importer>(`${workspaceId}_doc_importer`, DEFAULT_IMPORTER)
  const [docInfo,   setDocInfo]   = usePersistedState<DocInfo>(`${workspaceId}_doc_info`, DEFAULT_DOC_INFO)
  const [bank,      setBank]      = usePersistedState<BankDetails>(`${workspaceId}_doc_bank`, DEFAULT_BANK)
  const [items,     setItems]     = usePersistedState<DocItem[]>(`${workspaceId}_doc_items`, [{ ...DEFAULT_ITEM(), id: 1, qtyCtns: 100, unitPerCtn: 1, productName: 'SMARTWATCH ULTRA', description: 'DIGITAL SMART WATCH BRACELET', price: 12.50, hsCode: '9102.12.00', ncmCode: '9102.12.00' }])
  const [logistics, setLogistics] = usePersistedState<SimplifiedLogistics>(`${workspaceId}_doc_logistics`, { totalNetW: 0, totalGrossW: 0, totalVolumes: 0 })

  // ── Fornecedores ──────────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<FornDB[]>([])
  const [showFornModal, setShowFornModal] = useState(false)
  const [editingForn, setEditingForn] = useState<Partial<FornDB> | null>(null)
  const [fornMsg, setFornMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getFornecedores().then(setFornecedores)
  }, [])

  function carregarFornecedor(f: FornDB) {
    setSupplier(p => ({
      ...p,
      name: f.nome_empresa,
      address: f.endereco ?? '',
      contact: f.contato ?? '',
      email: f.email ?? '',
      originCountry: f.pais ?? 'CHINA',
    }))
  }

  function abrirNovoForn() {
    setEditingForn({ nome_empresa: '', contato: '', email: '', endereco: '', pais: 'CHINA' })
    setFornMsg('')
    setShowFornModal(true)
  }

  function salvarFornecedorAtual() {
    const f: Partial<FornDB> = {
      nome_empresa: supplier.name,
      contato: supplier.contact,
      email: supplier.email,
      endereco: supplier.address,
      pais: supplier.originCountry || 'CHINA',
    }
    setEditingForn(f)
    setFornMsg('')
    setShowFornModal(true)
  }

  function submitForn() {
    if (!editingForn?.nome_empresa?.trim()) { setFornMsg('Nome obrigatório'); return }
    startTransition(async () => {
      try {
        await saveFornecedor({ id: editingForn.id, nome_empresa: editingForn.nome_empresa!, contato: editingForn.contato ?? '', email: editingForn.email ?? '', endereco: editingForn.endereco ?? '', pais: editingForn.pais ?? 'CHINA' })
        const lista = await getFornecedores()
        setFornecedores(lista)
        setShowFornModal(false)
        setEditingForn(null)
      } catch (e: unknown) {
        setFornMsg(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  function excluirForn(id: string) {
    startTransition(async () => {
      await deleteFornecedor(id)
      setFornecedores(await getFornecedores())
    })
  }

  // ── SKU Lookup ────────────────────────────────────────────────────────────
  const [skuSearch, setSkuSearch] = useState<Record<number, string>>({})
  const [skuLoading, setSkuLoading] = useState<Record<number, boolean>>({})

  async function buscarSku(itemId: number, sku: string) {
    setSkuSearch(p => ({ ...p, [itemId]: sku }))
    if (sku.length < 3) return
    setSkuLoading(p => ({ ...p, [itemId]: true }))
    const prod = await getProdutoPorSku(sku)
    setSkuLoading(p => ({ ...p, [itemId]: false }))
    if (prod) {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        code: sku,
        productName: prod.nome.toUpperCase(),
        description: prod.descricao?.toUpperCase() ?? '',
        ncmCode: prod.ncm ?? '',
        hsCode: prod.ncm ?? '',
      } : i))
      setSkuSearch(p => ({ ...p, [itemId]: '' }))
    }
  }

  function setSup<K extends keyof Supplier>(k: K, v: string) { setSupplier(p => ({ ...p, [k]: v })) }
  function setImp<K extends keyof Importer>(k: K, v: string) { setImporter(p => ({ ...p, [k]: v })) }
  function setDoc<K extends keyof DocInfo>(k: K, v: string | number) { setDocInfo(p => ({ ...p, [k]: v })) }
  function setBnk<K extends keyof BankDetails>(k: K, v: string) { setBank(p => ({ ...p, [k]: v })) }
  function setLog<K extends keyof SimplifiedLogistics>(k: K, v: number) { setLogistics(p => ({ ...p, [k]: v })) }

  function setItem(id: number, field: keyof DocItem, val: string | number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: typeof val === 'string' ? val : (parseFloat(String(val)) || 0) } : i))
  }

  function switchMode(m: ImportMode) {
    setMode(m)
    setDoc('importMode', m === 'simplified' ? 'COMMERCIAL PURPOSE - COURIER' : 'COMMERCIAL PURPOSE - FORMAL IMPORT')
    if (m === 'simplified' && docType === 'PL') setDocType('PI')
  }

  // Totals
  const totals = useMemo(() => {
    let totalAmount = 0, totalQtyPcs = 0, totalNetW = 0, totalGrossW = 0, totalCtns = 0, totalCbm = 0
    items.forEach(it => {
      const qty = totalQty(it)
      totalAmount  += qty * it.price
      totalQtyPcs  += qty
      totalCtns    += it.qtyCtns
      totalCbm     += itemCbm(it)
      if (mode === 'formal') {
        totalNetW   += it.netWeightUnit * qty
        totalGrossW += it.grossWeightCtn * it.qtyCtns
      }
    })
    if (mode === 'simplified') {
      totalNetW   = logistics.totalNetW
      totalGrossW = logistics.totalGrossW
      totalCtns   = logistics.totalVolumes
    }
    return { totalAmount, totalQtyPcs, totalNetW, totalGrossW, totalCtns, totalCbm }
  }, [items, mode, logistics])

  const grandTotal = totals.totalAmount + (docInfo.freight || 0)

  return (
    <>
      {/* CSS de impressão — força A4 Paisagem */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body * { visibility: hidden; }
          .a4-doc, .a4-doc * { visibility: visible; }
          .a4-doc {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            margin: 0 !important; box-shadow: none !important;
            width: 297mm !important; min-height: 210mm !important;
            padding: 8mm !important;
          }
        }
      `}</style>

      <div className="space-y-4 pb-10">
        {/* TÍTULO + AÇÕES */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Documentação Comex</h1>
            <p className="text-sm text-slate-500 mt-0.5">Gere PI, CI e Packing List prontos para impressão em A4 paisagem</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Printer className="w-4 h-4" />
            Gerar Documento
          </button>
        </div>

        {/* SELETORES DE TIPO E MODO */}
        <div className="flex flex-wrap items-center gap-4 no-print">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1 flex-wrap">
            {(['PI', 'CI', ...(mode === 'formal' ? ['PL'] : []), 'SM'] as DocType[]).map(dt => (
              <button key={dt} onClick={() => setDocType(dt)}
                className={cn('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
                  docType === dt
                    ? dt === 'SM' ? 'bg-amber-500 text-white shadow' : 'bg-slate-900 text-white shadow'
                    : 'text-slate-500 hover:text-slate-700'
                )}>
                {dt === 'PI' ? 'Proforma Invoice' : dt === 'CI' ? 'Commercial Invoice' : dt === 'PL' ? 'Packing List' : 'Shipping Mark'}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(['simplified', 'formal'] as ImportMode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={cn('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
                  mode === m ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'
                )}>
                {m === 'simplified' ? 'Simplificada' : 'Formal'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* ── FORMULÁRIO ── */}
          <div className="col-span-12 lg:col-span-3 space-y-3 no-print max-h-[82vh] overflow-y-auto pr-1">

            {/* 01. Exportador */}
            <FormSection title="01 · Exportador (Supplier)" accent="blue" collapsible>
              {/* Atalhos de fornecedor */}
              <div className="flex gap-1.5 flex-wrap">
                {fornecedores.map(f => (
                  <button key={f.id} onClick={() => carregarFornecedor(f)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[9px] font-bold text-blue-700 hover:bg-blue-100 transition-all max-w-[120px] truncate"
                    title={f.nome_empresa}>
                    <Building2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{f.nome_empresa}</span>
                  </button>
                ))}
                <button onClick={abrirNovoForn}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-blue-300 text-[9px] font-bold text-blue-500 hover:border-blue-500 transition-all">
                  <Plus className="w-2.5 h-2.5" /> Novo
                </button>
                {supplier.name && (
                  <button onClick={salvarFornecedorAtual}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100 transition-all">
                    <Save className="w-2.5 h-2.5" /> Salvar atual
                  </button>
                )}
              </div>
              <div><FL>Exporter Name</FL><FI value={supplier.name} onChange={v => setSup('name', v)} /></div>
              <div><FL>Address</FL><FI value={supplier.address} onChange={v => setSup('address', v)} /></div>
              <G2>
                <div><FL>City-State-Zip</FL><FI value={supplier.cityStateZip} onChange={v => setSup('cityStateZip', v)} /></div>
                <div><FL>Contact</FL><FI value={supplier.contact} onChange={v => setSup('contact', v)} /></div>
                <div><FL>Phone</FL><FI value={supplier.phone} onChange={v => setSup('phone', v)} placeholder="+86..." /></div>
                <div><FL>E-mail</FL><FI value={supplier.email} onChange={v => setSup('email', v)} type="email" /></div>
                <div><FL>Origin Country</FL><FI value={supplier.originCountry} onChange={v => setSup('originCountry', v)} /></div>
                {mode === 'formal' && <div><FL>Loading Port</FL><FI value={supplier.loadingPort} onChange={v => setSup('loadingPort', v)} /></div>}
              </G2>
            </FormSection>

            {/* 02. Importador */}
            <FormSection title="02 · Importador (Seus Dados)" accent="emerald" collapsible>
              <div><FL>Importer Name</FL><FI value={importer.name} onChange={v => setImp('name', v)} /></div>
              <div><FL>Address</FL><FI value={importer.address} onChange={v => setImp('address', v)} /></div>
              <G2>
                <div><FL>City-State</FL><FI value={importer.cityState} onChange={v => setImp('cityState', v)} /></div>
                <div><FL>ZipCode</FL><FI value={importer.zip} onChange={v => setImp('zip', v)} /></div>
                <div><FL>TAX ID (CNPJ)</FL><FI value={importer.taxId} onChange={v => setImp('taxId', v)} /></div>
                <div><FL>Contact</FL><FI value={importer.contact} onChange={v => setImp('contact', v)} /></div>
                <div><FL>Phone</FL><FI value={importer.phone} onChange={v => setImp('phone', v)} placeholder="+55..." /></div>
                <div><FL>E-mail</FL><FI value={importer.email} onChange={v => setImp('email', v)} type="email" /></div>
                <div><FL>Acquisition Country</FL><FI value={importer.acquisitionCountry} onChange={v => setImp('acquisitionCountry', v)} /></div>
                {mode === 'formal' && <div><FL>Discharge Port</FL><FI value={importer.dischargePort} onChange={v => setImp('dischargePort', v)} /></div>}
              </G2>
            </FormSection>

            {/* 03. Itens */}
            <FormSection title="03 · Lista de Mercadorias" accent="slate">
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 relative text-[10px] space-y-2">
                    <button onClick={() => { if (items.length > 1) setItems(p => p.filter(i => i.id !== item.id)) }}
                      className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Item {idx + 1}</p>
                    {/* SKU Lookup */}
                    <div className="relative">
                      <FL>Buscar por SKU do catálogo</FL>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Digite o SKU e pressione Enter..."
                          value={skuSearch[item.id] ?? ''}
                          onChange={e => setSkuSearch(p => ({ ...p, [item.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') buscarSku(item.id, skuSearch[item.id] ?? '') }}
                          className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500 bg-emerald-50/40"
                        />
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        {skuLoading[item.id] && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-emerald-600 font-bold">buscando...</span>}
                      </div>
                    </div>
                    <G2>
                      {mode === 'formal' && <div><FL>CTN Range</FL><FI value={item.ctnRange} onChange={v => setItem(item.id, 'ctnRange', v)} className="bg-blue-50" /></div>}
                      <div><FL>Prod Code / SKU</FL><FI value={item.code} onChange={v => setItem(item.id, 'code', v)} /></div>
                    </G2>
                    <div><FL>Product Name *</FL><FI value={item.productName} onChange={v => setItem(item.id, 'productName', v)} className="font-bold uppercase" /></div>
                    <div><FL>Product Description</FL><FI value={item.description} onChange={v => setItem(item.id, 'description', v)} className="uppercase" /></div>
                    <G2>
                      <div><FL>HS Code (PI)</FL><FI value={item.hsCode} onChange={v => setItem(item.id, 'hsCode', v)} /></div>
                      <div><FL>NCM (CI)</FL><FI value={item.ncmCode} onChange={v => setItem(item.id, 'ncmCode', v)} /></div>
                    </G2>
                    <G2>
                      {mode === 'formal' ? (
                        <>
                          <div><FL>Qty Ctns</FL><FI value={item.qtyCtns} onChange={v => setItem(item.id, 'qtyCtns', v)} type="number" /></div>
                          <div><FL>Unit/CTN</FL><FI value={item.unitPerCtn} onChange={v => setItem(item.id, 'unitPerCtn', v)} type="number" /></div>
                        </>
                      ) : (
                        <div className="col-span-2">
                          <FL>Total Quantity</FL>
                          <FI value={totalQty(item)} type="number"
                            onChange={v => { setItem(item.id, 'qtyCtns', v); setItem(item.id, 'unitPerCtn', 1) }}
                            className="font-bold" />
                        </div>
                      )}
                      <div><FL>Unit Type</FL><FI value={item.unit} onChange={v => setItem(item.id, 'unit', v)} /></div>
                    </G2>
                    {docType !== 'PL' && <div><FL>Unit Price (USD)</FL><FI value={item.price} onChange={v => setItem(item.id, 'price', v)} type="number" className="font-bold" /></div>}
                    {mode === 'formal' && (
                      <>
                        <div className="grid grid-cols-3 gap-1 border-t border-slate-200 pt-2">
                          <div><FL>H (cm)</FL><FI value={item.h} onChange={v => setItem(item.id, 'h', v)} type="number" /></div>
                          <div><FL>W (cm)</FL><FI value={item.w} onChange={v => setItem(item.id, 'w', v)} type="number" /></div>
                          <div><FL>L (cm)</FL><FI value={item.l} onChange={v => setItem(item.id, 'l', v)} type="number" /></div>
                        </div>
                        <G2>
                          <div><FL>Net W/unit (kg)</FL><FI value={item.netWeightUnit} onChange={v => setItem(item.id, 'netWeightUnit', v)} type="number" /></div>
                          <div><FL>Gross W/CTN (kg)</FL><FI value={item.grossWeightCtn} onChange={v => setItem(item.id, 'grossWeightCtn', v)} type="number" /></div>
                        </G2>
                      </>
                    )}
                  </div>
                ))}
                <button onClick={() => setItems(p => [...p, DEFAULT_ITEM()])}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-slate-300 text-[9px] font-black text-slate-400 hover:border-emerald-500 hover:text-emerald-600 transition-all">
                  <Plus className="w-3 h-3" /> ADD ITEM
                </button>
              </div>
            </FormSection>

            {/* 04. Identificação do Doc */}
            <FormSection title="04 · Identificação do Documento" accent="slate" collapsible>
              <G2>
                <div><FL>Date</FL><FI value={docInfo.date} onChange={v => setDoc('date', v)} type="date" /></div>
                <div>
                  <FL>Incoterms</FL>
                  <select value={docInfo.incoterms} onChange={e => setDoc('incoterms', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] bg-white focus:outline-none focus:border-emerald-500">
                    <option>DAP</option><option>EXW</option><option>FOB</option>
                  </select>
                </div>
                <div><FL>Invoice Nº</FL><FI value={docInfo.invoiceNo} onChange={v => setDoc('invoiceNo', v)} /></div>
                {mode === 'formal' && <div><FL>PL Number</FL><FI value={docInfo.plNo} onChange={v => setDoc('plNo', v)} /></div>}
              </G2>
              <div><FL>Payment Terms</FL><FI value={docInfo.payTerms} onChange={v => setDoc('payTerms', v)} /></div>
              <G2>
                <div><FL>Validity</FL><FI value={docInfo.validity} onChange={v => setDoc('validity', v)} placeholder="Indeterminate" /></div>
                <div><FL>Freight (USD)</FL><FI value={docInfo.freight} onChange={v => setDoc('freight', parseFloat(v) || 0)} type="number" /></div>
              </G2>
            </FormSection>

            {/* 05. Logística (Simplificada) */}
            {mode === 'simplified' && (
              <FormSection title="05 · Resumo Logístico" accent="purple" collapsible>
                <div><FL>Total Net Weight (kg)</FL><FI value={logistics.totalNetW} onChange={v => setLog('totalNetW', parseFloat(v) || 0)} type="number" /></div>
                <div><FL>Total Gross Weight (kg)</FL><FI value={logistics.totalGrossW} onChange={v => setLog('totalGrossW', parseFloat(v) || 0)} type="number" /></div>
                <div><FL>Number of Volumes (CTN)</FL><FI value={logistics.totalVolumes} onChange={v => setLog('totalVolumes', parseFloat(v) || 0)} type="number" /></div>
              </FormSection>
            )}

            {/* 06. Bank Details (PI) */}
            {docType === 'PI' && (
              <FormSection title="06 · Dados Bancários (PI)" accent="orange" collapsible>
                <div><FL>Beneficiary Acc Number</FL><FI value={bank.accNo} onChange={v => setBnk('accNo', v)} /></div>
                <div><FL>Swift Code</FL><FI value={bank.swift} onChange={v => setBnk('swift', v)} /></div>
                <div><FL>Beneficiary Name</FL><FI value={bank.beneficiaryName} onChange={v => setBnk('beneficiaryName', v)} /></div>
                <div><FL>Beneficiary Country</FL><FI value={bank.country} onChange={v => setBnk('country', v)} /></div>
                <div><FL>Beneficiary Address</FL><FI value={bank.beneficiaryAddr} onChange={v => setBnk('beneficiaryAddr', v)} /></div>
                <div><FL>Beneficiary Bank Name</FL><FI value={bank.bankName} onChange={v => setBnk('bankName', v)} /></div>
                <G2>
                  <div><FL>Bank Code</FL><FI value={bank.bankCode} onChange={v => setBnk('bankCode', v)} /></div>
                  <div><FL>Agency Code</FL><FI value={bank.agencyCode} onChange={v => setBnk('agencyCode', v)} /></div>
                </G2>
                <div><FL>Bank Address</FL><FI value={bank.bankAddress} onChange={v => setBnk('bankAddress', v)} /></div>
                <div><FL>Remark / Payment Note</FL><FI value={bank.remark} onChange={v => setBnk('remark', v)} /></div>
              </FormSection>
            )}
          </div>

          {/* ── PREVIEW A4 ── */}
          <div className="col-span-12 lg:col-span-9 overflow-x-auto">
            <div className="doc-print-root">
              {docType === 'SM' ? (
                <ShippingMarkDoc
                  importer={importer} items={items} docInfo={docInfo}
                  supplier={supplier} mode={mode} logistics={logistics}
                />
              ) : (
                <A4Doc
                  docType={docType} mode={mode}
                  supplier={supplier} importer={importer}
                  docInfo={docInfo} bank={bank} items={items}
                  totals={totals} grandTotal={grandTotal}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Fornecedor ── */}
      {showFornModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-800 text-sm">
                {editingForn?.id ? 'Editar Fornecedor' : 'Salvar Fornecedor'}
              </h2>
              <button onClick={() => setShowFornModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            {/* Lista de salvos */}
            {fornecedores.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fornecedores Salvos ({fornecedores.length}/5)</p>
                {fornecedores.map(f => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                    <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{f.nome_empresa}</p>
                      <p className="text-[9px] text-slate-400 truncate">{f.pais} {f.contato ? `· ${f.contato}` : ''}</p>
                    </div>
                    <button onClick={() => { setEditingForn(f); setFornMsg('') }}
                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800 shrink-0">Editar</button>
                    <button onClick={() => excluirForn(f.id)}
                      className="text-[9px] font-bold text-red-500 hover:text-red-700 shrink-0">Excluir</button>
                  </div>
                ))}
              </div>
            )}

            {/* Form novo/edição */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                {editingForn?.id ? 'Editando' : 'Novo Fornecedor'}
              </p>
              <div>
                <FL>Nome da Empresa *</FL>
                <input value={editingForn?.nome_empresa ?? ''} onChange={e => setEditingForn(p => ({ ...p!, nome_empresa: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500" />
              </div>
              <G2>
                <div>
                  <FL>Contato</FL>
                  <input value={editingForn?.contato ?? ''} onChange={e => setEditingForn(p => ({ ...p!, contato: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <FL>País</FL>
                  <input value={editingForn?.pais ?? 'CHINA'} onChange={e => setEditingForn(p => ({ ...p!, pais: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500" />
                </div>
              </G2>
              <div>
                <FL>Endereço</FL>
                <input value={editingForn?.endereco ?? ''} onChange={e => setEditingForn(p => ({ ...p!, endereco: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <FL>E-mail</FL>
                <input type="email" value={editingForn?.email ?? ''} onChange={e => setEditingForn(p => ({ ...p!, email: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-500" />
              </div>
              {fornMsg && <p className="text-[10px] text-red-600 font-bold">{fornMsg}</p>}
              <button onClick={submitForn} disabled={isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all">
                {isPending ? 'Salvando...' : 'Salvar Fornecedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Preview A4 Paisagem ──────────────────────────────────────────────────────

interface A4Props {
  docType: DocType; mode: ImportMode
  supplier: Supplier; importer: Importer
  docInfo: DocInfo; bank: BankDetails; items: DocItem[]
  totals: { totalAmount: number; totalQtyPcs: number; totalNetW: number; totalGrossW: number; totalCtns: number; totalCbm: number }
  grandTotal: number
}

function A4Doc({ docType, mode, supplier, importer, docInfo, bank, items, totals, grandTotal }: A4Props) {
  const title = docType === 'PL' ? 'PACKING LIST' : docType === 'PI' ? 'PROFORMA INVOICE' : 'COMMERCIAL INVOICE'
  if (docType === 'SM') return null

  return (
    <div
      className="a4-doc bg-white shadow-2xl"
      style={{ width: '297mm', minHeight: '210mm', padding: '10mm', color: '#000', fontFamily: 'Inter, sans-serif', fontSize: '8px' }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #000', paddingBottom: '6px', marginBottom: '8px' }}>
        <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 800 }}>
          {supplier.name && <div style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>{supplier.name}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em' }}>{title}</div>
        </div>
      </div>

      {/* SUPPLIER / IMPORTER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '6px' }}>
        <div>
          <div style={{ fontSize: '7px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Exporter (Supplier):</div>
          <div style={{ fontWeight: 900, fontSize: '9px', textTransform: 'uppercase' }}>{supplier.name || 'SUPPLIER NAME'}</div>
          <div style={{ fontSize: '8px', textTransform: 'uppercase' }}>{supplier.address}</div>
          <div style={{ fontSize: '8px' }}><b>City-State-Zip:</b> {supplier.cityStateZip || '-'}</div>
          <div style={{ fontSize: '8px' }}><b>Contact:</b> {supplier.contact || '-'} | <b>Phone:</b> {supplier.phone || '-'}{docType !== 'PL' ? ` | Email: ${supplier.email || '-'}` : ''}</div>
          <div style={{ fontSize: '8px' }}><b>Origin:</b> {supplier.originCountry || '-'}{mode === 'formal' ? ` | Loading Port: ${supplier.loadingPort || '-'}` : ''}</div>
        </div>
        <div>
          <div style={{ fontSize: '7px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Importer (Client):</div>
          <div style={{ fontWeight: 900, fontSize: '9px', textTransform: 'uppercase' }}>{importer.name || 'IMPORTER NAME'}</div>
          <div style={{ fontSize: '8px', textTransform: 'uppercase' }}>{importer.address}</div>
          <div style={{ fontSize: '8px' }}><b>City-State:</b> {importer.cityState || '-'} | <b>Zip:</b> {importer.zip || '-'}</div>
          <div style={{ fontSize: '8px' }}><b>TAX ID (CNPJ):</b> {importer.taxId || '-'}</div>
          <div style={{ fontSize: '8px' }}><b>Contact:</b> {importer.contact || '-'} | <b>Phone:</b> {importer.phone || '-'}{docType !== 'PL' ? ` | Email: ${importer.email || '-'}` : ''}</div>
          <div style={{ fontSize: '8px' }}><b>Acquisition:</b> {importer.acquisitionCountry || '-'}{mode === 'formal' ? ` | Discharge: ${importer.dischargePort || '-'}` : ''}</div>
        </div>
      </div>

      {/* DOC INFO BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 6px', marginBottom: '6px', fontSize: '8px' }}>
        <div><b>DATE:</b> {docInfo.date || '-'}</div>
        <div><b>INCOTERMS:</b> {docInfo.incoterms || '-'}</div>
        <div><b>INVOICE Nº:</b> {docInfo.invoiceNo || '-'}</div>
        {mode === 'formal' && <div><b>PL Nº:</b> {docInfo.plNo || '-'}</div>}
        <div><b>PAYMENT:</b> {docInfo.payTerms || '-'}</div>
        <div><b>MODE:</b> {docInfo.importMode || '-'}</div>
        <div><b>CURRENCY:</b> USD</div>
      </div>

      {/* TABLE */}
      {docType === 'PL' ? <PLTable items={items} totals={totals} /> : <InvoiceTable items={items} docType={docType} totals={totals} grandTotal={grandTotal} freight={docInfo.freight} />}

      {/* WEIGHTS FOOTER (PI / CI) */}
      {docType !== 'PL' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '6px', fontSize: '8px' }}>
          {[
            { label: 'Total Net Weight', value: `${totals.totalNetW} KG` },
            { label: 'Total Gross Weight', value: `${totals.totalGrossW} KG` },
            { label: 'Number of Volumes (CTN)', value: String(totals.totalCtns) },
          ].map(cell => (
            <div key={cell.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 6px', textTransform: 'uppercase' }}>
              <b>{cell.label}:</b> {cell.value}
            </div>
          ))}
        </div>
      )}

      {/* BANK DETAILS (PI only) */}
      {docType === 'PI' && (bank.accNo || bank.swift || bank.bankName) && (
        <div style={{ marginTop: '8px', borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8px' }}>
          <div style={{ fontWeight: 900, textTransform: 'uppercase', marginBottom: '3px', fontStyle: 'italic' }}>Beneficiary's Banking Information (T/T Payment):</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
            <div><b>Account Number:</b> {bank.accNo || '-'}</div>
            <div><b>Swift Code:</b> {bank.swift || '-'}</div>
            <div><b>Beneficiary Name:</b> {bank.beneficiaryName || '-'}</div>
            <div><b>Country/Region:</b> {bank.country || '-'}</div>
            <div style={{ gridColumn: 'span 2' }}><b>Beneficiary Address:</b> {bank.beneficiaryAddr || '-'}</div>
            <div><b>Beneficiary Bank:</b> {bank.bankName || '-'}</div>
            <div><b>Bank/Agency Code:</b> {bank.bankCode || '-'} / {bank.agencyCode || '-'}</div>
            <div style={{ gridColumn: 'span 2' }}><b>Bank Address:</b> {bank.bankAddress || '-'}</div>
            {bank.remark && <div style={{ gridColumn: 'span 2' }}><b>Remark:</b> {bank.remark}</div>}
          </div>
        </div>
      )}

      {/* SIGNATURE */}
      <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{ textAlign: 'center', borderTop: '2px solid #000', width: '220px', paddingTop: '4px' }}>
          <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase' }}>Exporter Signature &amp; Stamp</div>
        </div>
      </div>
    </div>
  )
}

// ─── Tabela Invoice (PI / CI) ─────────────────────────────────────────────────

function InvoiceTable({ items, docType, totals, grandTotal, freight }: {
  items: DocItem[]; docType: DocType
  totals: A4Props['totals']; grandTotal: number; freight: number
}) {
  const codeLabel = docType === 'PI' ? 'HS CODE' : 'NCM'
  const th: React.CSSProperties = { border: '1px solid #000', padding: '3px 4px', fontSize: '7px', background: '#f8fafc', textAlign: 'center', fontWeight: 900, textTransform: 'uppercase' }
  const td: React.CSSProperties = { border: '1px solid #000', padding: '3px 4px', fontSize: '8px', verticalAlign: 'middle' }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...th, width: '24px' }}>ITEM</th>
          <th style={{ ...th, width: '72px' }}>PROD CODE</th>
          <th style={{ ...th, width: '120px' }}>PRODUCT NAME</th>
          <th style={th}>PRODUCT DESCRIPTION</th>
          <th style={{ ...th, width: '72px' }}>{codeLabel}</th>
          <th style={{ ...th, width: '72px' }}>QUANTITY</th>
          <th style={{ ...th, width: '80px' }}>UNIT PRICE (USD)</th>
          <th style={{ ...th, width: '88px' }}>TOTAL AMOUNT (USD)</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, idx) => {
          const qty = totalQty(it)
          const amount = qty * it.price
          const code = docType === 'PI' ? it.hsCode : it.ncmCode
          return (
            <tr key={it.id}>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace' }}>{idx + 1}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: '7.5px' }}>{it.code || '-'}</td>
              <td style={{ ...td, fontWeight: 900, textTransform: 'uppercase', fontSize: '7.5px' }}>{it.productName || '-'}</td>
              <td style={td}>
                <div style={{ textTransform: 'uppercase', fontSize: '7.5px' }}>{it.description || '-'}</div>
                {it.remarks && <div style={{ fontSize: '7px', opacity: 0.6, fontStyle: 'italic' }}>{it.remarks}</div>}
              </td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>{code || '-'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{qty} {it.unit}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtUsd(it.price)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900 }}>{fmtUsd(amount)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={6} style={{ border: 'none' }} />
          <td style={{ ...td, textAlign: 'right', background: '#f8fafc', fontSize: '7px', fontWeight: 900, textTransform: 'uppercase' }}>SUBTOTAL:</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmtUsd(totals.totalAmount)}</td>
        </tr>
        <tr>
          <td colSpan={6} style={{ border: 'none' }} />
          <td style={{ ...td, textAlign: 'right', background: '#f8fafc', fontSize: '7px', fontWeight: 900, textTransform: 'uppercase' }}>FREIGHT:</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtUsd(freight)}</td>
        </tr>
        <tr>
          <td colSpan={6} style={{ border: 'none' }} />
          <td style={{ ...td, textAlign: 'right', background: '#1e293b', color: '#fff', fontWeight: 900, textTransform: 'uppercase', fontSize: '8px' }}>TOTAL VALUE:</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '10px', background: '#1e293b', color: '#10b981' }}>US$ {fmtUsd(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

// ─── Shipping Mark ───────────────────────────────────────────────────────────

function ShippingMarkDoc({ importer, items, docInfo, supplier, mode, logistics }: {
  importer: Importer; items: DocItem[]; docInfo: DocInfo; supplier: Supplier
  mode: ImportMode; logistics: SimplifiedLogistics
}) {
  // Fonte de verdade do nº de caixas depende do modo
  // Formal: item.qtyCtns por item | Simplificada: logistics.totalVolumes dividido entre itens
  const labels: { item: DocItem; cartonNo: number; totalCtns: number }[] = []

  if (mode === 'formal') {
    const totalCtns = items.reduce((s, i) => s + i.qtyCtns, 0)
    let counter = 0
    for (const item of items) {
      for (let c = 0; c < item.qtyCtns; c++) {
        counter++
        labels.push({ item, cartonNo: counter, totalCtns })
      }
    }
  } else {
    // Simplificada: totalVolumes é a fonte de verdade
    const totalCtns = Math.max(logistics.totalVolumes || 1, 1)
    const totalItemQty = items.reduce((s, i) => s + totalQty(i), 0)
    let counter = 0
    for (const item of items) {
      const share = totalItemQty > 0 ? totalQty(item) / totalItemQty : 1 / items.length
      const ctnsForItem = items.length === 1 ? totalCtns : Math.max(1, Math.round(totalCtns * share))
      for (let c = 0; c < ctnsForItem; c++) {
        counter++
        labels.push({ item, cartonNo: counter, totalCtns })
      }
    }
  }

  // Pesos por caixa: formal usa item, simplificada usa média de logistics
  const netPerCtnMap  = (item: DocItem) => mode === 'formal'
    ? item.netWeightUnit > 0 ? (item.netWeightUnit * item.unitPerCtn).toFixed(1) : '—'
    : logistics.totalNetW > 0 ? (logistics.totalNetW / Math.max(logistics.totalVolumes, 1)).toFixed(1) : '—'

  const grossPerCtnMap = (item: DocItem) => mode === 'formal'
    ? item.grossWeightCtn > 0 ? item.grossWeightCtn.toFixed(1) : '—'
    : logistics.totalGrossW > 0 ? (logistics.totalGrossW / Math.max(logistics.totalVolumes, 1)).toFixed(1) : '—'

  const card: React.CSSProperties = {
    border: '2px solid #000',
    padding: '10px 14px',
    pageBreakInside: 'avoid',
    breakInside: 'avoid',
    fontSize: '9px',
    lineHeight: 1.6,
    fontFamily: 'Inter, Arial, sans-serif',
    color: '#000',
    background: '#fff',
  }

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', gap: '4px' }}>
      <span style={{ fontWeight: 900, minWidth: '130px', flexShrink: 0 }}>{label}:</span>
      <span>{value || '-'}</span>
    </div>
  )

  return (
    <div style={{ padding: '8mm', background: '#fff' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
      }}>
        {labels.map(({ item, cartonNo, totalCtns }) => {
          const netPerCtn   = netPerCtnMap(item)
          const grossPerCtn = grossPerCtnMap(item)
          const pad = (n: number) => String(n).padStart(2, '0')
          return (
            <div key={`${item.id}-${cartonNo}`} style={card}>
              <div style={{ fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', borderBottom: '1.5px solid #000', paddingBottom: '4px', marginBottom: '6px', letterSpacing: '-0.01em' }}>
                SHIPPING MARK
              </div>
              {row('Importer', importer.name || 'IMPORTER NAME')}
              {row('CNPJ', importer.taxId || '-')}
              {row('Product', item.productName || '-')}
              {row('Quantity per CTN', `${item.unitPerCtn.toLocaleString('pt-BR')} ${item.unit || 'UN'}`)}
              {row('Net Weight', `${netPerCtn} kg`)}
              {row('Gross Weight', `${grossPerCtn} kg`)}
              {row('Invoice Nº', docInfo.invoiceNo || '-')}
              {row('Carton Number', `${pad(cartonNo)} of ${pad(totalCtns)}`)}
              {row('Validity', docInfo.validity || 'Indeterminate')}
              {row('Composition', item.material || '-')}
              {row('Origin', `Made in ${supplier.originCountry || 'China'}`)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tabela Packing List ──────────────────────────────────────────────────────

function PLTable({ items, totals }: { items: DocItem[]; totals: A4Props['totals'] }) {
  const th: React.CSSProperties = { border: '1px solid #000', padding: '2px 3px', fontSize: '6.5px', background: '#f8fafc', textAlign: 'center', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1 }
  const td: React.CSSProperties = { border: '1px solid #000', padding: '3px 3px', fontSize: '7.5px', verticalAlign: 'middle', lineHeight: 1.1 }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th rowSpan={2} style={th}>CTN<br />NUMBER</th>
          <th rowSpan={2} style={th}>CODE</th>
          <th rowSpan={2} style={{ ...th, minWidth: '120px' }}>GOODS DESCRIPTION</th>
          <th rowSpan={2} style={th}>REMARKS</th>
          <th rowSpan={2} style={th}>MATERIAL</th>
          <th rowSpan={2} style={th}>SIZE</th>
          <th rowSpan={2} style={th}>QTY<br />CTNS</th>
          <th rowSpan={2} style={th}>UNIT/<br />CTN</th>
          <th rowSpan={2} style={th}>TOTAL<br />QTY</th>
          <th rowSpan={2} style={th}>UNIT</th>
          <th rowSpan={2} style={th}>DIM CM<br />(H×W×L)</th>
          <th rowSpan={2} style={th}>CBM</th>
          <th colSpan={2} style={{ ...th, background: '#eff6ff' }}>NET WEIGHT (KG)</th>
          <th colSpan={2} style={{ ...th, background: '#f1f5f9' }}>GROSS WEIGHT (KG)</th>
        </tr>
        <tr>
          <th style={{ ...th, background: '#eff6ff' }}>UNIT</th>
          <th style={{ ...th, background: '#eff6ff' }}>TOTAL</th>
          <th style={{ ...th, background: '#f1f5f9' }}>EACH</th>
          <th style={{ ...th, background: '#f1f5f9' }}>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => {
          const qty     = totalQty(it)
          const cbm     = itemCbm(it)
          const netTot  = it.netWeightUnit * qty
          const grossTot = it.grossWeightCtn * it.qtyCtns
          return (
            <tr key={it.id}>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700, background: '#f8fafc' }}>{it.ctnRange || '-'}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: '7px' }}>{it.code || '-'}</td>
              <td style={{ ...td, fontWeight: 700, textTransform: 'uppercase', fontSize: '7px' }}>
                {it.productName}{it.productName && it.description ? ' - ' : ''}{it.description || (!it.productName ? '-' : '')}
              </td>
              <td style={{ ...td, textAlign: 'center', fontSize: '7px' }}>{it.remarks || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{it.material || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{it.size || '-'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{it.qtyCtns}</td>
              <td style={{ ...td, textAlign: 'center' }}>{it.unitPerCtn}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 900 }}>{qty}</td>
              <td style={{ ...td, textAlign: 'center', textTransform: 'uppercase' }}>{it.unit}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: '7px' }}>{it.h}×{it.w}×{it.l}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace' }}>{cbm.toFixed(3)}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', background: '#eff6ff50' }}>{it.netWeightUnit.toFixed(3)}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>{netTot.toFixed(2)}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace' }}>{it.grossWeightCtn.toFixed(2)}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>{grossTot.toFixed(2)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 900, fontSize: '7px' }}>
          <td colSpan={8} style={{ ...td, textAlign: 'right', textTransform: 'uppercase', color: '#94a3b8', border: '1px solid #334155' }}>GRAND TOTALS:</td>
          <td style={{ ...td, textAlign: 'center', background: '#1e40af', color: '#bfdbfe', border: '1px solid #334155', fontFamily: 'monospace' }}>{totals.totalQtyPcs}</td>
          <td colSpan={2} style={{ border: '1px solid #334155' }} />
          <td style={{ ...td, textAlign: 'center', background: '#065f46', color: '#a7f3d0', border: '1px solid #334155', fontFamily: 'monospace' }}>{totals.totalCbm.toFixed(3)}</td>
          <td style={{ border: '1px solid #334155' }} />
          <td style={{ ...td, textAlign: 'center', color: '#bfdbfe', border: '1px solid #334155', fontFamily: 'monospace' }}>{totals.totalNetW.toFixed ? totals.totalNetW.toFixed(2) : totals.totalNetW}</td>
          <td style={{ border: '1px solid #334155' }} />
          <td style={{ ...td, textAlign: 'center', color: '#bfdbfe', border: '1px solid #334155', fontFamily: 'monospace' }}>{totals.totalGrossW.toFixed ? totals.totalGrossW.toFixed(2) : totals.totalGrossW}</td>
        </tr>
      </tfoot>
    </table>
  )
}
