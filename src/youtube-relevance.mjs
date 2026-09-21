// Conservative title-only exclusion. Unknown titles and joint appearances stay reviewable.
export function isClearlyOtherMemberFancam(title){
 if(typeof title!=='string')return false;
 const text=title.normalize('NFKC').toLowerCase();
 const other=/(?<![가-힣a-z])(?:지서연|지연)(?![가-힣])|(?:지서연|지연)(?=직캠|포커스)|\bji[\s_-]*(?:seo[\s_-]*)?yeon\b/u.test(text);
 const withoutJi=text.replace(/지서연|\bji[\s_-]*seo[\s_-]*yeon\b/gu,' ');
 const seoyeon=/윤서연|(?<![가-힣])서연(?=$|[^가-힣]|직캠|포커스)|\b(?:yoon[\s_-]*)?seo[\s_-]*yeon\b/u.test(withoutJi);
 return other&&!seoyeon&&/직캠|팬캠|포커스|\b(?:fan\s*cam|face\s*cam|focus)\b/u.test(text);
}

// Eligibility for automatic discovery only. Manual registration and human decisions remain authoritative.
export function youtubeExclusionReason(video,{registeredChannel=false}={}){
 const title=typeof video?.title==='string'?video.title.normalize('NFKC').toLowerCase():'';
 if(/(?:^|[^a-z])shorts?(?:$|[^a-z])|쇼츠/u.test(title))return 'SHORTS';
 if(!Number.isFinite(video?.durationSeconds)||video.durationSeconds<60)return 'SHORT_CLIP';
 // Hashtags can name every member, even when the camera follows somebody else.
 const subject=title.replace(/#[^\s#]+/gu,' ').replace(/지서연|\bji[\s_-]*seo[\s_-]*yeon\b/gu,' ');
 if(!/윤서연|(?<![가-힣])서연(?=$|[^가-힣]|직캠|포커스)|\b(?:yoon[\s_-]*)?seo[\s_-]*yeon\b/u.test(subject))return 'SUBJECT_UNCLEAR';
 if(/팬\s*편집|편집본|직캠\s*모음|\b(?:fan\s*edit|compilation)\b/u.test(subject))return 'FAN_EDIT';
 if(/직캠|팬캠|포커스|\b(?:fan\s*cam|face\s*cam|focus)\b/u.test(subject))return null;
 return registeredChannel?null:'SOURCE_UNREGISTERED';
}
