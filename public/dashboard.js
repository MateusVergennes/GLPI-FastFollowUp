/* ---------- utilidades ---------- */
const GLPI_URL = 'https://web.liveoficial.ind.br/front/ticket.form.php?id=';
const DAILY_CAP = 20;
const WEEKDAY_CO = '#004dce';   // azul D1
const WEEKEND_CO = '#ffa500';   // laranja
const THREE_D_MS = 3 * 24 * 60 * 60 * 1000;

const fmtDate = d => d.toLocaleDateString('pt-BR');

function ticketLink(id, label) {
    const a = document.createElement('a');
    a.href = GLPI_URL + id;
    a.target = '_blank';
    a.textContent = label;
    return a;
}

function isRecent(dateStr) {
    return (Date.now() - new Date(dateStr).getTime()) <= THREE_D_MS;
}

/* ---------- carregamento principal ---------- */
(async () => {
    try {
        const res = await fetch('/stats');
        const stats = await res.json();

        /* === Resumo (sem alterações) === */
        const totals = document.getElementById('totals-body');
        const influxTxt = stats.daysWithInflux === null ? '∞' : stats.daysWithInflux;
        totals.innerHTML = `
      <p><strong>Tickets já comentados:</strong> ${stats.processedCount}</p>
      <p><strong>Abertos sem comentário:</strong> ${stats.remainingCount}</p>
      <p>
        <strong>Dias p/ zerar (capacidade fixa):</strong> ${stats.daysFixedCap}
        <span class="info" title="dias = ceil(pendentes ÷ ${DAILY_CAP})">ℹ️</span>
      </p>
      <p>
        <strong>Dias p/ zerar (média ${stats.avgOpened.toFixed(1)} aberturas/dia):</strong>
        ${influxTxt}
        <span class="info"
              title="dias = ceil(pendentes ÷ (${DAILY_CAP} − média_14d))\n(se saldo ≤ 0 ⇒ infinito)">ℹ️</span>
      </p>
    `;

        /* === Tickets comentados (sem alterações) === */
        document.getElementById('processed-count').textContent =
            `(${stats.processedCount})`;
        const tbody = document.querySelector('#accordion-processed tbody');
        stats.processedTickets.forEach(t => {
            const tr = document.createElement('tr');
            tr.appendChild(document.createElement('td'))
                .appendChild(ticketLink(t.id, t.id));
            tr.appendChild(document.createElement('td')).textContent = t.name;
            tr.appendChild(document.createElement('td'))
                .textContent = fmtDate(new Date(t.date));
            tr.appendChild(document.createElement('td'))
                .textContent = t.time_to_resolve
                    ? fmtDate(new Date(t.time_to_resolve))
                    : '—';
            tbody.appendChild(tr);
        });

        /* === Gráfico de aberturas (linha) === */
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const labels = [];
        const data = [];
        const ptColors = [];

        for (let i = 13; i >= 0; i--) {
            const d = new Date(today); d.setDate(today.getDate() - i);
            const iso = d.toISOString().slice(0, 10);
            const row = stats.dailyOpen.find(o => o.d.slice(0, 10) === iso);
            const cnt = row ? row.c : 0;

            labels.push(fmtDate(d));
            data.push(cnt);
            ptColors.push((d.getDay() === 0 || d.getDay() === 6) ? WEEKEND_CO : WEEKDAY_CO);
        }

        new Chart(document.getElementById('open-chart').getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Abertos (14 dias)',
                    data,
                    borderColor: WEEKDAY_CO,
                    backgroundColor: 'transparent',
                    tension: .3,
                    pointBackgroundColor: ptColors,
                    pointBorderColor: ptColors
                }]
            },
            options: {
                plugins: { legend: { display: true } },
                responsive: true,
                scales: { y: { beginAtZero: true, precision: 0 } }
            }
        });

        /* === Função para preencher listas com ícone “novo” === */
        function fillList(listElem, rows, ascending = true) {
            rows.sort((a, b) => ascending ? a.id - b.id : b.id - a.id);
            rows.forEach(t => {
                const li = document.createElement('li');

                /* Link (ID – título) */
                li.appendChild(ticketLink(t.id, `${t.id} – ${t.name}`));

                /* Ícone “novo” caso recente */
                if (isRecent(t.date)) {
                    const icon = document.createElement('span');
                    icon.className = 'new-icon';
                    icon.textContent = '🆕';
                    icon.title = 'chamado criado nos últimos 3 dias';
                    li.appendChild(icon);
                }

                listElem.appendChild(li);
            });
        }

        /* === Recomendações === */
        fillList(document.getElementById('old-list'), stats.recommendOld, true);
        fillList(document.getElementById('new-list'), stats.recommendNew, false);

    } catch (e) {
        alert('Falha ao carregar estatísticas.');
        console.error(e);
    }
})();