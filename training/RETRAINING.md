# Retraining the Filler AI Model

## Prerequisites

- Python venv at `training/.venv` with all deps installed
- `DATABASE_URL` set in `.env.local` (Neon Postgres connection string)
- `lib/ai/model.onnx` will be overwritten — commit the old one first if you want to keep it

---

## Manual retraining steps

### 1. Activate the venv

```bash
# Windows
training/.venv/Scripts/activate

# macOS / Linux
source training/.venv/bin/activate
```

### 2. Train on all games (self-play + human)

```bash
# From repo root
training/.venv/Scripts/python.exe training/train.py --include-human-games
```

This pulls all completed games from the DB, prints a source breakdown, trains for
20 epochs, saves `training/checkpoints/best.pt`, and exits.

To skip training when fewer than N human games exist (useful in CI):

```bash
training/.venv/Scripts/python.exe training/train.py --include-human-games --min-new-games 50
# exits 0 silently if < 50 human games exist
```

### 3. Export to ONNX

```bash
training/.venv/Scripts/python.exe training/export_onnx.py
```

This loads `training/checkpoints/best.pt`, exports `lib/ai/model.onnx`, verifies
the ONNX output matches PyTorch within 1e-5, and upserts a row in `model_versions`.

> **Windows note:** prefix both commands with `PYTHONIOENCODING=utf-8` to avoid
> cp1252 encoding errors from torch/ort log messages:
> ```
> PYTHONIOENCODING=utf-8 training/.venv/Scripts/python.exe training/train.py ...
> ```

### 4. Update `ONNX_VERSION_TAG` in export_onnx.py

Before exporting bump the version string so the DB row is meaningful:

```python
# training/export_onnx.py
ONNX_VERSION_TAG = "v2-human-trained"   # increment each time
```

### 5. Commit and push

```bash
git add lib/ai/model.onnx
git commit -m "model: retrain vN on X games"
git push
```

Vercel picks up the new `model.onnx` on the next deploy automatically.

---

## Updating `model_versions` after retraining

`export_onnx.py` handles this automatically via `ON CONFLICT DO UPDATE`.
To check the current entry:

```sql
SELECT version, game_count, trained_at, notes
FROM   model_versions
ORDER  BY trained_at DESC
LIMIT  5;
```

---

## GitHub Actions automated retraining

The workflow `.github/workflows/retrain.yml` runs nightly at 02:00 UTC.

**Required secret:** add `DATABASE_URL` in GitHub repo settings →
*Settings → Secrets and variables → Actions → New repository secret*.

The workflow skips training if fewer than 20 human games have been played since
the last run (controlled by `--min-new-games 20`). If training runs, the new
`model.onnx` is committed with `[skip ci]` in the message to prevent an
infinite workflow loop, then pushed to `main`.

To trigger manually: *Actions → Retrain model → Run workflow*.
