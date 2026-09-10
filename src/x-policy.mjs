export function reviewReason(text){
 const s=text.normalize('NFKC');
 if(/byteS|바이츠|마스코트|mascot|official characters|캐릭터/iu.test(s))return '캐릭터·상품 이미지 확인';
 if(/응모|당첨자|구매|판매|MEET\s*(?:&|AND)\s*VIDEO\s*CALL|PRICE\s*:|BRAND\s*:|착용.*정보|패션.*정보|(?:participate|attend).*(?:festival)|축제.*(?:참여|출연|안내)/iu.test(s))return '행사 안내·홍보·상품 정보 확인';
 return null;
}
