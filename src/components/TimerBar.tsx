interface TimerBarProps {
  value: number;
  max: number;
  label?: string;
}

export function TimerBar({ value, max, label = 'Tijd' }: TimerBarProps) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`timer ${percentage <= 25 ? 'timer--danger' : ''}`}>
      <div
        className="timer-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="timer-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="timer-value">{Math.max(0, value)}s</span>
    </div>
  );
}
