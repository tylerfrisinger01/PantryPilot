import { supabase } from '../lib/supaBaseClient'

/** Get shopping list (unchecked first, newest first) */
export async function getShoppingList() {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .order('checked', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Add item */
export async function addShoppingItem({ name, qty = '', notes = '' }) {
  const { data, error } = await supabase
    .from('shopping_items')
    .insert([{ name, qty, notes }])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Add multiple items at once */
export async function addShoppingItemsBulk(items = []) {
  const rows = (Array.isArray(items) ? items : [])
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') {
        const trimmed = entry.trim()
        return trimmed ? { name: trimmed, qty: '', notes: '' } : null
      }
      if (typeof entry === 'object') {
        const baseName =
          entry.name ??
          entry.ingredient ??
          entry.item ??
          entry.food ??
          entry.title ??
          ''
        const name = typeof baseName === 'string' ? baseName.trim() : ''
        if (!name) return null
        const qtyParts = [
          entry.qty ?? entry.quantity ?? entry.amount,
          entry.unit ?? entry.measure,
        ]
          .map((value) => {
            if (value == null) return ''
            return String(value).trim()
          })
          .filter(Boolean)
        const qty = qtyParts.join(' ')
        const notes =
          [
            entry.notes,
            entry.prep,
            entry.preparation,
            entry.detail,
            entry.description,
          ]
            .map((value) =>
              typeof value === 'string' ? value.trim() : ''
            )
            .find(Boolean) || ''
        return { name, qty, notes }
      }
      return null
    })
    .filter(Boolean)

  if (!rows.length) return []
  const { data, error } = await supabase
    .from('shopping_items')
    .insert(rows)
    .select()

  if (error) throw error
  return data
}

export async function updateShoppingItem(id, patch) {
  const { data, error } = await supabase
    .from('shopping_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Toggle check state */
export async function toggleShoppingChecked(id, checked) {
  const { data, error } = await supabase
    .from('shopping_items')
    .update({ checked })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Remove a single item */
export async function removeShoppingItem(id) {
  const { error } = await supabase
    .from('shopping_items')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/** clear all checked items */
export async function clearCheckedShopping() {
  const { error } = await supabase
    .from('shopping_items')
    .delete()
    .eq('checked', true)
  if (error) throw error
}


export async function moveShoppingItemToPantry(id) {
  // read the item
  const { data: item, error: readErr } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('id', id)
    .single()
  if (readErr) throw readErr

  // create in pantry
  const { error: insErr } = await supabase
    .from('pantry_items')
    .insert([{ name: item.name, qty: item.qty, notes: item.notes }])
  if (insErr) throw insErr

  // remove from shopping list
  const { error: delErr } = await supabase
    .from('shopping_items')
    .delete()
    .eq('id', id)
  if (delErr) throw delErr
}

/** Clear all items */
export async function clearShopping() {
  const { data: rows, error: readErr } = await supabase
    .from('shopping_items')
    .select('id')
  if (readErr) throw readErr

  const ids = Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : []
  if (!ids.length) return []

  const { error: deleteErr } = await supabase
    .from('shopping_items')
    .delete()
    .in('id', ids)
  if (deleteErr) throw deleteErr

  return ids
}