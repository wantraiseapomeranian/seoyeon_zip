export function reviewFilters(params,{instagram=false}={}) {
 const month=params.get('month')||'',media=params.get('media')||'all',author=params.get('author')||'',kind=params.get('kind')||'all';
 if((month&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))||!['all','image','video','unknown'].includes(media)||(author&&!/^[A-Za-z0-9_.]{1,100}$/.test(author))||!(instagram?['all']:['all','cosmo','fansite','official','other']).includes(kind))throw Error('invalid_query');
 const matches=p=>{
  const date=p.publishedAt;
  if(month&&(!date||new Date(new Date(date).getTime()+32400000).toISOString().slice(0,7)!==month))return false;
  if(author&&(p.author??p.authorHandle??'').toLowerCase()!==author.toLowerCase())return false;
  if(kind!=='all'&&p.contentKind!==kind)return false;
  const mediaItems=p.media?.length?p.media:[{kind:'unknown'}];
  return media==='all'||mediaItems.some(m=>media==='video'?['video','gif'].includes(m.kind):m.kind===media);
 };
 return {matches};
}
