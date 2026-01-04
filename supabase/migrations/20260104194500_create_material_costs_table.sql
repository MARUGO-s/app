-- Create material_costs table to store reference prices for ingredients
create table if not exists material_costs (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  standard_cost numeric, -- Cost per unit
  unit text, -- Reference unit for the cost (e.g., 'g', 'ml', 'pcs')
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS
alter table material_costs enable row level security;

-- Create policies (open access for now to match recipes)
create policy "Allow anonymous read access" on material_costs for select using (true);
create policy "Allow anonymous insert" on material_costs for insert with check (true);
create policy "Allow anonymous update" on material_costs for update using (true);
create policy "Allow anonymous delete" on material_costs for delete using (true);

-- Create updated_at trigger
create trigger update_material_costs_updated_at
  before update on material_costs
  for each row
  execute function update_updated_at_column();
