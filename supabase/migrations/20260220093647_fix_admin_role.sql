-- Set the main user to admin
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'marugo.waltz@gmail.com';
