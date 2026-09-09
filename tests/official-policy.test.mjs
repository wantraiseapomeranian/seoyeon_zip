import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePage} from '../src/collection.mjs';
const raw=text=>({type:'status',id:'123',url:'https://x.com/triplescosmos/status/123',author:{screen_name:'triplescosmos'},reposted_by:null,text,created_at:'2026-08-27T10:00:00Z',media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/test.jpg'}]}});
const run=p=>normalizePage({code:200,results:[p],cursor:{bottom:null}},{handle:'triplescosmos',verifiedDirect:false});
test('official direct member hashtag is official even with COSMO link copy',()=>{
 const r=run(raw('#SeoYeon #서연 COSMO'));assert.equal(r.posts[0].contentKind,'official');assert.equal(r.posts[0].matchReason,'official-member-hashtag');
});
test('official notices and reposts do not pass member tags',()=>{
 assert.equal(run(raw('#서연 응모기간 : 내일까지')).posts.length,0);
 assert.equal(run({...raw('#서연'),reposted_by:{screen_name:'other'}}).posts.length,0);
 assert.equal(run({...raw('#서연'),quote:{text:'photo'}}).posts.length,0);
 assert.equal(run({...raw('#서연'),reposted_by:undefined}).posts.length,0);
});
test('untagged personal content goes to review, generic names stay out',()=>{
 const r=run(raw('tripleS 서연 포토 비하인드 #tripleS'));assert.equal(r.posts.length,0);assert.equal(r.officialDecisions[0].decision,'review');
 assert.equal(run(raw('SeoYeon Final Result')).posts.length,0);
 assert.equal(run(raw('#서연이 #JiYeon')).posts.length,0);
});

test('review metadata is preserved outside the feed',()=>{
 const r=run(raw('서연 포토 비하인드'));assert.equal(r.posts.length,0);assert.equal(r.reviewPosts[0].post.canonicalUrl,'https://x.com/triplescosmos/status/123');assert.equal(r.reviewPosts[0].reason,'untagged-personal-content');
});
