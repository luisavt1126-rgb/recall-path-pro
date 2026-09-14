import { Panel, Empty } from "@/components/bits";
import { useDecks, useQuestionLogs, useReviews, useSubjects } from "@/lib/data";
import { identifyPatterns } from "@/lib/study-intelligence";

export function StudyInsights() {
  const { data: logs = [] } = useQuestionLogs();
  const { data: subjects = [] } = useSubjects();
  const { data: reviews = [] } = useReviews();
  const { data: decks = [] } = useDecks();
  const insights = identifyPatterns(logs, subjects, reviews, decks);
  return (
    <Panel title="Padrões identificados">
      {insights.length === 0 ? <Empty>Registre mais questões para identificar padrões.</Empty> : (
        <div className="space-y-2">
          {insights.map((insight) => (
            <div key={insight.title} className={`border-l-4 p-3 ${insight.tone === "rose" ? "border-rose bg-rose/5" : insight.tone === "amber" ? "border-amber bg-amber/5" : "border-violet bg-violet/5"}`}>
              <p className="text-sm font-semibold">{insight.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{insight.detail}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}