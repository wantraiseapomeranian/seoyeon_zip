// Resolve only exact source URLs in the current Instagram response page. SQL visibility/dedup use source data.
export async function instagramPreviewUrls(DB,posts,{review=false}={}){
 const codeOf=p=>review?p.code:p.platform==='instagram'&&p.id?.startsWith('ig:')?p.id.slice(3):null;
 const keys=new Map();
 for(const post of posts){
  const code=codeOf(post);if(!code)continue;
  for(const source of [...(post.images??[]),post.image,...(post.media??[]).map(m=>m.previewUrl)]){
   if(typeof source==='string')keys.set(JSON.stringify([code,source]),{code,source});
  }
 }
 if(!keys.size)return posts;
 const {results}=await DB.prepare("SELECT a.code,a.source_url,a.preview_url FROM json_each(?) k JOIN instagram_preview_urls a ON a.code=json_extract(k.value,'$.code') AND a.source_url=json_extract(k.value,'$.source')").bind(JSON.stringify([...keys.values()])).all();
 const aliases=new Map(results.map(r=>[JSON.stringify([r.code,r.source_url]),r.preview_url]));
 return posts.map(post=>{
  const code=codeOf(post);if(!code)return post;
  const resolve=source=>aliases.get(JSON.stringify([code,source]))??source;
  return {...post,...(post.images?{images:post.images.map(resolve)}:{}),...(post.image?{image:resolve(post.image)}:{}),
   ...(post.media?{media:post.media.map(m=>({...m,previewUrl:resolve(m.previewUrl)}))}:{})};
 });
}
