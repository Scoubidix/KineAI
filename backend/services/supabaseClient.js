// services/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase depuis .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_API_KEY;

// Créer le client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };