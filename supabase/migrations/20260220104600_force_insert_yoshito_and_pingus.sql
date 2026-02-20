-- Insert the specific missing users by UUID
INSERT INTO public.profiles (id, display_id, email, role, show_master_recipes)
VALUES
  ('dbb8ec3e-7481-40ab-87ed-d0f46855bb5d', 'marugowaltz', 'marugo.waltz@gmail.com', 'admin', true),
  ('13705216-3111-467a-8e09-299adfd39b2c', 'pingus0428icloud', 'pingus0428@icloud.com', 'user', false)
ON CONFLICT (id) DO UPDATE 
SET 
  display_id = EXCLUDED.display_id,
  email = EXCLUDED.email,
  role = EXCLUDED.role;
