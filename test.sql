CREATE OR REPLACE FUNCTION pg_temp.test() RETURNS void AS $$
BEGIN
  RAISE NOTICE 'Trigger testing';
END;
$$ LANGUAGE plpgsql;
