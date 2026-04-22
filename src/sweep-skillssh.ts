const SKILLS_SH_API = "https://skills.sh/api/search";
const MAX_PREFIXES_PER_RUN = 25; // skills.sh rate limit: 30 req/min, keep margin
const TOTAL_PREFIXES = 676; // 26 * 26 = aa..zz

type SkillsShSkill = {
  id: string;       // e.g. "anthropics/skills/webapp-testing"
  skillId: string;   // e.g. "webapp-testing"
  name: string;      // display name
  installs: number;
  source: string;    // e.g. "anthropics/skills"
};

type SkillsShResponse = {
  skills: SkillsShSkill[];
};

type SweepState = {
  cursor: string | null;
  captured_at: string | null;
  pages_done: number;
  extra_state: string | null;
};

type ExtraState = {
  prefix_index: number;
};

export type SweepResult = {
  started_at_utc: string;
  captured_at: string;
  prefixes_this_run: number;
  skills_this_run: number;
  prefix_index: number;
  complete_for_today: boolean;
  duration_ms: number;
};

function getPrefix(index: number): string {
  const a = Math.floor(index / 26);
  const b = index % 26;
  return String.fromCharCode(97 + a) + String.fromCharCode(97 + b);
}

async function fetchSkillsSh(query: string): Promise<SkillsShSkill[]> {
  const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "skill-history.com crawler (+https://skill-history.com; contact: gavin.lin.asd@gmail.com)",
    },
  });
  if (!res.ok) {
    throw new Error(`skills.sh HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as SkillsShResponse;
  return body.skills ?? [];
}

async function loadState(db: D1Database): Promise<SweepState> {
  const row = await db
    .prepare(
      "SELECT cursor, captured_at, pages_done, extra_state FROM sweep_state_v2 WHERE source = 'skillssh'",
    )
    .first<SweepState>();
  return row ?? { cursor: null, captured_at: null, pages_done: 0, extra_state: null };
}

async function saveState(
  db: D1Database,
  capturedAt: string,
  pagesDone: number,
  extraState: ExtraState,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sweep_state_v2
       SET cursor = NULL, captured_at = ?, pages_done = ?, extra_state = ?, updated_at = ?
       WHERE source = 'skillssh'`,
    )
    .bind(capturedAt, pagesDone, JSON.stringify(extraState), Date.now())
    .run();
}

export async function runSkillsshSweep(db: D1Database): Promise<SweepResult> {
  const started = Date.now();
  const startedAtUtc = new Date(started).toISOString();
  const today = startedAtUtc.slice(0, 10);

  const state = await loadState(db);
  const sameDay = state.captured_at === today;

  let extra: ExtraState = { prefix_index: 0 };
  if (sameDay && state.extra_state) {
    try {
      extra = JSON.parse(state.extra_state) as ExtraState;
    } catch {
      extra = { prefix_index: 0 };
    }
  } else if (!sameDay) {
    // New day: reset
    extra = { prefix_index: 0 };
  }

  // Already complete for today
  if (sameDay && extra.prefix_index >= TOTAL_PREFIXES) {
    console.log(`[skillssh-sweep] already complete for ${today} — no-op`);
    return {
      started_at_utc: startedAtUtc,
      captured_at: today,
      prefixes_this_run: 0,
      skills_this_run: 0,
      prefix_index: extra.prefix_index,
      complete_for_today: true,
      duration_ms: 0,
    };
  }

  console.log(
    `[skillssh-sweep] start captured_at=${today} prefix_index=${extra.prefix_index} same_day=${sameDay}`,
  );

  let prefixesThisRun = 0;
  let skillsThisRun = 0;
  // Deduplicate skills seen across prefixes within this run
  const seenIds = new Set<string>();

  try {
    while (
      prefixesThisRun < MAX_PREFIXES_PER_RUN &&
      extra.prefix_index < TOTAL_PREFIXES
    ) {
      const prefix = getPrefix(extra.prefix_index);
      const skills = await fetchSkillsSh(prefix);
      prefixesThisRun++;
      extra.prefix_index++;

      if (skills.length === 0) continue;

      const stmts: D1PreparedStatement[] = [];
      for (const skill of skills) {
        if (seenIds.has(skill.id)) continue;
        seenIds.add(skill.id);

        // handle = first part of source (before /), e.g. "anthropics" from "anthropics/skills"
        const handle = skill.source.split("/")[0];
        const slug = skill.skillId;

        // Upsert skill
        stmts.push(
          db
            .prepare(
              `INSERT INTO skills (handle, slug, display_name, source, source_id, github_repo)
               VALUES (?, ?, ?, 'skillssh', ?, ?)
               ON CONFLICT(handle, slug) DO UPDATE SET
                 source_id = COALESCE(skills.source_id, excluded.source_id),
                 github_repo = COALESCE(skills.github_repo, excluded.github_repo)`,
            )
            .bind(handle, slug, skill.name, skill.id, skill.source),
        );

        // Write snapshot
        stmts.push(
          db
            .prepare(
              `INSERT INTO snapshots_sh (skill_id, captured_at, installs)
               VALUES ((SELECT id FROM skills WHERE handle = ? AND slug = ?), ?, ?)
               ON CONFLICT(skill_id, captured_at) DO UPDATE SET installs = excluded.installs`,
            )
            .bind(handle, slug, today, skill.installs),
        );

        skillsThisRun++;
      }

      if (stmts.length > 0) {
        await db.batch(stmts);
      }
    }
  } catch (err) {
    console.error(
      `[skillssh-sweep] error after prefixes_this_run=${prefixesThisRun} — persisting state and rethrowing`,
      err,
    );
    await saveState(db, today, prefixesThisRun, extra);
    throw err;
  }

  const completeForToday = extra.prefix_index >= TOTAL_PREFIXES;
  await saveState(db, today, prefixesThisRun, extra);

  const result: SweepResult = {
    started_at_utc: startedAtUtc,
    captured_at: today,
    prefixes_this_run: prefixesThisRun,
    skills_this_run: skillsThisRun,
    prefix_index: extra.prefix_index,
    complete_for_today: completeForToday,
    duration_ms: Date.now() - started,
  };

  console.log(
    `[skillssh-sweep] done prefixes_this_run=${prefixesThisRun} skills_this_run=${skillsThisRun} prefix_index=${extra.prefix_index} complete=${completeForToday} duration_ms=${result.duration_ms}`,
  );

  return result;
}
