'use client';

// Pede confirmação antes de ações sem volta (excluir)
export function BulkSubmit() {
  return (
    <button className="btn" type="submit" onClick={(e) => {
      const form = e.currentTarget.form;
      const action = (form?.elements.namedItem('action') as HTMLSelectElement | null)?.value;
      const count = form ? form.querySelectorAll('input[name=ids]:checked').length : 0;
      if (action === 'delete' && !confirm(`Excluir definitivamente ${count} material(is)? Os arquivos também serão apagados. Isso não pode ser desfeito.`)) e.preventDefault();
    }}>Aplicar</button>
  );
}

export function SelectAll() {
  return (
    <input type="checkbox" aria-label="Selecionar todos" onChange={(e) => {
      e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name=ids]').forEach((i) => { i.checked = e.currentTarget.checked; });
    }} />
  );
}

export function DeleteButton({ title }: { title: string }) {
  return (
    <button className="btn btn-danger" type="submit" onClick={(e) => {
      if (!confirm(`Excluir “${title}” definitivamente? Os arquivos também serão apagados. Isso não pode ser desfeito.`)) e.preventDefault();
    }}>Excluir material</button>
  );
}
