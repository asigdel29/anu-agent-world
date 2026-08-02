import { useInteractionStore } from "../engine/interaction/interactionStore";
import styles from "./InteractPrompt.module.scss";

/**
 * What you can do from where you are standing.
 *
 * It says the verb rather than the mechanism — "read the notice", not
 * "interact" — because the prompt is the only place the world gets to explain
 * itself, and a generic word wastes it.
 *
 * Subscribed to one field. The frame loop writes it only when the target
 * actually changes, so walking past a row of signs re-renders this once per
 * sign rather than sixty times a second.
 */
export default function InteractPrompt() {
  const prompt = useInteractionStore((s) => s.prompt);
  if (!prompt) return null;

  return (
    <div className={styles.prompt} role="status">
      <kbd>E</kbd>
      <span>{prompt}</span>
    </div>
  );
}
