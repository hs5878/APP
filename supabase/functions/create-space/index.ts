// create-space: 첫 로그인 직후, 기기에서 만든 space_id로 1인 공간을 만든다(DATA_MODEL §5 공간 생성, §7).
// 입력 { space_id }. spaces 행·owner 멤버·space_revs는 DB 함수 create_space가 한 트랜잭션으로 만든다.
// 같은 사람이 같은 id로 다시 부르면(응답 유실 후 재시도) 200 { status: 'exists' }를 돌려준다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });

  let spaceId: unknown;
  try {
    spaceId = ((await req.json()) as { space_id?: unknown }).space_id;
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (typeof spaceId !== 'string' || !UUID_RE.test(spaceId.toLowerCase())) {
    return json(400, { error: 'invalid_space_id' });
  }

  const args = { p_space_id: spaceId.toLowerCase(), p_user_id: auth.user.id };
  let { data, error } = await admin.rpc('create_space', args);
  // 같은 id로 동시에 두 번 불리면 한쪽이 PK 충돌로 실패한다. 한 번 더 부르면 'exists'가 된다.
  if (error?.code === '23505') ({ data, error } = await admin.rpc('create_space', args));

  if (error) {
    if (error.code === 'LR006') return json(409, { error: 'space_id_taken' });
    console.error('create_space failed', error.code);
    return json(500, { error: 'internal' });
  }
  return json(200, { space_id: args.p_space_id, status: data });
});
