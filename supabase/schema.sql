create table worlds (
  id text primary key,
  name text not null,
  created_by text,
  created_at timestamptz default now(),
  last_version int default 1,
  player_count int default 0,
  updated_at timestamptz default now()
);

create table world_snapshots (
  id bigserial primary key,
  world_id text references worlds(id) on delete cascade,
  version int not null,
  state jsonb not null,
  created_at timestamptz default now(),
  unique (world_id, version)
);

alter publication supabase_realtime add table worlds;
