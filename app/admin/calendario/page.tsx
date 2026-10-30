import { requireStaff } from '@/lib/data';
import { ConfirmButton } from '@/components/ConfirmButton';
import { addCalendarDate, addMessage, deleteCalendarDate, deleteMessage, toggleMessage } from '../actions';

export const dynamic = 'force-dynamic';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ENTITIES = ['Preto Velho', 'Caboclo', 'Exu', 'Pombagira', 'Baiano', 'Marinheiro', 'Boiadeiro', 'Erê', 'Cigano', 'Malandro', 'Oxalá', 'Iemanjá', 'Ogum', 'Oxum', 'Xangô', 'Iansã', 'Oxóssi', 'Nanã'];

export default async function CalendarAdmin() {
  const { supabase } = await requireStaff();
  const [{ data: dates }, { data: messages }] = await Promise.all([
    supabase.from('calendar_dates').select('id, month, day, title, description, greeting').order('month').order('day'),
    supabase.from('daily_messages').select('id, entity, text, active').order('entity').order('created_at'),
  ]);
  return (
    <div className="stack" style={{ ['--gap' as string]: '24px' }}>
      <h1 className="page-title">Calendário e mensagens</h1>

      <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-datas">
        <h2 id="h-datas" style={{ fontSize: 18 }}>Datas da religião</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Aparecem na agenda de todos e no topo da página inicial no dia. Ajuste conforme os fundamentos da casa.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Dia</th><th scope="col">Data</th><th scope="col">Saudação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{(dates ?? []).map((d) => (
              <tr key={d.id}>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{d.day} {MONTHS[d.month - 1]}</td>
                <td><b>{d.title}</b>{d.description ? <><br /><span className="muted">{d.description}</span></> : null}</td>
                <td>{d.greeting}</td>
                <td><form action={deleteCalendarDate}><input type="hidden" name="id" value={d.id} /><ConfirmButton className="btn btn-ghost btn-danger" message={`Remover “${d.title}”?`}>Remover</ConfirmButton></form></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <form action={addCalendarDate} className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 80 }}>Dia<input name="day" type="number" min={1} max={31} required /></label>
          <label className="field" style={{ width: 110 }}>Mês<select name="month" required>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 200px' }}>Nome<input name="title" maxLength={120} required placeholder="Ex.: Festa de Ogum da casa" /></label>
          <label className="field" style={{ flex: '1 1 200px' }}>Descrição<input name="description" maxLength={300} /></label>
          <label className="field" style={{ width: 160 }}>Saudação<input name="greeting" maxLength={80} placeholder="Ogunhê!" /></label>
          <button className="btn btn-primary" type="submit">Adicionar data</button>
        </form>
      </section>

      <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-msgs">
        <h2 id="h-msgs" style={{ fontSize: 18 }}>Mensagens do dia</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Uma delas aparece, sorteada, no topo da página inicial. Escreva no jeito de falar de cada linha.</p>
        <form action={addMessage} className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 180 }}>De quem<select name="entity" required>{ENTITIES.map((e) => <option key={e}>{e}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 320px' }}>Mensagem<textarea name="text" minLength={10} maxLength={600} required rows={2} style={{ minHeight: 60 }} /></label>
          <button className="btn btn-primary" type="submit">Adicionar mensagem</button>
        </form>
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '6px' }}>
          {(messages ?? []).map((m) => (
            <li key={m.id} className="row" style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px', alignItems: 'flex-start', opacity: m.active ? 1 : 0.55 }}>
              <span className="badge" style={{ flex: 'none' }}>{m.entity}</span>
              <span style={{ flex: '1 1 300px', fontSize: 13.5 }}>{m.text}</span>
              <form action={toggleMessage}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="active" value={m.active ? '0' : '1'} />
                <button className="btn btn-ghost" type="submit" style={{ minHeight: 32 }}>{m.active ? 'Pausar' : 'Ativar'}</button></form>
              <form action={deleteMessage}><input type="hidden" name="id" value={m.id} /><ConfirmButton className="btn btn-ghost btn-danger" message="Apagar esta mensagem?">Apagar</ConfirmButton></form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
