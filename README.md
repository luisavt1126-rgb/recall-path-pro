# Residência Flow

oi, meu nome é luisa. Sou estudante de medicina do quarto ano, vou ser interna logo.. logo. Faço faculdade na Estadual de roraima. Atualmente faço o cursinho med grupo focado no enamed, mas ano que vem continuarei com ele. Crie um aplicativo web responsivo e mobile-first para controle inteligente de estudos para residência médica.

O objetivo é funcionar como agenda + controle de horas + acompanhamento de assuntos + sistema de revisão espaçada + gerenciador de baralhos do Anki + análise de desempenho em questões.

1. DASHBOARD

Tela inicial mostrando:

Agenda de hoje

Estudos e revisões pendentes

Revisões atrasadas

Flashcards/baralhos recomendados

Horas estudadas hoje e na semana depois coloque isso num gráfico 

Questões realizadas e % de acertos - mensalmente tem um relatório sobre as questões mais acertadas 

Meta semanal de horas

Gráfico de horas estudadas por semana
organize em forma de calendário - faça de uma forma que eu possa acrescentar minhas aulas da faculda e minhas aulas aos sábado do med curso 

2. ASSUNTOS

Organizar:

Disciplina → Assunto → Subassunto

Cada assunto deve registrar:

primeiro estudo

último estudo

revisões realizadas

próxima revisão

domínio de 0–100%

desempenho em questões

Manter todo o histórico. Nunca apagar ou sobrescrever estudos anteriores.

3. REPETIÇÃO ESPAÇADA

Criar sistema inspirado no Anki, com objetivo padrão de 90% de retenção.

Após cada revisão, registrar:

Muito difícil 

difícil

bom

fácil

O intervalo deve se adaptar ao desempenho:

desempenho ruim → intervalo menor

desempenho bom → intervalo maior

Preparar a estrutura para futuramente utilizar um algoritmo mais avançado como FSRS.

4. FLASHCARDS

NÃO criar banco de flashcards.

Não armazenar frente, verso ou conteúdo dos cartões.

O Anki será responsável pelos flashcards.

O aplicativo deve apenas registrar os baralhos:

nome

assunto

data de criação

última revisão

próxima revisão

O app deve informar:

“Qual baralho devo fazer/revisar hoje?”

Quando eu errar questões de determinado assunto, criar uma recomendação:

🚨 Revisar/criar baralho de flashcards sobre este assunto.

Também diferenciar:

Baralho novo

Revisão de baralho

Reforço por erros

5. QUESTÕES

Registrar:

disciplina

assunto

banca

ano

questões realizadas

acertos

erros

Calcular automaticamente o percentual de acerto.

Erros recorrentes devem aumentar a prioridade de revisão e de flashcards.

6. CALENDÁRIO / AGENDA

Criar uma página Calendário que funcione como agenda.

Permitir criar eventos:

estudar

revisar

questões

flashcards

outros compromissos

Visualização:

dia

semana

mês

Cada evento deve ter data, horário, duração, categoria e status.

7. TEMPORIZADOR

Criar temporizador de estudo:

Iniciar → Pausar → Continuar → Finalizar

Ao finalizar, selecionar:

disciplina

assunto

tipo de atividade

Salvar automaticamente o tempo estudado.
que seja possivel o metodo pomodoro 

Também permitir inserir manualmente horas estudadas.

8. GRÁFICO DE HORAS

Registrar todas as sessões.

Mostrar gráfico de horas estudadas por semana, com opções:

últimas 4 semanas

últimas 12 semanas

6 meses

ano

Mostrar também:

total de horas

média semanal

meta semanal

percentual da meta atingida

9. HISTÓRICO DO ASSUNTO

Ao abrir um assunto, mostrar uma timeline:

Primeiro estudo → revisões → questões → erros → recomendações de flashcards → novas revisões

Assim será possível acompanhar a evolução daquele assunto durante todo o ano.

10. PRIORIDADE INTELIGENTE

A prioridade das atividades deve considerar:

revisões atrasadas

baixo domínio

erros recentes em questões

tempo desde a última revisão

incidência em provas

Mostrar:

🚨 Crítico
⚠️ Alta prioridade
📌 Normal
🟢 Baixa prioridade

11. BANCO DE DADOS

Usar banco de dados persistente, preferencialmente Supabase, com autenticação.

Criar estruturas para:

usuários

disciplinas

assuntos

sessões de estudo

revisões

questões

baralhos do Anki

sessões de flashcards

eventos da agenda

metas

Não armazenar o conteúdo dos flashcards.

12. DESIGN

Interface moderna, limpa e profissional, voltada para estudante de Medicina.

Mobile-first.

Usar:

cards

gráficos

calendário

timeline

barras de progresso

indicadores de prioridade

Criar modo claro e escuro.

OBJETIVO FINAL

Ao abrir o aplicativo, quero saber rapidamente:

O que estudar hoje?
O que revisar?
Qual baralho do Anki fazer/revisar?
Quais assuntos estão fracos?
Quantas horas estudei esta semana?
Como está minha evolução?

O aplicativo deve ser um sistema central de organização e acompanhamento dos estudos, enquanto o Anki continua sendo responsável pelos flashcards.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://recall-path-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/29e92d90-b8ca-4ba6-826d-0ef7ed7d79fe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
