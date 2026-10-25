import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';
import { buildBackup, restoreBackup } from './backup';
import { loadDemo } from './seed';
import { balances, stockByItem } from '../domain/balances';

let n = 0;
describe('backup and restore', () => {
  it('restores everything into an empty device and re-restoring changes nothing', async () => {
    const src = new AppDB(`bk-src-${++n}`);
    await loadDemo(src);
    const file = JSON.parse(JSON.stringify(await buildBackup(src)));
    const dst = new AppDB(`bk-dst-${n}`);
    const r = await restoreBackup(dst, file);
    expect(r.operations).toBe(await src.operations.count());
    const a = await src.operations.toArray();
    const b = await dst.operations.toArray();
    expect([...balances(b)]).toEqual([...balances(a)]);
    expect([...stockByItem(b)]).toEqual([...stockByItem(a)]);
    const again = await restoreBackup(dst, file);
    expect(again.operations).toBe(0);
    expect(await dst.operations.count()).toBe(a.length);
  });

  it('rejects files that are not app backups', async () => {
    await expect(restoreBackup(new AppDB(`bk-x-${++n}`), { hello: 1 })).rejects.toThrow();
  });
});
