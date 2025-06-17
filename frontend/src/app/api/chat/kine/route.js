import { NextRequest, NextResponse } from 'next/server';

// URL de votre backend depuis la variable d'environnement
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request) {
  try {
    const { message } = await request.json();
    const authHeader = request.headers.get('authorization');
    
    const response = await fetch(`${BACKEND_URL}/api/chat/kine/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erreur backend:', error);
      return NextResponse.json({ error: 'Erreur backend' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Erreur API Route:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '5';
    
    const response = await fetch(`${BACKEND_URL}/api/chat/kine/history?days=${days}`, {
      headers: {
        'Authorization': authHeader
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erreur backend historique:', error);
      return NextResponse.json({ error: 'Erreur backend' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Erreur API Route GET:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request) {
  console.log('🗑️ DELETE appelé !'); // ← Debug log
  try {
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader); // ← Debug log
    
    const response = await fetch(`${BACKEND_URL}/api/chat/kine/history`, {
      method: 'DELETE',
      headers: {
        'Authorization': authHeader
      }
    });

    console.log('Backend response status:', response.status); // ← Debug log

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erreur backend suppression:', error);
      return NextResponse.json({ error: 'Erreur backend' }, { status: response.status });
    }

    const data = await response.json();
    console.log('✅ Suppression réussie:', data); // ← Debug log
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Erreur API Route DELETE:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}