import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarAccessPolicy} from '../server/calendar-environment.mjs';

test('anteprima esistente e localhost mantengono la configurazione test',()=>{
  for(const url of ['https://b24ea501.calendarioauditorium-github-io.pages.dev/api/session','http://localhost:8788/api/session']) {
    assert.equal(calendarAccessPolicy(new Request(url),{}).mode,'test');
    assert.equal(calendarAccessPolicy(new Request(url),{CALENDAR_ENVIRONMENT:'production'}).mode,'blocked');
  }
});

test('il sito ufficiale richiede il flag di produzione e due account distinti',()=>{
  const req=new Request('https://calendarioauditorium-github-io.pages.dev/api/session');
  assert.equal(calendarAccessPolicy(req,{}).mode,'blocked');
  assert.equal(calendarAccessPolicy(req,{CALENDAR_ENVIRONMENT:'test'}).mode,'blocked');
  assert.equal(calendarAccessPolicy(req,{CALENDAR_ENVIRONMENT:'production'}).mode,'blocked');
  assert.equal(calendarAccessPolicy(req,{CALENDAR_ENVIRONMENT:'production',CALENDAR_SCHOOL_EMAIL:'school@example.com',CALENDAR_TOWN_EMAIL:'town@example.com'}).mode,'production');
});
