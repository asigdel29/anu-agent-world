import Actor from "./Actor";
import { useRealtimeStore } from "./useRealtime";

/**
 * Everyone else, mounted.
 *
 * The only thing this subscribes to is the roster, so it re-renders when
 * somebody arrives or leaves and never when somebody moves. A room where
 * twenty people are walking produces zero renders here.
 */

interface Props {
  /** The proportions the collision constants describe. */
  readonly height: number;
  readonly radius: number;
}

export default function ActorLayer({ height, radius }: Props) {
  const roster = useRealtimeStore((s) => s.roster);
  return (
    <>
      {roster.map((id) => (
        <Actor key={id} id={id} height={height} radius={radius} />
      ))}
    </>
  );
}
