import { Chip } from "./Chip";

interface ChoiceKeysProps<T extends string> {
  label: string;
  /** `null`: none is lit (the value was set another way, e.g. by dragging) */
  value: T | null;
  /** Every choice with its name, in order */
  choices: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}

/** A few keys of which one is lit, like the mode keys of a DAW (one choice among 2–4). */
export function ChoiceKeys<T extends string>({
  label,
  value,
  choices,
  onChange,
}: ChoiceKeysProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 gap-1">
      {choices.map(([choice, name]) => (
        <Chip
          key={choice}
          role="radio"
          aria-checked={choice === value}
          active={choice === value}
          onClick={() => onChange(choice)}
        >
          {name}
        </Chip>
      ))}
    </div>
  );
}
