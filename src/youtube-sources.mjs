import {youtubeRequest,youtubeError} from './youtube-provider.mjs';
// Only IDs resolved through Google's channel API can become upload sources.
export async function addYouTubeChannel(env,{channel},options={}){
 if(typeof channel!=='string'||!/^(@[A-Za-z0-9_.-]{3,100}|UC[A-Za-z0-9_-]{22})$/.test(channel))throw youtubeError('invalid_input',400);
 const data=await youtubeRequest(env,'channels',{part:'contentDetails,snippet',...(channel.startsWith('@')?{forHandle:channel}:{id:channel})},{...options,budget:'manual'});
 const row=data.items[0],playlist=row?.contentDetails?.relatedPlaylists?.uploads;if(!row||!/^UC[A-Za-z0-9_-]{22}$/.test(row.id)||!/^UU[A-Za-z0-9_-]{22}$/.test(playlist))throw youtubeError('unavailable',422);
 await env.DB.prepare("INSERT INTO youtube_sources(source_key,kind,query,playlist_id) VALUES(?,'channel',?,?) ON CONFLICT(source_key) DO NOTHING").bind('channel:'+row.id,row.id,playlist).run();return {saved:true,channelId:row.id,title:row.snippet?.title??row.id};
}
