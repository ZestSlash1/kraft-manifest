import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase Admin Client using the Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Verify the user making the request is actually an Admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) throw new Error('Unauthorized request.')

    const { data: roleData } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).single()
    if (roleData?.role !== 'admin') throw new Error('Permission denied. Admin access required.')

    // 3. Parse the action from the React frontend
    const { action, targetUserId, newPassword } = await req.json()

    // 4. Execute the requested Admin Action
    if (action === 'delete_user') {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)
      if (error) throw error;
      return new Response(JSON.stringify({ message: 'User deleted successfully.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } 
    
    if (action === 'reset_password') {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password: newPassword })
      if (error) throw error;
      return new Response(JSON.stringify({ message: 'Password updated successfully.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Invalid action provided.')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})