import { difficultyLabel } from '../game/engine';
import type { Question } from '../game/types';

export function QuestionCard({
  question,
  compact = false,
  correct = false,
  number,
}: {
  question: Question;
  compact?: boolean;
  correct?: boolean;
  number?: number;
}) {
  return (
    <article className={`qcard ${compact ? 'qcard--compact' : ''} ${correct ? 'qcard--correct' : ''}`}>
      <header className="qcard-head">
        {number !== undefined && <span className="qcard-num">{number}</span>}
        <span className="qcard-cat">{question.category}</span>
        <span className="qcard-diff" title={difficultyLabel(question.difficulty)}>
          <span aria-hidden>{'●'.repeat(question.difficulty)}{'○'.repeat(3 - question.difficulty)}</span>
        </span>
      </header>
      <p className="qcard-text">{question.question}</p>
    </article>
  );
}
