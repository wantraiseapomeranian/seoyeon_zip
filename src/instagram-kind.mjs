// Conservative content labels; a mention of an official account is not proof
// that this post was published by that account.
export function instagramKind({caption='',author=''}) {
 const text=caption.normalize('NFKC');
 if(/(?<![\p{L}\p{N}])(?:cosmo|코스모(?:톡)?)(?![\p{L}\p{N}])/iu.test(text))return 'cosmo';
 if(/(?<![\p{L}\p{N}])직찍(?![\p{L}\p{N}])/u.test(text))return 'fansite';
 const credit=/\bphoto\s+by\s*(?:_\s*)?@([a-z0-9_.]+)(?![a-z0-9_.])/ig;
 if(author&&[...text.matchAll(credit)].some(m=>m[1].toLowerCase()===author.toLowerCase()))return 'fansite';
 return 'other';
}
