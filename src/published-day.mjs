export function publishedDayRange(day){
 if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(day))throw Error('invalid_day');
 const utc=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(utc)||new Date(utc).toISOString().slice(0,10)!==day)throw Error('invalid_day');
 return [new Date(utc-32400000).toISOString(),new Date(utc-32400000+86400000).toISOString()];
}
