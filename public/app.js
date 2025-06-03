const DEFAULTS = {
  vini:    'Chamado tratado por Vini – follow-up automático.',
  leandro: 'Chamado tratado por Leandro – follow-up automático.',
  luiz:    'Chamado tratado por Luiz – follow-up automático.'
};;
const AUTHOR_OPTIONS = Object.keys(DEFAULTS)
    .map(a => `<option value="${a}">${a[0].toUpperCase() + a.slice(1)}</option>`)
    .join('');

const groupsDiv = document.getElementById('groups');
const addGroupBtn = document.getElementById('add-group');
const submitAll = document.getElementById('submit-all');

addGroupBtn.onclick = addGroup;
submitAll.onclick = sendAll;

addGroup();   

function addGroup() {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `
    <section>
      <h2>Chamados</h2>
      <div class="tickets-box"></div>
      <button class="primary add-ticket">+ ticket</button>
    </section>

    <section>
      <h2>Responsável</h2>
      <select class="author">${AUTHOR_OPTIONS}</select>
    </section>

    <section>
      <h2>Comentário</h2>
      <textarea class="comment" rows="5" placeholder=""></textarea>
    </section>

    <section>
      <h2>Novo SLA<br><small style="font-size:.8em;color:#999">(opcional)</small></h2>
      <input type="date" class="sla-date" value="2025-06-30">
    </section>

    <button class="danger remove-group">×</button>
  `;

    const ticketsBox = g.querySelector('.tickets-box');
    const addTicketBtn = g.querySelector('.add-ticket');
    const authorSel = g.querySelector('.author');
    const commentTA = g.querySelector('.comment');

    addTicketRow(ticketsBox);
    authorSel.onchange = () => commentTA.placeholder = DEFAULTS[authorSel.value];
    authorSel.dispatchEvent(new Event('change'));
    addTicketBtn.onclick = () => addTicketRow(ticketsBox);
    g.querySelector('.remove-group').onclick = () => g.remove();

    groupsDiv.appendChild(g);
}

function addTicketRow(container) {
    const row = document.createElement('div');
    row.className = 'ticket-row';
    row.innerHTML = `
    <input type="number" placeholder="ID">
    <button title="remover">−</button>`;
    row.querySelector('button').onclick = () => row.remove();
    container.appendChild(row);
}

async function sendAll() {
    const payload = [];

    groupsDiv.querySelectorAll('.group').forEach(g => {
        const tickets = [...g.querySelectorAll('.ticket-row input')]
            .map(i => parseInt(i.value, 10))
            .filter(Number.isInteger);

        if (!tickets.length) return;

        payload.push({
            tickets,
            author: g.querySelector('.author').value,
            comment: g.querySelector('.comment').value
                || DEFAULTS[g.querySelector('.author').value],
            sla: g.querySelector('.sla-date').value || null
        });
    });

    if (!payload.length) {
        alert('Nada para enviar 😅');
        return;
    }

    submitAll.disabled = true;
    try {
        const res = await fetch('/followups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (res.ok) {
            alert(`👍 ${json.inserted} follow-ups registrados!`);
            groupsDiv.innerHTML = '';
            addGroup();
        } else {
            alert('Erro: ' + json.error);
        }
    } catch (e) {
        alert('Falha na comunicação com o servidor.');
    } finally {
        submitAll.disabled = false;
    }
}