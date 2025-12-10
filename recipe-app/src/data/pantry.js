import { supabase } from '../lib/supaBaseClient'

// Get all pantry items
export async function getPantry() {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Add a new item
export async function addPantryItem({ name, qty = '', notes = '' }) {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert([{ name, qty, notes }])
    .select()
    .single()
  if (error) throw error
  return data
}

// Update an item (e.g., edit qty or notes)
export async function updatePantryItem(id, patch) {
  const { data, error } = await supabase
    .from('pantry_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Delete an item
export async function removePantryItem(id) {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id)
  if (error) throw error
}

// Clear all items
export async function clearPantry() {
  const { error } = await supabase.from('pantry_items').delete()
  if (error) throw error
}