import { supabaseAdmin } from './supabase'

/**
 * Creates a teacher user with auth + profile + teacher record.
 * Three-step atomic process with rollback if any step fails.
 *
 * Requires VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local for admin auth ops.
 *
 * @param {Object} params
 * @param {string} params.full_name
 * @param {string} params.email
 * @param {string} [params.employee_number]
 * @param {'M'|'F'|''} [params.gender]
 * @param {string} [params.phone]
 * @returns {Promise<{userId: string, password: string}>}
 */
export async function createTeacher({ full_name, email, employee_number, gender, phone }) {
  // ── Validation ──────────────────────────────────────────────────────────
  if (!full_name?.trim())  throw new Error('Full name is required.')
  if (!email?.trim())      throw new Error('Email is required.')
  if (!supabaseAdmin)      throw new Error('Service role key not configured. Add VITE_SUPABASE_SERVICE_ROLE_KEY to .env.local')

  const trimmed = {
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    employee_number: employee_number?.trim() || null,
    gender: gender || null,
    phone: phone?.trim() || null,
  }

  // ── Step 1: Generate secure password ────────────────────────────────────
  const password = Math.random().toString(36).slice(-8) + 'A1!'

  // ── Step 2: Create auth user (admin API) ────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: trimmed.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: trimmed.full_name, role: 'teacher' },
  })
  if (authError) {
    if (authError.message?.includes('already registered')) {
      throw new Error(`Email ${trimmed.email} is already registered.`)
    }
    throw new Error(`Auth creation failed: ${authError.message}`)
  }

  const userId = authData.user.id

  // ── Step 3: Create profile (use supabaseAdmin to bypass RLS) ────────────
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: userId, full_name: trimmed.full_name, role: 'teacher' })
  if (profileError) {
    await cleanupAuth(userId)
    if (profileError.code === '23505') {
      throw new Error(`Profile for ${trimmed.email} already exists.`)
    }
    throw new Error(`Profile creation failed: ${profileError.message}`)
  }

  // ── Step 4: Create teacher record (use supabaseAdmin to bypass RLS) ────
  const { error: teacherError } = await supabaseAdmin
    .from('teachers')
    .insert({
      profile_id: userId,
      full_name: trimmed.full_name,
      employee_number: trimmed.employee_number,
      gender: trimmed.gender,
      phone: trimmed.phone,
      email: trimmed.email,
    })
  if (teacherError) {
    // Rollback: remove profile + auth user
    await supabaseAdmin.from('profiles').delete().eq('id', userId)
    await cleanupAuth(userId)
    if (teacherError.code === '23505') {
      throw new Error(`Teacher with email ${trimmed.email} already exists.`)
    }
    throw new Error(`Teacher record creation failed: ${teacherError.message}`)
  }

  return { userId, password }
}

/**
 * Update teacher details (non-auth fields only).
 * Email changes require a separate auth admin operation.
 */
export async function updateTeacher(id, { full_name, employee_number, gender, phone, email }) {
  if (!full_name?.trim()) throw new Error('Full name is required.')

  const { error } = await supabaseAdmin
    .from('teachers')
    .update({
      full_name: full_name.trim(),
      employee_number: employee_number?.trim() || null,
      gender: gender || null,
      phone: phone?.trim() || null,
      email: email?.trim().toLowerCase() || null,
    })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') throw new Error('Email already in use by another teacher.')
    throw new Error(`Update failed: ${error.message}`)
  }
}

/**
 * Delete teacher + profile + auth user.
 */
export async function deleteTeacher(teacherId, userId) {
  // Teacher record (cascade handles assignments)
  const { error: tErr } = await supabaseAdmin.from('teachers').delete().eq('id', teacherId)
  if (tErr) throw new Error(`Failed to delete teacher: ${tErr.message}`)

  // Profile
  const { error: pErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
  if (pErr) throw new Error(`Failed to delete profile: ${pErr.message}`)

  // Auth user (admin API)
  if (supabaseAdmin) {
    const { error: aErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (aErr) throw new Error(`Failed to delete auth user: ${aErr.message}`)
  }
}

// ── Internal: rollback auth user ────────────────────────────────────────────
async function cleanupAuth(userId) {
  if (!supabaseAdmin) return
  await supabaseAdmin.auth.admin.deleteUser(userId)
}
