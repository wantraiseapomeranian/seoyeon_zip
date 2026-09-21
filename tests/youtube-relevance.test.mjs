import test from 'node:test';import assert from 'node:assert/strict';import {isClearlyOtherMemberFancam} from '../src/youtube-relevance.mjs';
test('JiYeon solo fancams do not match SeoYeon, including Ji SeoYeon aliases',()=>{
 for(const title of ['트리플에스 지연 4K 직캠 JiYeon','지연 직캠 #지서연 #JIYEON','tripleS JiYeon FOCUS','Ji SeoYeon fancam','지서연직캠','지연 직캠 #지서연'])assert.equal(isClearlyOtherMemberFancam(title),true,title);
 for(const title of ['서연직캠 지연직캠','윤서연 지연 직캠','서연 & 지연 직캠','tripleS SeoYeon JiYeon fancam','지연과 윤서연 COSMO 라이브','지연 인터뷰','서연 개인 직캠','윤서연직캠','성수기 채연 서연','공연 지연 안내','서연 없는 제목',''])assert.equal(isClearlyOtherMemberFancam(title),false,title);
});

import * as relevance from '../src/youtube-relevance.mjs';
test('automatic candidates require a named subject, full clip and source for general content',()=>{
 assert.equal(typeof relevance.youtubeExclusionReason,'function');
 const reason=(title,durationSeconds=180,registeredChannel=false)=>relevance.youtubeExclusionReason({title,durationSeconds},{registeredChannel});
 for(const title of ['윤서연 개인 직캠','[얼빡직캠 4K] 트리플에스 서연 Rising','tripleS SEOYEON fancam','서연직캠'])assert.equal(reason(title),null,title);
 assert.equal(reason('서연 직캠',59),'SHORT_CLIP');assert.equal(reason('서연 직캠',60),null);
 assert.equal(reason('서연 직캠 #Shorts',180),'SHORTS');assert.equal(reason('윤서연 쇼츠',240,true),'SHORTS');
 for(const title of ['린 직캠 #윤서연','카에데 직캠 #서연','지서연 직캠','tripleS Ji SeoYeon fancam','트리플에스 멘트'])assert.equal(reason(title),'SUBJECT_UNCLEAR',title);
 assert.equal(reason('윤서연 COSMO 라이브',1200),'SOURCE_UNREGISTERED');assert.equal(reason('윤서연 COSMO 라이브',1200,true),null);
 assert.equal(reason('성수기 채연 서연',1085,true),null);assert.equal(reason('트리플에스 단체 콘텐츠',1000,true),'SUBJECT_UNCLEAR');
 assert.equal(reason('윤서연 직캠 모음 팬편집',180),'FAN_EDIT');
});
