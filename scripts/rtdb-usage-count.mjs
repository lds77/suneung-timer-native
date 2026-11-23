// 표준 입력으로 받은 RTDB JSON을 메모리 안에서만 세고 숫자만 출력한다. uid·닉네임은 출력하지 않는다.
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const db = JSON.parse(raw);
const users = db.users || {}, rooms = db.rooms || {}, status = db.status || {};
const LOUNGE = new Set(['STUDY2', 'STUDY3', 'STUDY4', 'STUDY5']);
const now = Date.now(), DAY = 86400000;
const cls = { inList: 0, noRoom: 0, outLounge: 0, outCode: 0, gone: 0 };
for (const [uid, u] of Object.entries(users)) {
  const rid = u && u.roomId;
  if (!rid) { cls.noRoom++; continue; }
  const room = rooms[rid];
  if (!room) { cls.gone++; continue; }
  if (room.members && room.members[uid]) cls.inList++;
  else if (LOUNGE.has(rid)) cls.outLounge++; else cls.outCode++;
}
const roomIds = Object.keys(rooms);
const sizes = (r) => Object.keys(rooms[r]?.members || {}).length;
const membersTotal = roomIds.reduce((s, r) => s + sizes(r), 0);
const act = {};
for (const [k] of [['d1'], ['d3'], ['d7'], ['d14'], ['d30']]) act[k] = { all: 0, lounge: 0 };
let joined7 = 0, joined3 = 0;
for (const r of roomIds) {
  for (const [uid, m] of Object.entries(rooms[r]?.members || {})) {
    const joinedAt = (m && typeof m === 'object' && m.joinedAt) || 0;
    const last = Math.max(joinedAt, status?.[r]?.[uid]?.updatedAt || 0);
    for (const [k, d] of [['d1', 1], ['d3', 3], ['d7', 7], ['d14', 14], ['d30', 30]]) {
      if (now - last <= d * DAY) { act[k].all++; if (LOUNGE.has(r)) act[k].lounge++; }
    }
    if (now - joinedAt <= 7 * DAY) joined7++;
    if (now - joinedAt <= 3 * DAY) joined3++;
  }
}
const loungeStatusResidue = [...LOUNGE].reduce((s, r) => s + Object.keys(status?.[r] || {}).filter((uid) => !rooms[r]?.members?.[uid]).length, 0);
console.log(JSON.stringify({
  measuredAt: new Date(now).toISOString(),
  users: Object.keys(users).length, ...cls,
  sumCheck: cls.inList + cls.noRoom + cls.outLounge + cls.outCode + cls.gone,
  rooms: roomIds.length, codeRooms: roomIds.filter((r) => !LOUNGE.has(r)).length,
  lounge: roomIds.filter((r) => LOUNGE.has(r)).map((r) => `${r}:${sizes(r)}`),
  membersTotal, active: act, joinedWithin3d: joined3, joinedWithin7d: joined7, loungeStatusResidue,
}, null, 1));
