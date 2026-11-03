# Residuum no seu computador (versão de testes)

Esta é uma cópia do Residuum que roda só no seu computador, com um banco de
dados próprio. Tudo o que você cadastrar, editar ou apagar aqui **não afeta**
o Residuum online nem os seus dados de verdade.

## O que você precisa (uma vez só)

1. **Node.js** – baixe a versão **LTS** em https://nodejs.org e instale
   (pode clicar em "Avançar" em tudo).
2. **Uma conta gratuita no Supabase** – https://supabase.com (dá para entrar
   com a conta do GitHub).

## Passo 1 – Criar o banco de testes

1. No Supabase, clique em **New project**. Nome sugerido: `residuum-testes`.
   Escolha uma senha qualquer para o banco e a região mais próxima
   (South America – São Paulo). Espere uns 2 minutos até o projeto ficar pronto.
2. No menu da esquerda, abra **SQL Editor**.
3. Abra o arquivo `supabase/bootstrap.sql` (desta pasta) no Bloco de Notas,
   copie tudo, cole no SQL Editor e clique em **Run**. Isso cria todas as
   tabelas do app, vazias.
4. Para criar contas de teste sem precisar confirmar e-mail: vá em
   **Authentication → Sign In / Providers → Email** e desligue
   **Confirm email**.

## Passo 2 – Baixar o código

1. Abra https://github.com/luisavt1126-rgb/recall-path-pro
2. Clique no botão verde **Code → Download ZIP**.
3. Extraia o ZIP numa pasta fácil, por exemplo `Documentos\residuum-local`.

> O ZIP é uma foto do app naquele dia. Ele não se atualiza sozinho e nada do
> que você fizer nele volta para o GitHub ou para o Lovable. Para ter uma
> versão mais nova, baixe o ZIP de novo (e copie o seu arquivo `.env` para a
> pasta nova).

## Passo 3 – Ligar a cópia ao banco de testes

1. Dê dois cliques em **`iniciar-local.bat`**. Na primeira vez ele cria o
   arquivo `.env` e abre no Bloco de Notas.
2. No Supabase, vá em **Project Settings → API Keys** (ou **Connect**) e copie:
   - o **Project URL** (algo como `https://abcd1234.supabase.co`)
   - a **Publishable key** (começa com `sb_publishable_`)
3. Cole nas duas linhas de URL e nas duas linhas de chave do `.env`, salve e
   feche.

## Passo 4 – Usar

Dê dois cliques em **`iniciar-local.bat`**. Na primeira vez ele instala as
dependências (alguns minutos). Depois abre o app em http://localhost:5173.
Se a página aparecer em branco, espere uns segundos e atualize (F5).

Crie uma conta com **e-mail e senha** (qualquer e-mail serve, já que a
confirmação está desligada). Para fechar o app, feche a janela preta.

## O que não funciona na versão local

- **Entrar com Google** – use e-mail e senha.
- **Análise de provas com IA** (tela Provas) – depende de um serviço do
  Lovable que só existe no app online. O resto da tela funciona.

## Segurança

- A cópia local se recusa a abrir se o `.env` apontar para o banco do
  Residuum online, para você não mexer nos dados de verdade sem querer.
- Nunca coloque a **secret key** (`sb_secret_...`) do Supabase no `.env`;
  o app não precisa dela.
