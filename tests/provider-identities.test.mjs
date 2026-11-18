import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolveProviderIdentity} from '../server/provider-identities.mjs';
test('associa solo utenti attivi con identificativo verificato e ruolo nel database',async()=>{const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0004_managed_identity.sql','utf8'));const provider='12345678-1234-1234-1234-123456789abc';sqlite.prepare('INSERT INTO managed_accounts(id,username,display_name,role,email,provider_user_id) VALUES (?,?,?,?,?,?)').run('user','mario','Mario','school','mario@example.com',provider);const db={prepare(sql){let values=[];return {bind(...args){values=args;return this},async first(){return sqlite.prepare(sql).get(...values)||null}}}};assert.equal((await resolveProviderIdentity(db,'MARIO',provider)).role,'school');assert.equal(await resolveProviderIdentity(db,'mario','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),null);sqlite.prepare('UPDATE managed_accounts SET disabled=1 WHERE id=?').run('user');assert.equal(await resolveProviderIdentity(db,'mario',provider),null)});
