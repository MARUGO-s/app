// assets/js/supabase.init.js
(function(){ 
  if(!window.supabase) { console.error('[Supabase] CDN missing'); return; }
  window.sb = window.supabase.createClient('https://ctxyawinblwcbkovfsyj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q');
  console.log('[Supabase] client initialized:', 'https://ctxyawinblwcbkovfsyj.supabase.co');
})();
