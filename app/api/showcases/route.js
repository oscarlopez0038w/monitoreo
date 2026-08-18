import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, showcases: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('home_showcases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      showcases: data || [],
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado para guardar vitrinas.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, title, description, categoryFocus, items, isActive } = body;

    if (!title || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El título y una lista de SKUs no vacía son requeridos.' },
        { status: 400 }
      );
    }

    const showcaseData = {
      title: title.trim(),
      description: (description || '').trim(),
      category_focus: categoryFocus || 'General',
      skus_count: items.length,
      items,
      is_active: isActive ?? true,
      updated_at: new Date().toISOString(),
    };

    let resultData;
    let error;

    if (id) {
      // Actualizar vitrina existente
      const { data, error: updateErr } = await supabaseAdmin
        .from('home_showcases')
        .update(showcaseData)
        .eq('id', id)
        .select()
        .single();
      resultData = data;
      error = updateErr;
    } else {
      // Crear nueva vitrina
      const { data, error: insertErr } = await supabaseAdmin
        .from('home_showcases')
        .insert([showcaseData])
        .select()
        .single();
      resultData = data;
      error = insertErr;
    }

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      showcase: resultData,
      message: id ? 'Vitrina actualizada exitosamente.' : 'Vitrina guardada exitosamente.',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no disponible.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID de vitrina es requerido.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('home_showcases').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Vitrina eliminada correctamente.' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
