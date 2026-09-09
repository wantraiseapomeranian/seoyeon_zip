// Official-source policy only; does not grant nameless-post exceptions.
export function classifyOfficial({text,author,relationship,hasMedia,nameMatch}) {
 const result=(decision,reason)=>({decision,reason,version:'official-v1'});
 if(author.toLowerCase()!=='triplescosmos'||relationship!=='direct')return result('exclude','not-official-direct');
 if(!hasMedia)return result('exclude','no-media');
 const normalized=text.normalize('NFKC');
 if(/응모|판매|구매|투표|당첨|(?:final\s+(?:result|lineup)|(?:event|grand)\s+gravity|digital\s+release|meet\s*(?:&|and)?\s*(?:video\s*)?call\s+event)/iu.test(normalized))return result('exclude','notice');
 const tags=[...normalized.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m=>m[1].toLowerCase());
 if(tags.some(t=>['seoyeon','서연','윤서연','ソヨン'].includes(t)))return result('include','official-member-hashtag');
 if(nameMatch&&/(?:포토\s*비하인드|photo\s*behind)/iu.test(normalized))return result('review','untagged-personal-content');
 return result('exclude','no-member-content-evidence');
}
