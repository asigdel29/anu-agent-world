/**
 * A Durable Object state, faked well enough to drive a room.
 *
 * The room is the one place in the relay where the security properties are
 * not local to a function: identity comes from a hibernation tag set at
 * connect time and is read again on every frame, and the guarantee that a
 * client cannot speak as a peer only holds if those two ends agree. That is
 * not something a unit test of a pure helper can reach.
 *
 * So the platform is faked rather than mocked. Sockets record what was sent
 * instead of sending it, storage is a map, and tags behave as the runtime's
 * do. The room under test is the real one, unmodified — which is the only
 * arrangement where a passing test says anything about production.
 *
 * Only what the room actually uses is implemented. A fake that pretends to be
 * complete invites reliance on behaviour nobody verified.
 */

export class FakeWebSocket {
  /** Everything sent to this socket, in order, still encoded. */
  readonly sent: string[] = [];
  closed: { code: number; reason: string } | null = null;

  send(data: string): void {
    if (this.closed) throw new Error("socket closed");
    this.sent.push(data);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  /** Everything sent to this socket, decoded. */
  frames(): Record<string, unknown>[] {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  /** The frames of one type sent to this socket. */
  framesOf(type: string): Record<string, unknown>[] {
    return this.frames().filter((frame) => frame["type"] === type);
  }
}

export class FakeStorage {
  readonly entries = new Map<string, unknown>();

  list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const prefix = options?.prefix ?? "";
    const out = new Map<string, T>();
    for (const [key, value] of this.entries) {
      if (key.startsWith(prefix)) out.set(key, value as T);
    }
    return Promise.resolve(out);
  }

  put<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, value);
    return Promise.resolve();
  }

  delete(keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.entries.delete(key)) removed += 1;
    return Promise.resolve(removed);
  }
}

export class FakeDurableObjectState {
  readonly storage = new FakeStorage();
  private readonly tags = new Map<FakeWebSocket, string[]>();

  acceptWebSocket(ws: FakeWebSocket, tags: string[]): void {
    this.tags.set(ws, tags);
  }

  getTags(ws: FakeWebSocket): string[] {
    return this.tags.get(ws) ?? [];
  }

  getWebSockets(): FakeWebSocket[] {
    return [...this.tags.keys()].filter((ws) => ws.closed === null);
  }

  /** Drop a socket, as the runtime does once it has closed. */
  forget(ws: FakeWebSocket): void {
    this.tags.delete(ws);
  }
}
