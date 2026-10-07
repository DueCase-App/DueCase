CREATE OR REPLACE FUNCTION duecase_custody(p_family UUID, p_date DATE)
RETURNS TABLE("childId" UUID,"childName" TEXT,"custodianRole" TEXT,overnight BOOLEAN,notes TEXT,source TEXT)
LANGUAGE SQL STABLE AS $$
WITH kids AS (
       SELECT id, display_name FROM children WHERE family_id = p_family
     ), approved_exception AS (
       SELECT DISTINCT ON (child_id) child_id, custodian_role, overnight, notes
         FROM custody_exceptions
        WHERE family_id = p_family AND custody_date = p_date::date AND status = 'approved'
        ORDER BY child_id, reviewed_at DESC NULLS LAST, created_at DESC
     ), general_turn AS (
       SELECT custodian_role, notes
         FROM custody_turns
        WHERE family_id = p_family AND custody_date = p_date::date
        ORDER BY updated_at DESC LIMIT 1
     ), alternating_weekend AS (
       SELECT child_id,
              CASE
                WHEN (((FLOOR(((p_date::date - anchor_saturday)::numeric) / 7)::int % 2) + 2) % 2) = 0
                  THEN first_weekend_role
                ELSE second_weekend_role
              END AS custodian_role,
              overnight,
              notes
         FROM custody_alternating_weekends
        WHERE family_id = p_family
          AND EXTRACT(ISODOW FROM p_date::date)::int IN (6, 7)
     ), weekly AS (
       SELECT child_id, custodian_role, overnight, notes
         FROM custody_weekly_patterns
        WHERE family_id = p_family AND weekday = EXTRACT(ISODOW FROM p_date::date)::int
     )
     SELECT k.id AS "childId", k.display_name AS "childName",
            COALESCE(e.custodian_role, gt.custodian_role, aw.custodian_role, w.custodian_role) AS "custodianRole",
            COALESCE(e.overnight, aw.overnight, w.overnight, TRUE) AS overnight,
            COALESCE(e.notes, gt.notes, aw.notes, w.notes) AS notes,
            CASE WHEN e.child_id IS NOT NULL THEN 'exception'
                 WHEN gt.custodian_role IS NOT NULL THEN 'calendar'
                 WHEN aw.child_id IS NOT NULL THEN 'alternating_weekend'
                 WHEN w.child_id IS NOT NULL THEN 'weekly_pattern'
                 ELSE 'undefined' END AS source
       FROM kids k
       LEFT JOIN approved_exception e ON e.child_id = k.id
       LEFT JOIN alternating_weekend aw ON aw.child_id = k.id
       LEFT JOIN weekly w ON w.child_id = k.id
       LEFT JOIN general_turn gt ON TRUE
      ORDER BY k.display_name;
$$;
