export function saveVideoStatement(DB,video,now=Math.floor(Date.now()/1000)){
 return DB.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,availability) VALUES(?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET metadata_json=excluded.metadata_json,metadata_fetched_at=excluded.metadata_fetched_at,availability=excluded.availability").bind(video.videoId,JSON.stringify(video),now,video.deferred?'unavailable':'available');
}
export function unavailableStatement(DB,id,now){return DB.prepare("INSERT INTO youtube_videos(video_id,metadata_fetched_at,availability) VALUES(?,?,'unavailable') ON CONFLICT(video_id) DO UPDATE SET metadata_json=NULL,metadata_fetched_at=excluded.metadata_fetched_at,availability='unavailable'").bind(id,now);}
export function decisionSnapshot(row){return row?{decision:row.decision,category:row.category,format:row.format,revision:row.revision}:null;}
