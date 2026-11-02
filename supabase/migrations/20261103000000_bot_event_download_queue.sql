alter table public.bot_conversations
  add column if not exists pending_campaign_ids uuid[] not null default '{}'::uuid[];

alter table public.bot_conversations
  drop constraint if exists bot_conversations_state_check;

alter table public.bot_conversations
  add constraint bot_conversations_state_check
  check (state = any (array[
    'idle'::text,
    'awaiting_registration'::text,
    'await_event_format'::text,
    'awaiting_download_choice'::text
  ]));
