interface Props {
  value: string;
  /** Lower bound of "ideal" range. Below this is a warning. */
  min: number;
  /** Upper bound of "ideal" range. Above this is an error. */
  max: number;
}

/**
 * Character counter that turns red when the string is over `max`,
 * green when within [min, max], amber when too short. Used for SEO meta fields.
 */
export default function CharacterCounter({ value, min, max }: Props) {
  const len = value.length;
  let color = "text-muted-foreground";
  let label: string | null = null;
  if (len === 0) {
    color = "text-muted-foreground";
  } else if (len > max) {
    color = "text-destructive font-medium";
    label = `−${len - max} oltre il limite`;
  } else if (len < min) {
    color = "text-amber-600";
    label = `+${min - len} per il minimo`;
  } else {
    color = "text-emerald-600 font-medium";
    label = "ottimale";
  }

  return (
    <div className={`text-[11px] mt-1 flex items-center gap-2 ${color}`}>
      <span>{len}/{max}</span>
      {label && <span>· {label}</span>}
    </div>
  );
}
