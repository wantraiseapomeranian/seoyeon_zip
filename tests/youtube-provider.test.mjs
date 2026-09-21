import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYouTubeUrl,fetchYouTubeVideos} from '../src/youtube-provider.mjs';
const id='AbCdEf123_-';
export const video=(videoId=id)=>({id:videoId,snippet:{title:'서연 직캠',channelId:'UCabcdefgh',channelTitle:'방송국',publishedAt:'2026-09-20T00:00:00Z',thumbnails:{high:{url:`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}}},contentDetails:{duration:'PT3M12S'},status:{privacyStatus:'public',uploadStatus:'processed'}});
test('YouTube URLs normalize without trusting arbitrary hosts or shorts',()=>{
 for(const url of [`https://youtu.be/${id}?si=x`,`https://www.youtube.com/watch?v=${id}&t=30`])assert.deepEqual(parseYouTubeUrl(url),{videoId:id,canonicalUrl:`https://www.youtube.com/watch?v=${id}`});
 for(const url of [`https://youtube.com.evil.test/watch?v=${id}`,`https://youtube.com/shorts/${id}`,`https://a@youtube.com/watch?v=${id}`,`https://youtube.com:8080/watch?v=${id}`,'https://youtube.com/playlist?list=x'])assert.throws(()=>parseYouTubeUrl(url));
});
test('YouTube metadata is validated and unavailable IDs are explicit',async()=>{
 const result=await fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[id,'ZZZZZZZZZZZ'],{fetcher:async(url,init)=>{assert.equal(new URL(url).hostname,'www.googleapis.com');assert.ok(!url.includes('test'));assert.equal(init.headers['x-goog-api-key'],'test');return Response.json({items:[video()]});}});
 assert.equal(result.videos[0].durationSeconds,192);assert.deepEqual(result.unavailableIds,['ZZZZZZZZZZZ']);
 await assert.rejects(fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[id],{fetcher:async()=>Response.json({items:[{...video(),contentDetails:{duration:'bad'}}]})}),/invalid_response/);
});
test('provider failures never return raw secrets and bound the response',async()=>{
 await assert.rejects(fetchYouTubeVideos({},[id]),/not_configured/);
 await assert.rejects(fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[id],{fetcher:async()=>Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403})}),/quota_exceeded/);
 await assert.rejects(fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[id],{fetcher:async()=>new Response('x'.repeat(2*1024*1024+1))}),/response_too_large/);
});
