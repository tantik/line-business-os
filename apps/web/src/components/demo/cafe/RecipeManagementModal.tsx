'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { RECIPES } from '@/lib/demo/cafe/data';
import { buttonPrimary, buttonSecondary, demoColors, input } from '@/lib/demo/cafe/theme';

interface RecipeManagementModalProps {
  open: boolean;
  onClose: () => void;
}

type RecipeStatus = 'published' | 'draft';
type RecipeContentKind = 'recipe' | 'instruction';

interface ManagedRecipe {
  id: string;
  contentKind: RecipeContentKind;
  name: string;
  description: string;
  image: string;
  ingredients: string[];
  steps: string[];
  status: RecipeStatus;
  /** Optional extra memo/how-to block (e.g. 抹茶ラテ's 抹茶液の作り方) — mirrors `Recipe.memoTitle`/`Recipe.memo`. Empty means no block. */
  memoTitle: string;
  memo: string;
  /** Static demo-only English equivalents of the memo block — mirrors `Recipe.memoTitleEn`/`Recipe.memoEn`. Not machine-translated. */
  memoTitleEn: string;
  memoEn: string;
}

interface RecipeForm {
  contentKind: RecipeContentKind;
  name: string;
  description: string;
  image: string;
  ingredientsText: string;
  stepsText: string;
  status: RecipeStatus;
  memoTitle: string;
  memo: string;
  memoTitleEn: string;
  memoEn: string;
}

type ViewMode = 'list' | 'add' | 'edit';

const emptyForm: RecipeForm = {
  contentKind: 'recipe',
  name: '',
  description: '',
  image: '',
  ingredientsText: '',
  stepsText: '',
  status: 'draft',
  memoTitle: '',
  memo: '',
  memoTitleEn: '',
  memoEn: '',
};
const fieldLabel = { fontSize: 12, color: demoColors.textMuted };

function seedRecipes(): ManagedRecipe[] {
  return RECIPES.map((recipe) => ({
    id: recipe.id,
    contentKind: recipe.contentKind ?? 'recipe',
    name: recipe.name,
    description: recipe.description,
    image: recipe.image ?? '',
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    status: 'published',
    memoTitle: recipe.memoTitle ?? '',
    memo: recipe.memo ?? '',
    memoTitleEn: recipe.memoTitleEn ?? '',
    memoEn: recipe.memoEn ?? '',
  }));
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function recipeToForm(recipe: ManagedRecipe): RecipeForm {
  return {
    contentKind: recipe.contentKind,
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    ingredientsText: recipe.ingredients.join('\n'),
    stepsText: recipe.steps.join('\n'),
    status: recipe.status,
    memoTitle: recipe.memoTitle,
    memo: recipe.memo,
    memoTitleEn: recipe.memoTitleEn,
    memoEn: recipe.memoEn,
  };
}

function formToRecipe(form: RecipeForm): Omit<ManagedRecipe, 'id'> {
  return {
    contentKind: form.contentKind,
    name: form.name,
    description: form.description,
    image: form.image,
    ingredients: linesToList(form.ingredientsText),
    steps: linesToList(form.stepsText),
    status: form.status,
    memoTitle: form.memoTitle,
    memo: form.memo,
    memoTitleEn: form.memoTitleEn,
    memoEn: form.memoEn,
  };
}

function rowActionButtonStyle(danger: boolean) {
  return {
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${danger ? demoColors.dangerText : demoColors.border}`,
    background: demoColors.surface,
    color: danger ? demoColors.dangerText : demoColors.textPrimary,
  } as const;
}

function statusBadgeStyle(status: RecipeStatus) {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    background: status === 'published' ? demoColors.accentMuted : demoColors.goldMuted,
    color: status === 'published' ? demoColors.accentStrong : demoColors.goldDark,
  } as const;
}

/** レシピ管理: demo-only mock recipe catalog (add/edit/delete kept in local component state). Manager-side only — no public link to /demo/cafe/recipes, no backend. */
export function RecipeManagementModal({ open, onClose }: RecipeManagementModalProps) {
  const [recipeList, setRecipeList] = useState<ManagedRecipe[]>(seedRecipes);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeForm>(emptyForm);

  useEffect(() => {
    if (open) setMode('list');
  }, [open]);

  function startEdit(recipe: ManagedRecipe) {
    setEditingId(recipe.id);
    setForm(recipeToForm(recipe));
    setMode('edit');
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setMode('add');
  }

  function handleSave() {
    if (mode === 'edit' && editingId) {
      setRecipeList((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...formToRecipe(form) } : r)));
    } else {
      setRecipeList((prev) => [...prev, { id: `demo-recipe-${Date.now()}`, ...formToRecipe(form) }]);
    }
    setMode('list');
  }

  function removeRecipe(id: string) {
    setRecipeList((prev) => prev.filter((r) => r.id !== id));
  }

  const title = mode === 'list' ? 'レシピ管理' : mode === 'add' ? 'レシピを追加' : 'レシピを編集';

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={mode === 'list' ? 760 : 640}>
      {mode === 'list' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: demoColors.textMuted }}>
              デモ用のレシピ一覧です。追加・編集・削除はこの画面内のみで有効です。
            </p>
            <button type="button" style={{ ...buttonPrimary, padding: '8px 14px', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={startAdd}>
              レシピを追加
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden' }}>
            {recipeList.map((recipe) => (
              <div
                key={recipe.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: demoColors.surfaceElevated,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: 6,
                    background: demoColors.surface,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  {recipe.image ? (
                    <img src={recipe.image} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    '🍽️'
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: demoColors.textPrimary,
                        minWidth: 0,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {recipe.name}
                    </span>
                    {recipe.contentKind === 'instruction' ? (
                      <span style={{ ...statusBadgeStyle('published'), flexShrink: 0 }}>インストラクション</span>
                    ) : null}
                    <span style={{ ...statusBadgeStyle(recipe.status), flexShrink: 0 }}>
                      {recipe.status === 'published' ? '公開' : '下書き'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: demoColors.textMuted,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {recipe.description}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => startEdit(recipe)} style={rowActionButtonStyle(false)}>
                    編集
                  </button>
                  <button type="button" onClick={() => removeRecipe(recipe.id)} style={rowActionButtonStyle(true)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <div>
            <label style={fieldLabel}>コンテンツ種別</label>
            <select
              value={form.contentKind}
              onChange={(e) => setForm((f) => ({ ...f, contentKind: e.target.value as RecipeContentKind }))}
              style={input}
            >
              <option value="recipe">レシピ</option>
              <option value="instruction">インストラクション</option>
            </select>
          </div>
          <div>
            <label style={fieldLabel}>レシピ名</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={input} />
          </div>
          <div>
            <label style={fieldLabel}>短い説明</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={fieldLabel}>写真</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <input
                value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="/demo/cafe/recipes/example.png"
                style={{ ...input, flex: 1, minWidth: 0 }}
              />
              <div
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 6,
                  background: demoColors.surfaceElevated,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                {form.image ? (
                  <img src={form.image} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '🍽️'
                )}
              </div>
            </div>
          </div>
          <div>
            <label style={fieldLabel}>材料（1行に1つ）</label>
            <textarea
              value={form.ingredientsText}
              onChange={(e) => setForm((f) => ({ ...f, ingredientsText: e.target.value }))}
              rows={3}
              placeholder={'牛乳 180ml\nエスプレッソ 1shot'}
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={fieldLabel}>作り方（1行に1手順）</label>
            <textarea
              value={form.stepsText}
              onChange={(e) => setForm((f) => ({ ...f, stepsText: e.target.value }))}
              rows={4}
              placeholder={'エスプレッソを抽出する\nミルクをスチームする'}
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gap: 10,
              minWidth: 0,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${demoColors.border}`,
              background: demoColors.surfaceElevated,
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, color: demoColors.textMuted }}>
              補足・作り方メモ（任意）。ドリンク/フードのどのレシピにも追加できます。空欄のままなら公開レシピ詳細には表示されません。
            </p>
            <div>
              <label style={fieldLabel}>補足タイトル</label>
              <input
                value={form.memoTitle}
                onChange={(e) => setForm((f) => ({ ...f, memoTitle: e.target.value }))}
                placeholder="例: 抹茶液の作り方"
                style={input}
              />
            </div>
            <div>
              <label style={fieldLabel}>補足内容</label>
              <textarea
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                rows={3}
                placeholder="例: 小さなカップに抹茶パウダー7gを入れ、80℃のお湯30gを加えてダマがなくなるまで混ぜる。"
                style={{ ...input, resize: 'vertical' }}
              />
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: demoColors.textMuted }}>
              以下は公開EN画面用のデモ翻訳フィールドです（任意・手入力の静的テキストのみ、自動翻訳ではありません）。
            </p>
            <div>
              <label style={fieldLabel}>補足タイトル（英語）</label>
              <input
                value={form.memoTitleEn}
                onChange={(e) => setForm((f) => ({ ...f, memoTitleEn: e.target.value }))}
                placeholder="e.g. How to make the matcha liquid"
                style={input}
              />
            </div>
            <div>
              <label style={fieldLabel}>補足内容（英語）</label>
              <textarea
                value={form.memoEn}
                onChange={(e) => setForm((f) => ({ ...f, memoEn: e.target.value }))}
                rows={3}
                placeholder="e.g. Put 7g of matcha powder in a small cup..."
                style={{ ...input, resize: 'vertical' }}
              />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>ステータス</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as RecipeStatus }))}
              style={input}
            >
              <option value="published">公開</option>
              <option value="draft">下書き</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" style={buttonSecondary} onClick={() => setMode('list')}>
              キャンセル
            </button>
            <button type="button" style={buttonPrimary} onClick={handleSave}>
              保存
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
