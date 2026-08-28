import { supabase } from '../supabase';

export const deployLogService = {
  fetchDeployLogs: async (limit = 50) => {
    const { data, error } = await supabase
      .from('deploy_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch deploy logs:', error);
      throw error;
    }
    return data;
  },

  insertDeployLog: async (logData) => {
    const { data, error } = await supabase
      .from('deploy_logs')
      .insert([logData])
      .select()
      .single();

    if (error) {
      console.error('Failed to insert deploy log:', error);
      throw error;
    }
    return data;
  }
};
