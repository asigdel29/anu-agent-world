/**
 * Reading a streaming completion, and deciding when to speak.
 *
 * Two jobs that look like one. Parsing server-sent events is mechanical and
 * the provider's format is fixed. Deciding what to *broadcast* is a judgement
 * about a world with other people in it, and the two are separated here
 * because only the second one has an opinion.
 *
 * **A token is not an utterance.** Forwarding each delta as it arrives sends
 * roughly one frame per token to every occupant of a room, which is both a
 * flood and unreadable — a speech bubble that rewrites itself thirty times a
 * second is worse than one that appears whole. Coalescing to sentence
 * boundaries, with a time and length backstop, produces something a person
 * can actually read while keeping the sense that it is being said rather than
 * posted.
 *
 * **The stream is untrusted.** Not because the provider is hostile, but
 * because it is a third party over a network: frames arrive split mid-JSON,
 * arrive doubled, arrive truncated when a connection dies. Every one of those
 * must degrade to "less text" rather than to a throw inside an alarm handler
 * that Cloudflare will then retry and re-bill.
 */

/** How long a fragment may wait before being said anyway. */
export const FLUSH_AFTER_MS = 700;

/** Longest a fragment may grow before being said, sentence or not. */
export const FLUSH_AFTER_CHARS = 90;

export interface StreamDelta {
  /** Text added by this event. */
  readonly content: string;
  /** Tool-call fragments, which arrive in pieces like everything else. */
  readonly toolCalls: readonly ToolCallDelta[];
  /** Why the provider stopped, once it says. */
  readonly finish: string | null;
  /** Token counts, which arrive only on the final event. */
  readonly usage: RawUsage | null;
}

export interface ToolCallDelta {
  readonly index: number;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  /** A slice of the JSON arguments, which are streamed as text. */
  readonly argumentsFragment?: string | undefined;
}

export interface RawUsage {
  readonly promptTokens: number;
  readonly cachedTokens: number;
  readonly completionTokens: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Read one `data:` payload.
 *
 * Returns null for the terminator, for a heartbeat, and for anything that
 * does not parse. A provider that sends a malformed frame should cost the
 * world one fragment of speech, not the whole turn.
 */
export function parseEvent(payload: string): StreamDelta | null {
  const trimmed = payload.trim();
  if (trimmed === "" || trimmed === "[DONE]") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root) return null;

  const choices = Array.isArray(root["choices"]) ? root["choices"] : [];
  const choice = asRecord(choices[0]);
  const delta = asRecord(choice?.["delta"]);

  const content = typeof delta?.["content"] === "string" ? delta["content"] : "";

  const toolCalls: ToolCallDelta[] = [];
  const rawCalls = Array.isArray(delta?.["tool_calls"]) ? delta["tool_calls"] : [];
  for (const entry of rawCalls) {
    const call = asRecord(entry);
    if (!call) continue;
    const fn = asRecord(call["function"]);
    toolCalls.push({
      index: asNumber(call["index"]),
      ...(typeof call["id"] === "string" ? { id: call["id"] } : {}),
      ...(typeof fn?.["name"] === "string" ? { name: fn["name"] } : {}),
      ...(typeof fn?.["arguments"] === "string"
        ? { argumentsFragment: fn["arguments"] }
        : {}),
    });
  }

  const finish = typeof choice?.["finish_reason"] === "string" ? choice["finish_reason"] : null;

  const rawUsage = asRecord(root["usage"]);
  const details = asRecord(rawUsage?.["prompt_tokens_details"]);
  const usage: RawUsage | null = rawUsage
    ? {
        promptTokens: asNumber(rawUsage["prompt_tokens"]),
        cachedTokens: asNumber(details?.["cached_tokens"]),
        completionTokens: asNumber(rawUsage["completion_tokens"]),
      }
    : null;

  return { content, toolCalls, finish, usage };
}

/**
 * Split a raw chunk of the response body into complete `data:` payloads,
 * returning whatever is left over.
 *
 * The leftover is the point. A chunk boundary falls wherever the network put
 * it, routinely mid-JSON, and treating each chunk as a whole message loses a
 * fragment every few hundred tokens — rarely enough to look like a model
 * quirk rather than a bug.
 */
export function splitEvents(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  let rest = buffer;

  for (;;) {
    const boundary = rest.indexOf("\n\n");
    if (boundary === -1) break;
    const block = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) events.push(line.slice(5));
    }
  }

  return { events, rest };
}

export interface Coalescer {
  /** Text not yet said. */
  pending: string;
  /** When the pending text started waiting. */
  since: number;
}

export function createCoalescer(): Coalescer {
  return { pending: "", since: 0 };
}

/** Whether a fragment ends somewhere a person would pause. */
function endsSentence(text: string): boolean {
  return /[.!?…](\s|$)|\n/.test(text.slice(-2));
}

/**
 * Add text, returning what should be said now, or "".
 *
 * Flushes on a sentence ending, on length, or on time. The time backstop is
 * what stops a model that trails off mid-clause from leaving a fragment
 * sitting unsaid until the stream ends.
 */
export function push(coalescer: Coalescer, text: string, now: number): string {
  if (text === "") return "";
  if (coalescer.pending === "") coalescer.since = now;
  coalescer.pending += text;

  const waited = now - coalescer.since;
  const ready =
    endsSentence(coalescer.pending) ||
    coalescer.pending.length >= FLUSH_AFTER_CHARS ||
    waited >= FLUSH_AFTER_MS;

  if (!ready) return "";
  return flush(coalescer);
}

/** Say whatever is waiting, however incomplete. */
export function flush(coalescer: Coalescer): string {
  const said = coalescer.pending.trim();
  coalescer.pending = "";
  coalescer.since = 0;
  return said;
}

export interface AssembledCall {
  readonly id: string;
  readonly name: string;
  /** Arguments as received. Parsing is the caller's problem. */
  readonly argumentsJson: string;
}

/**
 * Join streamed tool-call fragments into whole calls.
 *
 * Arguments arrive as text split at arbitrary points, so a call is only
 * usable once the stream has finished. Indexed rather than appended, because
 * a model emitting two calls interleaves their fragments.
 */
export function assembleCalls(deltas: readonly ToolCallDelta[]): AssembledCall[] {
  const byIndex = new Map<number, { id: string; name: string; args: string }>();

  for (const delta of deltas) {
    const existing = byIndex.get(delta.index) ?? { id: "", name: "", args: "" };
    byIndex.set(delta.index, {
      id: delta.id ?? existing.id,
      name: delta.name ?? existing.name,
      args: existing.args + (delta.argumentsFragment ?? ""),
    });
  }

  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({ id: call.id, name: call.name, argumentsJson: call.args }))
    .filter((call) => call.name !== "");
}
