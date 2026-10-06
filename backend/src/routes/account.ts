import { Router } from 'express';
import { getAuth, requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`public.${tableName}`],
  );
  return rows[0]?.exists ?? false;
}

router.delete('/delete-account', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const familyId = auth.familyId;
    let otherFamilyUsers = 0;

    if (familyId) {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM users
          WHERE family_id = $1
            AND id <> $2`,
        [familyId, auth.userId],
      );
      otherFamilyUsers = Number(countResult.rows[0]?.count ?? '0');
    }

    // Elimina i dati personali/mutabili direttamente associati all'account.
    if (await tableExists('otp_requests')) {
      await client.query(`DELETE FROM otp_requests WHERE user_id = $1`, [auth.userId]);
    }

    await client.query(`DELETE FROM documents WHERE uploaded_by_user_id = $1`, [auth.userId]);
    await client.query(`DELETE FROM expenses WHERE paid_by_user_id = $1`, [auth.userId]);
    await client.query(`DELETE FROM swap_requests WHERE requested_by = $1`, [auth.userId]);
    await client.query(`DELETE FROM parents WHERE id = $1`, [auth.userId]);

    const deletion = await client.query(
      `DELETE FROM users
        WHERE id = $1`,
      [auth.userId],
    );

    if (deletion.rowCount !== 1) {
      throw new ApiError(404, 'Account non trovato', 'ACCOUNT_NOT_FOUND');
    }

    // Se era l'ultimo account della famiglia, eliminiamo tutti i dati familiari mutabili.
    // Il record families viene mantenuto soltanto come contenitore anonimo per gli archivi
    // append-only (messaggi/report), così da non violare l'immutabilità probatoria.
    if (familyId && otherFamilyUsers === 0) {
      await client.query(`DELETE FROM documents WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM expenses WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM swap_requests WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM custody_turns WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM children WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM parents WHERE family_id = $1`, [familyId]);
      await client.query(`DELETE FROM family_subscriptions WHERE family_id = $1`, [familyId]);

      if (await tableExists('family_members')) {
        await client.query(`DELETE FROM family_members WHERE family_id = $1`, [familyId]);
      }
      if (await tableExists('events')) {
        await client.query(`DELETE FROM events WHERE family_id = $1`, [familyId]);
      }
      if (await tableExists('agreements')) {
        await client.query(`DELETE FROM agreements WHERE family_id = $1`, [familyId]);
      }

      await client.query(
        `UPDATE families
            SET name = 'Famiglia eliminata',
                invite_code = 'DELETED-' || id::text
          WHERE id = $1`,
        [familyId],
      );
    }

    await client.query('COMMIT');

    res.json({
      deleted: true,
      retainedLegalRecords: {
        immutableMessages: true,
        reportExportHashes: true,
      },
      note: 'I dati personali e i dati mutabili dell’account sono stati eliminati. I soli registri append-only necessari a preservare integrità e tracciabilità restano scollegati dall’account tramite identificativi opachi.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
