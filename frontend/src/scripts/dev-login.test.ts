import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

it('SQL에 들어갈 수 없는 이메일은 Docker를 호출하기 전에 거절한다', () => {
  const script = resolve(process.cwd(), '../scripts/dev-login.mjs')
  const result = spawnSync(process.execPath, [script, "bad'@example.com"], {
    encoding: 'utf8',
    env: { ...process.env, MYSQL_CONTAINER: '__must_not_be_called__' },
  })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Invalid email')
  expect(result.stderr).not.toContain('__must_not_be_called__')
})
