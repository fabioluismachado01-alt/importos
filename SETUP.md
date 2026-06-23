# ImportOS — Guia de Setup

## Pré-requisitos
- Node.js 20+
- Conta no Supabase (supabase.com)

## 1. Criar projeto no Supabase

1. Acesse https://supabase.com e crie um projeto
2. Anote as credenciais em **Settings → API**:
   - `Project URL`
   - `anon public key`
   - `service_role key`
3. Acesse **Settings → Database → Connection string → URI** e anote as duas:
   - Connection pooling (porta 6543) → `DATABASE_URL`
   - Direct connection (porta 5432) → `DIRECT_URL`

## 2. Configurar variáveis de ambiente

Edite o arquivo `.env.local` (já existe na raiz do projeto):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:SENHA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Também edite o `.env` (usado pelo Prisma CLI):

```env
DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:SENHA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

## 3. Executar migrations e seed

```bash
# Gerar o client Prisma
npm run db:generate

# Criar as tabelas no banco
npm run db:push

# Popular dados iniciais (canais de marketplace)
npm run db:seed
```

## 4. Criar usuário inicial no Supabase

No Supabase: **Authentication → Users → Add user**
- E-mail: seu email
- Senha: sua senha

> O workspace e a empresa são criados no primeiro login via onboarding.

## 5. Rodar o projeto

```bash
npm run dev
```

Acesse: http://localhost:3001

---

## Scripts disponíveis

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:push` | Sincroniza schema com o banco |
| `npm run db:migrate` | Cria migration versionada |
| `npm run db:seed` | Popula dados iniciais |
| `npm run db:studio` | Abre Prisma Studio (visualizador do banco) |

## Deploy na Vercel

1. Suba o projeto para GitHub
2. Importe no Vercel
3. Configure as variáveis de ambiente no painel Vercel
4. Deploy automático a cada push na branch main
