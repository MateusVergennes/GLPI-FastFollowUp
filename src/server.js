import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
import path from 'node:path';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve('public')));

/* ------------------------------------------------------------------
   USUÁRIOS do GLPI 
   ------------------------------------------------------------------ */
const AUTHORS = {
    vini: {          
        id: 1291,      
        fullName: 'Vinicius',
        defaultMsg: 'Chamado tratado por Vini – follow-up automático.'
    },
    leandro: {
        id: 1262,      
        fullName: 'Leandro',
        defaultMsg: 'Chamado tratado por Leandro – follow-up automático.'
    },
    luiz: {
        id: 1707,      
        fullName: 'Luis',
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
            const userString = `${fullName} (${userId})`;

            const slaDateTime = sla?.trim() ? `${sla.trim()} 08:00:00` : null;

            for (const t of tickets) {
                /* 1. Atualiza SLA se pedido e se estiver atrasado */
                if (slaDateTime) {
                    await conn.query(
                        `UPDATE glpi_tickets
               SET time_to_resolve = ?
             WHERE id = ?
               AND time_to_resolve < NOW()`,
                        [slaDateTime, t]
                    );
                }

                /* 2. Follow-up */
                const [fRes] = await conn.query(followupSQL, [
                    t, userId, htmlMsg
                ]);
                const followupId = fRes.insertId;

                /* 3. Log */
                await conn.query(logSQL, [t, userString, followupId]);

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

app.listen(process.env.PORT, () =>
    console.log(`🚀  API pronta em http://localhost:${process.env.PORT}`)
);