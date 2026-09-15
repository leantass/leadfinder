import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';
const url = n => `https://www.google.com/maps/place/Cafe/data=!1s0x1:0x${n}`;
const scraped = changes => ({name:'Cafe',phone:null,website:null,address:null,city:null,category:null,rating:null,reviewsCount:null,sourceUrl:null,visibleResultsCount:3,...changes});

test('Search persistence uses disposable PostgreSQL, real transactions and job lifecycle', {timeout:180000}, async t=>{
  const db=await disposableBulkDatabase(); const {prisma}=db;
  const service=(results,client=prisma)=>loadBulk('src/services/search-jobs.ts',{
    '@/lib/prisma':{prisma:client}, '@/scraper/google-maps':{scrapeGoogleMapsMultipleLeads:async()=> typeof results==='function'?results():results},
  }).runGoogleMapsSearchJob;
  const clear=async()=>{await prisma.lead.deleteMany();await prisma.searchJob.deleteMany()};
  const counts=(job,found,created,skipped,possible=0)=>{
    assert.equal(job.status,'completed');assert.ok(job.finishedAt);assert.deepEqual([job.foundCount,job.createdCount,job.duplicateSkippedCount,job.possibleDuplicateCount],[found,created,skipped,possible]);assert.equal(created+skipped,found);assert.equal(job.leads.length,created);
  };
  try{
    await t.test('historical jobs remain nullable',async()=>{const job=await prisma.searchJob.create({data:{query:'historical',status:'completed'}});assert.deepEqual([job.foundCount,job.createdCount,job.duplicateSkippedCount,job.possibleDuplicateCount],[null,null,null,null]);});
    await t.test('repeated search always creates job; same three identities never reinsert',async()=>{await clear();const leads=[1,2,3].map(n=>scraped({sourceUrl:url(n)}));counts(await service(leads)('first'),3,3,0);counts(await service(leads)('second'),3,0,3);assert.equal(await prisma.searchJob.count(),2);assert.equal(await prisma.lead.count(),3);});
    await t.test('batch strong duplicate and concrete normalized URL',async()=>{await clear();const fallback='https://www.google.com/maps/place/Cafe/data=!16s%2Fg%2Fabc';counts(await service([scraped({sourceUrl:url(1)}),scraped({sourceUrl:url(1)+'?hl=es'}),scraped({sourceUrl:fallback}),scraped({sourceUrl:fallback+'?rclk=1'})])('batch'),4,2,2);});
    await t.test('possible duplicates are inserted once each and counted per candidate',async()=>{await clear();counts(await service([scraped({phone:'01112345678',website:'https://cafe.test'}),scraped({phone:'01112345678',website:'https://cafe.test'})])('possible'),2,2,0,1);});
    for(const [name,existing,incoming,skip,possible] of [
      ['Maps MANUAL',{sourceUrl:url(7),sourcePlatform:'google_maps'}, {sourceUrl:url(7)},1,0],
      ['international MANUAL',{phone:'+541112345678'}, {phone:'0054 11 1234-5678'},1,0],
      ['local ambiguity',{phone:'+541112345678'}, {phone:'011 1234-5678'},0,1],
      ['website',{website:'https://cafe.test'}, {website:'https://cafe.test'},0,1],
      ['name city',{city:'Lanús'}, {city:'Lanús'},0,1],
      ['branches',{phone:'+541112345678',sourceUrl:url(8),sourcePlatform:'google_maps',address:'A'}, {phone:'+541112345678',sourceUrl:url(9),address:'B'},0,1],
    ]) await t.test(name+' collision preserves existing Lead exactly',async()=>{
      await clear();const manual=await prisma.lead.create({data:{businessName:'Cafe',origin:'MANUAL',sourcePlatform:null,commercialStatus:'contacted',...existing}});
      counts(await service([scraped(incoming)])('collision'),1,1-skip,skip,possible);assert.deepEqual(await prisma.lead.findUnique({where:{id:manual.id}}),manual);
    });
    await t.test('paginates past 500 existing leads',async()=>{await clear();await prisma.lead.createMany({data:Array.from({length:501},(_,i)=>({id:`page-${String(i).padStart(4,'0')}`,businessName:'existing',origin:'SEARCH',sourcePlatform:'google_maps',sourceUrl:url(i+100)}))});counts(await service([scraped({sourceUrl:url(600)})])('paged'),1,0,1);});
    await t.test('two concurrent searches: two jobs but one Lead',async()=>{
      await clear();let arrived=0,release;const gate=new Promise(r=>release=r);const run=service(async()=>{if(++arrived===2)release();await gate;return [scraped({sourceUrl:url(50)})]});
      const jobs=await Promise.all([run('same'),run('different query same place')]);assert.deepEqual(jobs.map(j=>j.createdCount).sort(),[0,1]);assert.deepEqual(jobs.map(j=>j.duplicateSkippedCount).sort(),[0,1]);assert.equal(await prisma.searchJob.count(),2);assert.equal(await prisma.lead.count(),1);
    });
    await t.test('failure after insert rolls back leads and completion; job failed',async()=>{
      await clear();const client={searchJob:prisma.searchJob,$transaction:(fn,options)=>prisma.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='searchJob')return {update:async()=>{throw Error('forced finalization failure')}};return Reflect.get(target,key)}})),options)};
      await assert.rejects(service([scraped({sourceUrl:url(90)})],client)('failure'),/forced finalization/);assert.equal(await prisma.lead.count(),0);const job=await prisma.searchJob.findFirst();assert.equal(job.status,'failed');assert.ok(job.finishedAt);assert.equal(job.foundCount,null);assert.equal(job.createdCount,null);
    });
    await t.test('non persistible candidate fails whole job',async()=>{await clear();await assert.rejects(service([scraped({rating:NaN})])('invalid'));assert.equal(await prisma.lead.count(),0);assert.equal((await prisma.searchJob.findFirst()).status,'failed');});
    await t.test('scraper failure still records failed job',async()=>{await clear();await assert.rejects(service(async()=>{throw Error('scraper failed')})('scrape failure'));assert.equal((await prisma.searchJob.findFirst()).status,'failed');});
    await t.test('zero results produces explicit zero counters',async()=>{await clear();counts(await service([])('empty'),0,0,0);});
  }finally{await db.cleanup()}
});
