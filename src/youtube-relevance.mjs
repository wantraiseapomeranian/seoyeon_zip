// Conservative title-only exclusion. Unknown titles and joint appearances stay reviewable.
export function isClearlyOtherMemberFancam(title){
 if(typeof title!=='string')return false;
 const text=title.normalize('NFKC').toLowerCase();
 const other=/(?<![가-힣a-z])(?:지서연|지연)(?![가-힣])|(?:지서연|지연)(?=직캠|포커스)|\bji[\s_-]*(?:seo[\s_-]*)?yeon\b/u.test(text);
 const withoutJi=text.replace(/지서연|\bji[\s_-]*seo[\s_-]*yeon\b/gu,' ');
 const seoyeon=/윤서연|(?<![가-힣])서연(?=$|[^가-힣]|직캠|포커스)|\b(?:yoon[\s_-]*)?seo[\s_-]*yeon\b/u.test(withoutJi);
 return other&&!seoyeon&&/직캠|팬캠|포커스|\b(?:fan\s*cam|face\s*cam|focus)\b/u.test(text);
}
