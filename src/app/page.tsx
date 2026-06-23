import Link from "next/link";

const features = [
  {
    icon: "📊",
    title: "Dashboard Multi-Marketplace",
    desc: "Visão unificada de Mercado Livre, Shopee, Amazon, TikTok Shop e Magalu em uma única tela.",
  },
  {
    icon: "💰",
    title: "Lucro Real por Venda",
    desc: "Calcule automaticamente tarifas, frete, impostos e custo do produto. Veja sua margem em cada pedido.",
  },
  {
    icon: "🔄",
    title: "Sincronização Automática",
    desc: "Seus pedidos atualizam sozinhos a cada 15 minutos, sem precisar apertar F5 ou importar planilhas.",
  },
  {
    icon: "📈",
    title: "Curva ABC e Análise de Vendas",
    desc: "Identifique seus produtos mais lucrativos com gráficos de curva ABC por faturamento e por lucro.",
  },
  {
    icon: "🚚",
    title: "Gestão de Logística",
    desc: "Acompanhe custo de frete, pedidos com e sem envio, e os produtos que mais pesam no seu bolso.",
  },
  {
    icon: "📱",
    title: "Acesso Mobile (PWA)",
    desc: "Instale o ImportOS direto na tela do seu celular e acesse seus números de qualquer lugar.",
  },
  {
    icon: "🔒",
    title: "Modo Privacidade",
    desc: "Oculte valores e nomes com um clique — ideal para apresentações e reuniões com parceiros.",
  },
  {
    icon: "📋",
    title: "Importação Manual",
    desc: "Vende em canal sem API? Importe planilhas do Shopee, TikTok, Magalu e muito mais.",
  },
];

const marketplaces = ["Mercado Livre", "Shopee", "Amazon", "TikTok Shop", "Magalu"];

const faqs = [
  {
    q: "Funciona com qual marketplace?",
    a: "Mercado Livre (integração completa via API), Shopee, Amazon, TikTok Shop e Magalu via importação de planilha. Também permite lançamento manual.",
  },
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não. O ImportOS roda 100% no navegador e tem versão PWA para instalar no celular sem precisar de loja de apps.",
  },
  {
    q: "Como é feita a cobrança?",
    a: "Assinatura mensal de R$59,90 ou anual com desconto (R$497/ano). Cancele quando quiser, sem fidelidade.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Seus dados ficam armazenados em banco de dados criptografado. Nunca compartilhamos informações com terceiros.",
  },
  {
    q: "Tem período de teste?",
    a: "Sim! Entre em contato para ativar 7 dias gratuitos sem precisar de cartão de crédito.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">I</div>
            <span className="font-bold text-lg">ImportOS</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            <a href="#funcionalidades" className="hover:text-white transition-colors">Funcionalidades</a>
            <a href="#preco" className="hover:text-white transition-colors">Preço</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <Link
            href="/login"
            className="bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Entrar
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            ✦ Multi-marketplace em uma única plataforma
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            Controle total da sua<br />
            <span className="text-emerald-400">operação de importação</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Gerencie pedidos, calcule lucro real, sincronize automaticamente e tome decisões com dados — tudo em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Começar agora — R$59,90/mês
            </Link>
            <a
              href="#funcionalidades"
              className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Ver funcionalidades
            </a>
          </div>
          <p className="text-zinc-500 text-sm mt-4">7 dias grátis • Sem cartão de crédito • Cancele quando quiser</p>
        </div>

        {/* Marketplace badges */}
        <div className="max-w-3xl mx-auto mt-16 text-center">
          <p className="text-zinc-500 text-sm mb-4 uppercase tracking-widest">Integrado com</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {marketplaces.map((m) => (
              <span key={m} className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-full">
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="py-20 px-6 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Tudo que você precisa para lucrar mais</h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">Do pedido ao lucro líquido, automatizado e sem planilhas.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-emerald-500/40 transition-colors">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-20 px-6 bg-zinc-900 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Feito para importadores sérios</h2>
          <p className="text-zinc-400 text-lg mb-12 max-w-2xl mx-auto">
            Cada centavo da sua operação visível, do custo do produto ao lucro líquido após impostos e tarifas.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: "5+", label: "Marketplaces integrados" },
              { num: "100%", label: "Automático, sem F5" },
              { num: "R$0", label: "Surpresas no final do mês" },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-800 rounded-2xl p-8">
                <div className="text-4xl font-extrabold text-emerald-400 mb-2">{s.num}</div>
                <div className="text-zinc-300 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="preco" className="py-20 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simples e sem surpresas</h2>
          <p className="text-zinc-400 text-lg mb-12">Um plano, acesso completo a tudo.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Mensal */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-left">
              <div className="text-zinc-400 text-sm font-medium mb-2 uppercase tracking-wide">Mensal</div>
              <div className="text-4xl font-extrabold mb-1">R$59<span className="text-2xl font-semibold text-zinc-400">,90</span></div>
              <div className="text-zinc-500 text-sm mb-6">por mês</div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8">
                {["Todos os marketplaces", "Sync automático", "Curva ABC e DRE", "Suporte por WhatsApp", "PWA mobile"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full text-center bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 rounded-xl transition-colors">
                Começar agora
              </Link>
            </div>
            {/* Anual */}
            <div className="bg-emerald-500/5 border-2 border-emerald-500 rounded-2xl p-8 text-left relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                MELHOR VALOR
              </div>
              <div className="text-emerald-400 text-sm font-medium mb-2 uppercase tracking-wide">Anual</div>
              <div className="text-4xl font-extrabold mb-1">R$41<span className="text-2xl font-semibold text-zinc-400">/mês</span></div>
              <div className="text-zinc-500 text-sm mb-6">cobrado R$497/ano • economia de R$221</div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8">
                {["Tudo do plano mensal", "2 meses grátis", "Acesso prioritário a novidades", "Suporte VIP"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full text-center bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl transition-colors">
                Assinar anual
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-6 border-t border-zinc-800 bg-zinc-900">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Perguntas frequentes</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
                <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 px-6 border-t border-zinc-800">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para saber quanto você realmente lucra?</h2>
          <p className="text-zinc-400 text-lg mb-8">Comece hoje e tenha controle total da sua operação em minutos.</p>
          <Link
            href="/login"
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors"
          >
            Começar agora — 7 dias grátis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center text-white font-bold text-xs">I</div>
            <span>ImportOS © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-white transition-colors">Entrar</Link>
            <a href="mailto:contato@importos.com.br" className="hover:text-white transition-colors">contato@importos.com.br</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
