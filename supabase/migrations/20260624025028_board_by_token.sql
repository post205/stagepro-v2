-- Task 2.1 — board_by_token: the ONLY public (anon) read path into resale data.
-- This is the product's privacy boundary. anon has NO direct grant on assets,
-- buyers, buyer_assets, or v_assets (RLS + revoked select). This security-definer
-- function runs as its owner, so it can read the base tables — but it returns
-- ONLY: rows for the matching ACTIVE token, that buyer's curated buyer_assets,
-- and items whose suggested_disposition = 'sell' (owner 'sell' override OR the
-- idle>=3mo auto-flag). It NEVER returns token, contact, other buyers' rows,
-- Keep gear, or anything for an inactive buyer / bad token.
--
-- v_assets is security_invoker; inside this definer function it executes with
-- the function owner's rights, which satisfies its RLS — that's why the join works.
-- `set search_path = public` is mandatory on security-definer fns (anti-hijack).

create or replace function public.board_by_token(p_token text)
returns table (buyer_name text, asset_id uuid, name text, category text,
               qty int, asking_price numeric, book_value numeric, photos text[])
language sql
security definer
set search_path = public
as $$
  select b.name, a.id, a.name, a.category, a.qty, a.asking_price, va.book_value, a.photos
  from buyers b
  join buyer_assets ba on ba.buyer_id = b.id
  join assets a        on a.id = ba.asset_id
  join v_assets va     on va.id = a.id
  where b.token = p_token
    and b.active
    and va.suggested_disposition = 'sell';
$$;

grant execute on function public.board_by_token(text) to anon;
