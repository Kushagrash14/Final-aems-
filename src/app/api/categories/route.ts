import { NextRequest, NextResponse } from 'next/server';
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/lib/store';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { canUserEdit } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized: active login session required' }, { status: 401 });
  }

  const categories = await getCategories();
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin' && validation.user.role !== 'hr') {
    return NextResponse.json({ error: 'Only administrators or HR can create new categories' }, { status: 403 });
  }

  if (!canUserEdit(validation.user, validation.scope)) {
    return NextResponse.json({ error: 'View-only access: modifications not permitted' }, { status: 403 });
  }

  try {
    const { name, code, description, icon } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Department/Category name is required' }, { status: 400 });
    }

    const cleanName = name.trim();
    const catCode = (code && code.trim() ? code.trim() : `CAT-${cleanName.slice(0, 4).replace(/[^a-zA-Z0-9]/g, '') || 'GEN'}`).toUpperCase();

    const cat = await createCategory({
      name: cleanName,
      code: catCode,
      description: description ? description.trim() : null,
      icon: icon || 'Tag',
      is_active: true,
    });

    return NextResponse.json({ success: true, category: cat });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create category';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only administrators can modify categories' }, { status: 403 });
  }

  if (!canUserEdit(validation.user, validation.scope)) {
    return NextResponse.json({ error: 'View-only access: modifications not permitted' }, { status: 403 });
  }

  try {
    const { id, name, description, icon, is_active } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (icon !== undefined) updates.icon = icon;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    const updated = await updateCategory(id, updates);
    return NextResponse.json({ success: true, category: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update category';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only administrators can delete categories/departments' }, { status: 403 });
  }

  if (!canUserEdit(validation.user, validation.scope)) {
    return NextResponse.json({ error: 'View-only access: modifications not permitted' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    await deleteCategory(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete category';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
