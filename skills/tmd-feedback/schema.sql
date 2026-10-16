-- Central feedback table for all The Moving Dot websites (Supabase project_database).
-- Already created; kept here for reference and disaster recovery.
create table public.feedback (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    site text not null check (char_length(site) between 1 and 80),
    kind text not null check (kind in ('enquiry', 'chat', 'feedback', 'bug')),
    email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
    message text check (char_length(message) <= 4000),
    reply text check (char_length(reply) <= 4000),
    meta jsonb check (meta is null or pg_column_size(meta) <= 8000),
    session_id text check (char_length(session_id) <= 64),
    page text check (char_length(page) <= 300),
    language text check (char_length(language) <= 20),
    user_agent text check (char_length(user_agent) <= 400),
    status text not null default 'new' check (status in ('new', 'replied', 'closed')),
    notified_at timestamptz
);
alter table public.feedback enable row level security;
create policy "websites can add feedback" on public.feedback for insert to anon with check (status = 'new' and notified_at is null);
grant insert on public.feedback to anon;
revoke select, update, delete on public.feedback from anon;
create index feedback_created_idx on public.feedback (created_at desc);
