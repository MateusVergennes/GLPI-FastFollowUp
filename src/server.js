import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
import path from 'node:path';
import fs from 'node:fs/promises';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve('public')));

/* ------------------------------------------------------------------
   USUÁRIOS do GLPI
   ------------------------------------------------------------------ */
const AUTHORS = {
    vini: {
        id: 1291, fullName: 'Vinicius',
        defaultMsg: 'Chamado tratado por Vini – follow-up automático.'
    },
    leandro: {
        id: 1262, fullName: 'Leandro',
        defaultMsg: 'Chamado tratado por Leandro – follow-up automático.'
    },
    luiz: {
        id: 1707, fullName: 'Luis',
        defaultMsg: 'Chamado tratado por Luiz – follow-up automático.'
    }
};

/* ---------- pool MySQL ---------- */
const pool = mysql.createPool({
    host: process.env.DB_GLPI_HOST,
    port: process.env.DB_GLPI_PORT,
    user: process.env.DB_GLPI_USERNAME,
    password: process.env.DB_GLPI_PASSWORD,
    database: process.env.DB_GLPI_DATABASE,
    waitForConnections: true,
    connectionLimit: 10
});

/* -----------------------  POST /followups  ----------------------- */
app.post('/followups', async (req, res) => {
    const groups = Array.isArray(req.body) ? req.body : [];

    if (
        !groups.length ||
        !groups.every(
            g =>
                Array.isArray(g.tickets) &&
                g.tickets.length &&
                AUTHORS[g.author]
        )
    )
        return res.status(400).json({ error: 'Payload inválido' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const followupSQL = `
      INSERT INTO glpi_itilfollowups
        (items_id, itemtype, date,
         users_id, users_id_editor,
         content, is_private, requesttypes_id,
         date_mod, date_creation, timeline_position,
         sourceitems_id, sourceof_items_id, ignore_trigger)
      VALUES
        (?, 'Ticket', NOW(),
         ?, 0,
         ?, 0, 1,
         NOW(), NOW(), 1,
         0, 0, 0);
    `;

        const logSQL = `
      INSERT INTO glpi_logs
        (itemtype, items_id, itemtype_link, linked_action,
         user_name, date_mod, id_search_option,
         old_value, new_value)
      VALUES
        ('Ticket', ?, 'ITILFollowup', 17,
         ?, NOW(), 0,
         '', ?);
    `;

        let total = 0;

        for (const { tickets, author, comment, sla } of groups) {
            const { id: userId, fullName, defaultMsg } = AUTHORS[author];
            const msg = comment?.trim() || defaultMsg;
            const htmlMsg = `<p>${msg}</p>`;
            const userLabel = `${fullName} (${userId})`;
            const slaDate = sla?.trim() ? `${sla.trim()} 08:00:00` : null;

            for (const t of tickets) {
                /* Ajuste de SLA (se necessário) */
                if (slaDate) {
                    await conn.query(
                        `UPDATE glpi_tickets
               SET time_to_resolve = ?
             WHERE id = ?
               AND time_to_resolve < NOW()`,
                        [slaDate, t]
                    );
                }

                /* Follow-up */
                const [fRes] = await conn.query(followupSQL, [t, userId, htmlMsg]);
                const followupId = fRes.insertId;

                /* Log */
                await conn.query(logSQL, [t, userLabel, followupId]);

                /* Salva no processedTickets.txt (evita duplicar) */
                const txtPath = path.resolve('processedTickets.txt');
                await fs.appendFile(txtPath, `${t}\n`).catch(() => { });
                total++;
            }
        }

        await conn.commit();
        res.json({ status: 'ok', inserted: total });
    } catch (e) {
        await conn.rollback();
        console.error(e);
        res.status(500).json({ error: 'Falha ao gravar follow-ups.' });
    } finally {
        conn.release();
    }
});

/* -----------------------  GET /stats  ----------------------- */
app.get('/stats', async (_req, res) => {
    const conn = await pool.getConnection();
    try {
        /* 1. tickets já comentados */
        const txtPath = path.resolve('processedTickets.txt');
        const txt = await fs.readFile(txtPath, 'utf8').catch(() => '');
        const doneIds = txt.split(/\r?\n/)
            .map(n => parseInt(n, 10))
            .filter(Number.isInteger);

        /* 2. tickets abertos */
        const [openRows] = await conn.query(
            `SELECT id, name, date, time_to_resolve
         FROM glpi_tickets
        WHERE status NOT IN (5,6)`          // 5=Resolvido, 6=Fechado
        );

        const openIds = openRows.map(t => t.id);
        const remainingIds = openIds.filter(id => !doneIds.includes(id));
        const processedCount = doneIds.length;
        const remainingCount = remainingIds.length;

        /* 3. últimas 2 semanas – volume diário de abertura */
        const [daily] = await conn.query(
            `SELECT DATE(date) AS d, COUNT(*) AS c
         FROM glpi_tickets
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
     GROUP BY d
     ORDER BY d`
        );
        const totalOpened14 = daily.reduce((s, r) => s + r.c, 0);
        const avgOpened = totalOpened14 / 14;          // média/dia

        /* 4. estimativas de dias */
        const DAILY_CAPACITY = 20;                         // 10 + 10
        const daysFixedCap = Math.ceil(remainingCount / DAILY_CAPACITY);

        const net = DAILY_CAPACITY - avgOpened;            // saldo diário
        const daysWithInflux =
            net > 0 ? Math.ceil(remainingCount / net) : null; // null = infinito

        /* 5. detalhamento – tickets já comentados */
        let processedTickets = [];
        if (doneIds.length) {
            const [pt] = await conn.query(
                `SELECT id, name, date, time_to_resolve
           FROM glpi_tickets
          WHERE id IN (${doneIds.join(',')})`
            );
            processedTickets = pt;
        }

        /* 6. recomendação diária */
        const oldest10 = remainingIds.sort((a, b) => a - b).slice(0, 10);
        const newest10 = remainingIds.sort((a, b) => b - a).slice(0, 10);

        const [oldRows] = oldest10.length
            ? await conn.query(
                `SELECT id, name, date, time_to_resolve
             FROM glpi_tickets
            WHERE id IN (${oldest10.join(',')})`)
            : [[]];

        const [newRows] = newest10.length
            ? await conn.query(
                `SELECT id, name, date, time_to_resolve
             FROM glpi_tickets
            WHERE id IN (${newest10.join(',')})`)
            : [[]];

        res.json({
            processedCount,
            remainingCount,
            daysFixedCap,      
            daysWithInflux,    
            avgOpened,         
            processedTickets,
            dailyOpen: daily,
            recommendOld: oldRows,
            recommendNew: newRows
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Falha ao gerar estatísticas.' });
    } finally {
        conn.release();
    }
});

app.listen(process.env.PORT, () =>
    console.log(`🚀  API pronta em http://localhost:${process.env.PORT}`)
);