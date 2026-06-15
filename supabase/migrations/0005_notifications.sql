-- Plan 3: notification pipeline. Triggers enqueue events; pg_cron flushes the
-- queue every minute through pg_net to the push Edge Function, authenticated
-- by a shared secret stored in Vault. notification_queue has no client grants
-- (0002), so the trigger functions are SECURITY DEFINER, owned by postgres,
-- with a pinned search_path.

-- No "with schema extensions" here, unlike unaccent in 0004: pg_cron only
-- installs into the schema the platform fixes for it (cron) and pg_net owns
-- its net schema. Every call site below is schema-qualified anyway.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Enqueue on item insert. Carry-over and reorder copies fire this too: the
-- copies are real additions to a brand new list and the resulting extra
-- digest ("X added N items") is accepted, informative behavior.
create or replace function private.enqueue_item_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notification_queue (household_id, list_id, actor_id, event, payload)
  values (new.household_id, new.list_id, auth.uid(), 'items_added',
          jsonb_build_object('item_name', new.name));
  return null;
end;
$$;

create or replace function private.enqueue_list_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notification_queue (household_id, list_id, actor_id, event, payload)
  values (new.household_id, new.id, auth.uid(), 'list_completed',
          jsonb_build_object('list_name', new.name));
  return null;
end;
$$;

create trigger items_enqueue after insert on public.list_items
  for each row execute function private.enqueue_item_added();
create trigger lists_enqueue after update on public.lists
  for each row when (old.status = 'active' and new.status = 'completed')
  execute function private.enqueue_list_completed();

-- A device's push endpoint is proof of possession: when a second account signs
-- in on the same browser profile, pushManager returns the same subscription,
-- so the row must move to the current user. RLS forbids cross-user updates,
-- hence SECURITY DEFINER, mirroring redeem_invite's rationale in 0002.
create or replace function public.claim_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent);
end;
$$;

-- Flush: called by pg_cron every minute. Reads the function URL and shared
-- secret from Vault at run time so one migration works in every environment;
-- a stack without the secrets (fresh local clone) is a silent no-op.
create or replace function private.flush_notification_queue()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from notification_queue where processed_at is null) then
    return;
  end if;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_function_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- pg_net is fire and forget; timeout raised above the 2 second default.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

select cron.schedule('flush-push-queue', '* * * * *',
  'select private.flush_notification_queue()');
-- Processed rows are an audit trail for a week, then noise. pg_net trims its
-- own net._http_response log (default 6 hour retention), so only our queue
-- needs a cleanup job.
select cron.schedule('clean-push-queue', '15 4 * * *',
  $$delete from public.notification_queue
    where processed_at is not null
      and processed_at < now() - interval '7 days'$$);

-- Same grant hygiene as 0002/0004: private functions are never PUBLIC.
revoke execute on function private.enqueue_item_added() from public, anon, authenticated;
revoke execute on function private.enqueue_list_completed() from public, anon, authenticated;
revoke execute on function private.flush_notification_queue() from public, anon, authenticated;
revoke execute on function public.claim_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.claim_push_subscription(text, text, text, text) to authenticated;
