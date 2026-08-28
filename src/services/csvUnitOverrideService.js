import { supabase } from '../supabase.js';

const TABLE_NAME = 'csv_unit_overrides';

const isMissingTableError = (error) => {
  // Postgres undefined_table = 42P01
  return String(error?.code || '') === '42P01' || String(error?.message || '').toLowerCase().includes('does not exist');
};

export const csvUnitOverrideService = {
  async _getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user?.id || null;
  },

  async getAll(userId = null) {
    try {
      const uid = userId || await this._getCurrentUserId();
      if (!uid) return new Map();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('ingredient_name,csv_unit')
        .eq('user_id', uid);

      if (error) {
        if (isMissingTableError(error)) return new Map();
        throw error;
      }

      const map = new Map();
      (data || []).forEach((row) => {
        if (row?.ingredient_name) map.set(String(row.ingredient_name), String(row.csv_unit || ''));
      });
      return map;
    } catch (e) {
      console.warn('csvUnitOverrideService.getAll failed', e);
      return new Map();
    }
  },

  async upsert(ingredientName, csvUnit, userId = null) {
    const uid = userId || await this._getCurrentUserId();
    if (!uid) throw new Error('ログインが必要です');
    const name = String(ingredientName || '').trim();
    const unit = String(csvUnit || '').trim();
    if (!name) throw new Error('材料名が必要です');
    if (!unit) throw new Error('単位が必要です');

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(
        {
          user_id: uid,
          ingredient_name: name,
          csv_unit: unit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,ingredient_name' }
      )
      .select()
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error('DBに csv_unit_overrides テーブルがまだありません（マイグレーション未適用）');
      }
      throw error;
    }
    return data;
  },
};

