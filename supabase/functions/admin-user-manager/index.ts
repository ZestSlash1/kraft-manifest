import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) throw new Error('Unauthorized')

    const { data: roleData } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id).single()
    if (roleData?.role !== 'admin') throw new Error('Requires admin privileges')

    // Parse the request
    const { action, targetUserId, newPassword, newRole } = await req.json()

    if (action === 'reset_password') {
      const { error } = await supabaseClient.auth.admin.updateUserById(targetUserId, { password: newPassword })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    if (action === 'delete_user') {
      const { error } = await supabaseClient.auth.admin.deleteUser(targetUserId)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // --- NEW ACTION: UPDATE ROLE ---
    if (action === 'update_role') {
      if (newRole !== 'admin' && newRole !== 'staff') throw new Error('Invalid role');
      
      const { error } = await supabaseClient.from('user_roles').update({ role: newRole }).eq('user_id', targetUserId)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    throw new Error('Invalid action')
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})