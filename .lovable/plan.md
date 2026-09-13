# Evolução do acompanhamento de estudos

## Objetivo
Entregar as cinco frentes sem exigir configuração adicional para o fluxo principal. A sincronização com Anki será centrada em CSV, com AnkiConnect como opção experimental no desktop.

## Implementação

1. **Sincronização com Anki**
   - Adicionar em Baralhos uma área de importação CSV com modelo esperado, prévia e atualização em lote por nome do baralho.
   - Importar nome, cartões corretos/revisados, última revisão, próxima revisão, intervalo e cartões pendentes quando presentes.
   - Criar automaticamente baralhos ainda inexistentes e registrar sessões quando o CSV trouxer desempenho.
   - Oferecer sincronização opcional via AnkiConnect em `localhost:8765`, com mensagem clara sobre o Anki aberto e a permissão de acesso local necessária.

2. **Notificações de atrasos**
   - Transformar o app em PWA instalável com manifest e service worker.
   - Adicionar ativação de notificações nas Configurações.
   - Emitir uma notificação diária do sistema, ao primeiro uso do app no dia, resumindo revisões atrasadas e previstas para hoje.
   - Deixar explícita a limitação: sem um provedor externo de push, navegadores não garantem disparo se o app permanecer totalmente fechado; a implementação entregue funcionará ao abrir/retomar a PWA. A estrutura ficará pronta para evolução futura para push remoto.

3. **Calendário acionável**
   - Unificar compromissos, assuntos, baralhos e recomendações de questões numa lista diária.
   - Levar tarefas vencidas para o dia atual e destacar baralhos atrasados.
   - Adicionar checkbox em cada item. Compromissos alternam o status; revisões usam “Bom” como conclusão rápida; recomendações de questões têm conclusão persistente própria.
   - Manter as avaliações detalhadas de quatro níveis disponíveis para revisões.

4. **Padrões de erro**
   - Criar análise determinística baseada nos dados existentes: bancas frágeis, temas com erros recorrentes, assuntos enfraquecidos após longo intervalo e erros que reaparecem depois de revisão.
   - Mostrar no dashboard um painel “Padrões identificados” com até três alertas específicos e acionáveis.

5. **Streaks leves**
   - Calcular a sequência de dias com qualquer estudo, questão, revisão ou flashcard.
   - Calcular separadamente dias consecutivos encerrados sem revisão atrasada.
   - Exibir ambos de forma compacta no dashboard, mantendo o heatmap atual.

## Dados e validação
- Adicionar somente os campos/tabela necessários para metadados do Anki e conclusão de tarefas virtuais, com acesso restrito ao próprio usuário.
- Atualizar os tipos do app.
- Verificar tipos e compilação, e testar visualmente Baralhos, Calendário, Configurações e Dashboard em desktop e celular.
