-- T19 · 동시 쓰기 rev 순서(DATA_MODEL §5). 두 세션이 같은 공간에 동시에 쓰는 동안 pull처럼 `rev > 커서`로 읽어도
-- 놓치는 행이 없어야 한다. 그러려면 rev 순서 = 커밋 순서여야 하고, space_revs 행 잠금이 이를 보장한다.
--
-- 진짜 동시성은 한 트랜잭션 안에서 만들 수 없어서 dblink로 별도 세션을 연다. 그 세션들은 커밋하므로
-- 이 파일은 자기 데이터를 고정 UUID로 만들고 끝에서 지운다.
-- 접속 문자열: lr.test_dsn 설정이 있으면 그것, 없으면 `supabase start` 로컬 DB 컨테이너 안 기본값.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(6);

create function pg_temp.dsn() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('lr.test_dsn', true), ''),
    'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres'
  );
$$;

-- 세션 쪽에서 실행할 SQL. 사용자 A로 로그인해 카드 하나를 넣는다(:id 자리에 id).
create function pg_temp.insert_card_sql(card_id uuid) returns text language sql immutable as $$
  select format($f$
    insert into public.date_cards (id, space_id, created_by, key_id, payload)
    values (%L, '00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-0000000000c1', 1, decode(repeat('ab', 48), 'hex'))
  $f$, card_id);
$$;

select dblink_connect('lr_setup', pg_temp.dsn());
select dblink_exec('lr_setup', $$
  delete from public.spaces where id = '00000000-0000-4000-b000-0000000000c1';
  delete from auth.users where id = '00000000-0000-4000-a000-0000000000c1';
  insert into auth.users (id, email) values ('00000000-0000-4000-a000-0000000000c1', 'concurrent@test');
  do $do$
  begin
    perform public.create_space('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-0000000000c1');
  end
  $do$;
$$);

-- 두 쓰기 세션은 RLS를 거치도록 authenticated + A의 JWT로 둔다.
select dblink_connect('lr_w1', pg_temp.dsn());
select dblink_connect('lr_w2', pg_temp.dsn());
select dblink_exec(c, $$
  set role authenticated;
  set request.jwt.claims = '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}';
$$) from unnest(array['lr_w1', 'lr_w2']) as c;
-- ── 1. 먼저 rev를 받은 트랜잭션이 커밋할 때까지 다음 쓰기는 기다린다 ────

select dblink_exec('lr_w1', 'begin');
select dblink_exec('lr_w1', pg_temp.insert_card_sql('00000000-0000-4000-c000-0000000000c1'));
select dblink_send_query('lr_w2', pg_temp.insert_card_sql('00000000-0000-4000-c000-0000000000c2'));
select pg_sleep(0.5);

select is(dblink_is_busy('lr_w2'), 1, '두 번째 쓰기는 첫 트랜잭션의 rev 잠금을 기다림');
select is(
  (select count(*)::int from public.date_cards where space_id = '00000000-0000-4000-b000-0000000000c1'), 0,
  '커밋 전에는 어느 행도 보이지 않음'
);

select dblink_exec('lr_w1', 'commit');
select * from dblink_get_result('lr_w2') as t(status text);
select * from dblink_get_result('lr_w2') as t(status text);

select results_eq(
  $$select id::text, rev from public.date_cards
     where space_id = '00000000-0000-4000-b000-0000000000c1' order by rev$$,
  $$values ('00000000-0000-4000-c000-0000000000c1', 2::bigint), ('00000000-0000-4000-c000-0000000000c2', 3::bigint)$$,
  '먼저 커밋한 쓰기가 작은 rev를 가짐'
);

-- ── 2. 동시 쓰기 400건 + pull 흉내: 커서 뒤로 커밋되는 행이 없어야 한다 ──
-- 두 세션이 행마다 rev를 받은 뒤 잠깐 쉬고 커밋한다(rev와 커밋 사이 틈을 일부러 벌림).
-- 세 번째 세션은 그동안 `rev > 커서 order by rev limit 50`으로 읽고 커서를 그 페이지 최대 rev로 옮긴다.

select dblink_connect('lr_reader', pg_temp.dsn());
select dblink_exec('lr_reader', 'create temp table seen (id uuid primary key, rev bigint not null)');

-- 읽는 쪽을 먼저 띄운다. 시작 커서는 지금까지 커밋된 최대 rev(쓰기 시작 전 값)다.
select dblink_send_query('lr_reader', format($f$
  do $do$
  declare
    cursor_rev bigint := %s;
    page_max bigint;
    deadline timestamptz := clock_timestamp() + interval '30 seconds';
  begin
    loop
      with page as (
        select id, rev from public.date_cards
         where space_id = '00000000-0000-4000-b000-0000000000c1' and rev > cursor_rev
         order by rev limit 50
      ), ins as (
        insert into seen select id, rev from page on conflict do nothing
      )
      select max(rev) into page_max from page;
      cursor_rev := coalesce(page_max, cursor_rev);
      exit when (select count(*) from seen) >= 400 or clock_timestamp() > deadline;
      -- 쉬지 않고 다시 읽는다(커밋 틈을 최대한 자주 엿봄).
    end loop;
  end
  $do$
$f$, (select max(rev) from public.date_cards where space_id = '00000000-0000-4000-b000-0000000000c1')));

select dblink_send_query(c, $$
  do $do$
  begin
    for i in 1..200 loop
      insert into public.date_cards (id, space_id, created_by, key_id, payload)
      values (gen_random_uuid(), '00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-0000000000c1', 1,
              decode(repeat('ab', 48), 'hex'));
      perform pg_sleep(random() * 0.004);
      commit;
    end loop;
  end
  $do$
$$) from unnest(array['lr_w1', 'lr_w2']) as c;

select t.* from unnest(array['lr_w1', 'lr_w2']) as c, lateral dblink_get_result(c) as t(status text);
select t.* from unnest(array['lr_w1', 'lr_w2']) as c, lateral dblink_get_result(c) as t(status text);
select * from dblink_get_result('lr_reader') as t(status text);
select * from dblink_get_result('lr_reader') as t(status text);

select results_eq(
  $$select count(*)::int, count(distinct rev)::int, min(rev), max(rev)
      from public.date_cards where space_id = '00000000-0000-4000-b000-0000000000c1'$$,
  $$values (402, 402, 2::bigint, 403::bigint)$$,
  '동시 쓰기 402건이 서로 다른 rev 2..403을 빈틈없이 받음'
);
select is(
  (select last_rev from public.space_revs where space_id = '00000000-0000-4000-b000-0000000000c1'), 403::bigint,
  'last_rev = 마지막 rev'
);
select is(
  (select n from dblink('lr_reader', 'select count(*)::int from seen') as t(n int)), 400,
  '쓰기가 진행되는 동안 커서로 읽은 쪽도 400건을 하나도 놓치지 않음'
);

-- ── 정리 ────────────────────────────────────────────────────────────

select dblink_disconnect(c) from unnest(array['lr_w1', 'lr_w2', 'lr_reader']) as c;
select dblink_exec('lr_setup', $$
  delete from public.spaces where id = '00000000-0000-4000-b000-0000000000c1';
  delete from auth.users where id = '00000000-0000-4000-a000-0000000000c1';
$$);
select dblink_disconnect('lr_setup');

select * from finish();
rollback;
