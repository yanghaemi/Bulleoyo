// GitLab 웹훅 → Mattermost 알림 (MR 작성자 @태그). 의존성 없음, node 22 fetch 사용.
//
// 받는 이벤트: merge_request(open·reopen·merge·close), note(MR 코멘트만). 나머지는 200으로 무시.
// 태그 규칙: 코멘트가 달리면 MR 작성자를 태그한다. 작성자 본인 코멘트면 태그 없이 게시만.
//            GitLab 이 웹훅에 실어 주는 건 사용자 id 라서 매핑 키는 GitLab user id 다.
//
// 환경변수:
//   MM_WEBHOOK          Mattermost incoming webhook URL
//   GITLAB_HOOK_TOKEN   GitLab 웹훅 Secret token (X-Gitlab-Token 헤더와 일치해야 처리)
//   MM_USERS            "gitlabUserId=mmUsername,..."  예) 30574=kangryun,30549=mingeun
//   PORT                기본 8080
'use strict';
const http = require('http');

const { MM_WEBHOOK, GITLAB_HOOK_TOKEN, MM_USERS = '', PORT = 8080 } = process.env;
if (!MM_WEBHOOK || !GITLAB_HOOK_TOKEN) { console.error('MM_WEBHOOK, GITLAB_HOOK_TOKEN 필요'); process.exit(2); }

const users = Object.fromEntries(
  MM_USERS.split(',').map(s => s.trim()).filter(Boolean).map(p => p.split('=').map(x => x.trim())),
);
const tag = (id, fallbackName) => (users[id] ? `@${users[id]}` : `**${fallbackName || 'MR 작성자'}**`);
// Mattermost 가 멘션으로 해석하는 키워드와 링크 텍스트의 대괄호를 무력화한다.
const noMention = s => s.replace(/@(channel|all|here)\b/gi, '＠$1');
const linkText = s => s.replace(/[\[\]]/g, '\\$&');
const isBot = u => /^project_\d+_bot_/.test(u.username || '') || /review-bot/i.test(u.name || '');
const who = u => (isBot(u) ? '🤖 자동 리뷰' : `**${u.name}**`);
const cut = (s, n) => (s.length > n ? s.slice(0, n) + ' …' : s);
const summary = note =>
  noMention(cut(note.replace(/<!--[\s\S]*?-->/g, '').replace(/^#{1,3} .*$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), 400));

function format(ev) {
  if (ev.object_kind === 'merge_request') {
    const mr = ev.object_attributes;
    const head = `MR !${mr.iid} [${linkText(mr.title)}](${mr.url})`;
    const actor = ev.user?.name || '알 수 없음';
    // open 은 행위자 = 작성자. merge·close 는 행위자가 다른 사람일 수 있어 이름 폴백을 쓰지 않는다.
    const author = tag(mr.author_id, mr.action === 'open' || mr.action === 'reopen' ? actor : undefined);
    switch (mr.action) {
      case 'open':
      case 'reopen': {
        const reviewers = (ev.reviewers || []).map(r => tag(r.id, r.name)).join(' ');
        return `📬 ${head}\n작성자 ${author}${reviewers ? ` · 리뷰어 ${reviewers}` : ''} · \`${mr.source_branch}\` → \`${mr.target_branch}\``;
      }
      case 'merge': return `✅ ${head} 머지됨 — ${author} (머지: ${actor})`;
      case 'close': return `⏹ ${head} 닫힘 — ${author} (닫음: ${actor})`;
      default: return null; // update·approved 등은 조용히
    }
  }
  if (ev.object_kind === 'note' && ev.merge_request) {
    const mr = ev.merge_request; const n = ev.object_attributes;
    const self = ev.user?.id === mr.author_id;
    const target = self ? '' : ` → ${tag(mr.author_id)}`;
    return `💬 ${who(ev.user || {})} 코멘트 · MR !${mr.iid} [${linkText(mr.title)}](${n.url})${target}\n> ${summary(n.note || '').replace(/\n/g, '\n> ')}`;
  }
  return null;
}

async function post(text) {
  const r = await fetch(MM_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, username: 'GitLab' }),
  });
  if (!r.ok) console.error('MM 전송 실패', r.status, await r.text().catch(() => ''));
}

function handle(req, res) {
  if (req.method !== 'POST') { res.writeHead(200).end('ok'); return; }
  if (req.headers['x-gitlab-token'] !== GITLAB_HOOK_TOKEN) { res.writeHead(401).end(); return; }
  const chunks = []; let total = 0; let dropped = false;
  req.on('error', e => console.error('요청 스트림 에러', e.message));
  req.on('data', c => {
    total += c.length;
    if (total > 2e6) { dropped = true; res.writeHead(413).end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (dropped || res.headersSent) return;
    res.writeHead(200).end('ok'); // GitLab 은 10초 안에 응답을 원한다. 전송은 뒤에서.
    try {
      const text = format(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (text) post(text).catch(e => console.error(e));
    } catch (e) { console.error('payload 파싱 실패', e.message); }
  });
}

module.exports = { format };
if (require.main === module) {
  http.createServer(handle).listen(Number(PORT), () => console.log(`notify on :${PORT}, users=${Object.keys(users).length}`));
}
