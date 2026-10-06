import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
const changes = new EventEmitter();
changes.setMaxListeners(1000);
let epoch = randomUUID();
const revisions = new Map<string, number>();
let starting: Promise<void> | undefined;
let listener: PoolClient | undefined;
let stopped=false;
export function stopLiveListener(){stopped=true;listener?.removeAllListeners();listener?.release(true);listener=undefined;}
export function revision(family: string) { return `${epoch}:${revisions.get(family) ?? 0}`; }
export function subscribe(family: string, callback: () => void) {
  changes.on(family, callback);
  return () => { changes.off(family, callback); };
}
export function startLiveListener(): Promise<void> {
  if(stopped)return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    let client: PoolClient | undefined;
    let released = false;
    const reconnect = () => {
      if (released) return;
      released = true;
      client?.release(true);
      starting = undefined;
      epoch = randomUUID(); revisions.clear();
      for (const family of changes.eventNames()) changes.emit(family);
      setTimeout(() => void startLiveListener(), 5000).unref();
    };
    try {
      client = await pool.connect();listener=client;
      client.on('error', reconnect);
      client.on('notification', event => {
        if (!event.payload) return;
        if (revisions.size > 10000) { epoch = randomUUID(); revisions.clear(); }
        revisions.set(event.payload, (revisions.get(event.payload) ?? 0) + 1);
        changes.emit(event.payload);
      });
      await client.query('LISTEN duecase_changes');
    } catch { reconnect(); }
  })();
  return starting;
}
