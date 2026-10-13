// node --test exec/jenkins/notify/  — 포맷 회귀 4종. 환경변수는 여기서 넣는다(서버 기동 없음).
process.env.MM_WEBHOOK = 'http://x'; process.env.GITLAB_HOOK_TOKEN = 't';
process.env.MM_USERS = '30574=kangryun,30549=mingeun';
const test = require('node:test'); const assert = require('node:assert/strict');
const { format } = require('./server.js');

test('MR open: 작성자·리뷰어 태그', () => {
  const t = format({ object_kind: 'merge_request', user: { id: 30549, name: '오민근' }, reviewers: [{ id: 30574, name: '이강륜' }],
    object_attributes: { iid: 60, title: 'feat: [x] y', url: 'http://u', author_id: 30549, action: 'open', source_branch: 'a', target_branch: 'develop' } });
  assert.match(t, /📬 MR !60 \[feat: \\\[x\\\] y\]/); assert.match(t, /작성자 @mingeun · 리뷰어 @kangryun/);
});
test('merge: 머지한 사람 이름이 작성자 자리에 오지 않는다', () => {
  const t = format({ object_kind: 'merge_request', user: { id: 1, name: '머지한사람' },
    object_attributes: { iid: 1, title: 't', url: 'u', author_id: 999, action: 'merge' } });
  assert.match(t, /머지됨 — \*\*MR 작성자\*\* \(머지: 머지한사람\)/);
});
test('코멘트: 작성자 태그, @channel 무력화, 마커·헤딩 제거', () => {
  const t = format({ object_kind: 'note', user: { id: 8677, name: '컨설턴트', username: 'c' }, merge_request: { iid: 57, title: 't', author_id: 30574 },
    object_attributes: { note: '<!-- m -->\n### 🤖 x\n\n## 요약\n@channel 좋음', url: 'n' } });
  assert.match(t, /→ @kangryun/); assert.match(t, /＠channel 좋음/); assert.doesNotMatch(t, /<!--|### /);
});
test('본인 코멘트: 태그 없음 / 봇 표기 / update 무시', () => {
  const self = format({ object_kind: 'note', user: { id: 30574, name: '이강륜', username: 'kr9370' }, merge_request: { iid: 1, title: 't', author_id: 30574 }, object_attributes: { note: 'x', url: 'n' } });
  assert.doesNotMatch(self, /→ @/);
  const bot = format({ object_kind: 'note', user: { id: 2, name: 'b204-review-bot', username: 'project_1_bot_a' }, merge_request: { iid: 1, title: 't', author_id: 30574 }, object_attributes: { note: 'x', url: 'n' } });
  assert.match(bot, /🤖 자동 리뷰/);
  assert.equal(format({ object_kind: 'merge_request', user: { name: 'a' }, object_attributes: { iid: 1, title: 't', url: 'u', author_id: 1, action: 'update' } }), null);
});
