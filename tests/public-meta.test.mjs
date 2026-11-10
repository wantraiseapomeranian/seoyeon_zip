import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';

const read=name=>readFileSync(new URL('../validation/'+name,import.meta.url),'utf8');
const site='https://seoyeon-zip.seoyeon-archive.workers.dev';

test('robots.txt blocks AI crawlers everywhere and keeps search engines off APIs and admin',()=>{
 const groups=read('robots.txt').split(/\n\s*\n/).map(block=>{
  const lines=block.split('\n').map(line=>line.replace(/#.*/,'').trim()).filter(Boolean).map(line=>line.split(/:\s*/,2));
  return {agents:lines.filter(([k])=>/^user-agent$/i.test(k)).map(([,v])=>v),rules:lines.filter(([k])=>!/^user-agent$/i.test(k)).map(([k,v])=>k.toLowerCase()+' '+v)};
 }).filter(group=>group.agents.length);
 const rulesFor=agent=>groups.find(group=>group.agents.includes(agent))?.rules;
 for(const agent of ['GPTBot','ClaudeBot','Google-Extended','PerplexityBot','CCBot','Applebot-Extended'])assert.deepEqual(rulesFor(agent),['disallow /'],agent);
 assert.deepEqual(rulesFor('*'),['disallow /api/','disallow /admin','allow /']);
});

test('feed HTML carries a share preview whose image is a public site asset',async()=>{
 const html=read('feed.html'),meta=(attr,name)=>html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]+)">`))?.[1];
 const description='윤서연의 사진과 영상을 모아보는 비공식 팬 아카이브입니다. 아티스트 및 소속사의 공식 서비스가 아닙니다.';
 assert.equal(meta('name','description'),description);assert.equal(meta('property','og:description'),description);
 assert.equal(meta('property','og:title'),'서연모음.zip');assert.equal(meta('property','og:site_name'),'서연모음.zip');
 assert.equal(meta('property','og:url'),site+'/feed');assert.equal(meta('name','twitter:card'),'summary');
 assert.match(html,new RegExp(`<link rel="canonical" href="${site}/feed">`));
 const image=new URL(meta('property','og:image'));assert.equal(image.origin,site);
 // A preview image outside the public allowlist would 401 for crawlers and break link cards.
 const env={PUBLIC_FEED_ENABLED:'true',ASSETS:{fetch:async()=>new Response('png')}};
 assert.equal((await worker.fetch(new Request('https://example.test'+image.pathname),env)).status,200);
});
