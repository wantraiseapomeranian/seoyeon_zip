import test from 'node:test';import assert from 'node:assert/strict';import {isClearlyOtherMemberFancam} from '../src/youtube-relevance.mjs';
test('JiYeon solo fancams do not match SeoYeon, including Ji SeoYeon aliases',()=>{
 for(const title of ['트리플에스 지연 4K 직캠 JiYeon','지연 직캠 #지서연 #JIYEON','tripleS JiYeon FOCUS','Ji SeoYeon fancam','지서연직캠','지연 직캠 #지서연'])assert.equal(isClearlyOtherMemberFancam(title),true,title);
 for(const title of ['서연직캠 지연직캠','윤서연 지연 직캠','서연 & 지연 직캠','tripleS SeoYeon JiYeon fancam','지연과 윤서연 COSMO 라이브','지연 인터뷰','서연 개인 직캠','윤서연직캠','성수기 채연 서연','공연 지연 안내','서연 없는 제목',''])assert.equal(isClearlyOtherMemberFancam(title),false,title);
});
