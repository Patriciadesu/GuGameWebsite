# HamsterQuest Star Master migration — 2026-08-15

## Result

GuGame's active Skill Constellation catalog now uses HamsterQuest as the Quest-content system of record. GuGame retains only Star structure and progression fields (map ownership, coordinates, links, costs, labels, and remote IDs).

| Catalog object | Migrated | Verification |
| --- | ---: | --- |
| Discipline Houses | 3 | Exact names and IDs verified |
| Active Topic Tags | 19 | Every active Topic linked |
| Active Topic Stars / Quests | 80 | 80 unique IDs, all available through the API |
| Local Quest-content documents | 0 | For the 80 migrated active Topic Stars |

House links:

- Game Art: `6a8053ddb95d21d916138d5a`
- System: `6a8053deb95d21d916138d5b`
- Map & Scene: `6a8053deb95d21d916138d5c`

The remote catalog contained 40 Quests before this migration and 120 afterward. The 80 GuGame Quest IDs are unique, so the migration did not create duplicate target Quests.

## Runtime behavior

- Skill Constellation reads hydrate title, description, cover image, YouTube/Drive links, and Steps from the HamsterQuest Star Master API.
- A new Star inside an active Topic creates and verifies its HamsterQuest Quest before the local structural Star is saved.
- Editing Quest content merges the submitted changes onto the authoritative remote Quest. Unedited images, links, and Steps are preserved.
- Structural fields continue to live in GuGame.
- Step completion and approval operations load the authoritative remote Steps and fail closed if they cannot be verified.
- Deleting a GuGame Star does not delete its HamsterQuest Quest automatically. This preserves remote submissions and assignments.

## Configuration

The runtime requires:

```text
STAR_MASTER_API_BASE_URL=https://test.api.hamsterquest.com/api/v1/integrations/star-master
STAR_MASTER_API_KEY_FILE=/etc/gugame/star-master-api-key
STAR_MASTER_HOUSE_OWNER_ID=6a4b21be145d32aabea2e0c7
```

The key file must remain outside the repository with mode `600`. Never place the API key in committed files or command output.

## Migration command

The migration is dry-run by default and runs in explicit phases:

```bash
cd /home/pat/projects/GuGame/backend
npm run migrate:star-master -- --phase=plan
npm run migrate:star-master -- --phase=houses --apply
npm run migrate:star-master -- --phase=tags --apply
npm run migrate:star-master -- --phase=quests --apply
npm run migrate:star-master -- --phase=verify
```

The documented integration API has no Tag endpoint. The one-time Tag phase therefore required an explicit `HAMSTERQUEST_MONGODB_URI` and performed create-only writes against the test database. It did not modify or delete existing Tags.

Cleanup has two safety gates: an explicit confirmation and a non-empty absolute checkpoint path. It also runs the full remote verifier and refuses to continue if any user has local Step or Quest-reward progress.

```bash
npm run migrate:star-master -- \
  --phase=cleanup \
  --apply \
  --confirm-cleanup=REMOVE_LOCAL_QUEST_DATA \
  --checkpoint=/absolute/path/to/gugame.archive.gz
```

## Checkpoint and rollback

The pre-migration checkpoint is intentionally ignored by Git:

```text
backend/migration/checkpoints/20260815-before-star-master/
```

It contains a compressed full GuGame archive, external collection snapshots, API JSON snapshots, and verified SHA-256 checksums. To restore the complete GuGame database into a recovery database without overwriting the live database:

```bash
gzip -dc backend/migration/checkpoints/20260815-before-star-master/gugame.archive.gz \
  | mongorestore --archive --nsFrom='gugame.*' --nsTo='gugame_recovery.*'
```

Inspect `gugame_recovery` before any live restore. Do not restore directly over `gugame` without a separate, current backup.

## Preserved legacy scope

Twelve older `star-master` links were deliberately excluded from cleanup: four gateway Stars on a Discipline map and eight Stars in inactive Topics. Their remote IDs are absent from the current test integration catalog. They remain unchanged so this migration cannot destroy inactive or legacy content.

## Verification evidence

- Backend tests: 59 passed, 0 failed.
- Backend TypeScript build: passed.
- Frontend production build: passed.
- Migration verifier after cleanup: 3 Houses, 19 Topics, 80 Stars, 0 issues.
- Runtime integration check: 80/80 hydrated from HamsterQuest; 0 migrated Stars retain local Quest content.
