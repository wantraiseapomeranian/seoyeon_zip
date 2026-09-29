export const SEARCH_DAILY_LIMIT=50;
export const BACKFILL_SEARCH_LIMIT=SEARCH_DAILY_LIMIT-4;
export const QUOTA_TIME_ZONE='America/Los_Angeles';
const dates=new Intl.DateTimeFormat('en-CA',{timeZone:QUOTA_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
export const youtubeQuotaDay=now=>dates.format(new Date(now*1000));
// Find the next local date boundary, including the 23/25-hour DST days.
export function youtubeQuotaReset(now){
 const day=youtubeQuotaDay(now);let before=Math.floor(now),after=before+26*3600;
 while(after-before>1){const middle=Math.floor((before+after)/2);if(youtubeQuotaDay(middle)===day)before=middle;else after=middle;}
 return after;
}
